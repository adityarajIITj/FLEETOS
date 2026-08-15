const { Router } = require('express');
const { v4: uuid } = require('uuid');
const Joi = require('joi');
const { run, get, all } = require('../../config/database');
const { authenticate, requireRole } = require('../../middleware/auth');
const cache = require('../../cache/memoryCache');
const eventBus = require('../../realtime/eventBus');

const router = Router();

// --- Vehicle CRUD ---

const vehicleSchema = Joi.object({
  registration_no: Joi.string().max(20).required(),
  type: Joi.string().valid('light', 'medium', 'heavy', 'refrigerated').required(),
  capacity_kg: Joi.number().positive().required(),
  capacity_m3: Joi.number().positive().allow(null),
  fuel_type: Joi.string().valid('diesel', 'petrol', 'electric', 'cng').required(),
  current_lat: Joi.number().min(-90).max(90).allow(null),
  current_lng: Joi.number().min(-180).max(180).allow(null),
  assigned_driver: Joi.string().uuid().required(),
});

router.get('/vehicles', authenticate, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const status = req.query.status;

  const conditions = [];
  const params = [];

  // IDOR & Role Isolation: Driver can only access their assigned vehicle
  if (req.user.role === 'driver') {
    conditions.push('v.assigned_driver = ?');
    params.push(req.user.id);
  }

  if (status) {
    conditions.push('v.status = ?');
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) as count FROM vehicles v ${where}`, params);
  params.push(limit, offset);
  const vehicles = all(`SELECT v.*, u.name as driver_name FROM vehicles v LEFT JOIN users u ON v.assigned_driver = u.id ${where} ORDER BY v.created_at DESC LIMIT ? OFFSET ?`, params);

  // Merge live cached positions
  vehicles.forEach(v => {
    const live = cache.get(`vehicle:location:${v.id}`);
    if (live) { v.current_lat = live.lat; v.current_lng = live.lng; v.current_speed = live.speed; }
  });

  res.json({ success: true, data: vehicles, meta: { page, limit, total: total ? total.count : 0 } });
});

router.post('/vehicles', authenticate, requireRole('admin', 'dispatcher'), (req, res) => {
  const { error, value } = vehicleSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: error.details[0].message } });

  const existing = get('SELECT id FROM vehicles WHERE registration_no = ?', [value.registration_no]);
  if (existing) return res.status(409).json({ success: false, error: { code: 'DUPLICATE', message: 'Registration number already exists' } });

  const driver = get("SELECT id FROM users WHERE id = ? AND role = 'driver' AND is_active = 1", [value.assigned_driver]);
  if (!driver) return res.status(400).json({ success: false, error: { code: 'INVALID_DRIVER', message: 'Assigned driver is invalid or inactive' } });

  const existingAssignment = get("SELECT id, registration_no FROM vehicles WHERE assigned_driver = ? AND status != 'retired'", [value.assigned_driver]);
  if (existingAssignment) return res.status(409).json({ success: false, error: { code: 'DUPLICATE_DRIVER', message: `Driver is already assigned to active vehicle ${existingAssignment.registration_no}` } });

  const id = uuid();
  run(`INSERT INTO vehicles (id, registration_no, type, capacity_kg, capacity_m3, fuel_type, current_lat, current_lng, assigned_driver)
    VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, value.registration_no, value.type, value.capacity_kg, value.capacity_m3 || null,
      value.fuel_type, value.current_lat || null, value.current_lng || null, value.assigned_driver || null]);

  const vehicle = get('SELECT * FROM vehicles WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: vehicle });
});

router.get('/vehicles/:id', authenticate, (req, res) => {
  const vehicle = get('SELECT v.*, u.name as driver_name FROM vehicles v LEFT JOIN users u ON v.assigned_driver = u.id WHERE v.id = ?', [req.params.id]);
  if (!vehicle) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });

  const live = cache.get(`vehicle:location:${vehicle.id}`);
  if (live) { vehicle.current_lat = live.lat; vehicle.current_lng = live.lng; vehicle.current_speed = live.speed; }

  res.json({ success: true, data: vehicle });
});

router.put('/vehicles/:id', authenticate, requireRole('admin', 'dispatcher'), (req, res) => {
  const vehicle = get('SELECT id FROM vehicles WHERE id = ?', [req.params.id]);
  if (!vehicle) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });

  if (req.body.assigned_driver !== undefined) {
    const dId = req.body.assigned_driver;
    const driver = get("SELECT id FROM users WHERE id = ? AND role = 'driver' AND is_active = 1", [dId]);
    if (!driver) return res.status(400).json({ success: false, error: { code: 'INVALID_DRIVER', message: 'Assigned driver is invalid or inactive' } });
    const existingAssignment = get("SELECT id, registration_no FROM vehicles WHERE assigned_driver = ? AND id != ? AND status != 'retired'", [dId, req.params.id]);
    if (existingAssignment) return res.status(409).json({ success: false, error: { code: 'DUPLICATE_DRIVER', message: `Driver is already assigned to active vehicle ${existingAssignment.registration_no}` } });
  }

  const fields = ['type', 'capacity_kg', 'capacity_m3', 'fuel_type', 'status', 'assigned_driver'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) { updates.push(`${f} = ?`); params.push(req.body[f]); }
  }
  if (updates.length === 0) return res.status(400).json({ success: false, error: { code: 'NO_FIELDS', message: 'Nothing to update' } });

  params.push(req.params.id);
  run(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ?`, params);
  res.json({ success: true, data: get('SELECT * FROM vehicles WHERE id = ?', [req.params.id]) });
});

router.delete('/vehicles/:id', authenticate, requireRole('admin'), (req, res) => {
  const vehicle = get('SELECT id FROM vehicles WHERE id = ?', [req.params.id]);
  if (!vehicle) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });
  run('DELETE FROM vehicles WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: { message: 'Vehicle deleted' } });
});

// --- GPS Ingestion (critical golden-path endpoint) ---

router.post('/vehicles/:id/location', authenticate, (req, res) => {
  const { lat, lng, speed, heading } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'lat and lng required' } });

  const vehicle = get('SELECT id, assigned_driver FROM vehicles WHERE id = ?', [req.params.id]);
  if (!vehicle) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vehicle not found' } });

  // IDOR Protection: Drivers can only update their assigned vehicle
  if (req.user.role === 'driver' && vehicle.assigned_driver !== req.user.id) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You can only update the location of your assigned vehicle.' } });
  }

  // Update DB
  run('UPDATE vehicles SET current_lat = ?, current_lng = ?, current_speed = ? WHERE id = ?',
    [lat, lng, speed || 0, req.params.id]);
  run('INSERT INTO gps_events (vehicle_id, lat, lng, speed_kmh, heading) VALUES (?,?,?,?,?)',
    [req.params.id, lat, lng, speed || 0, heading || 0]);

  // Update cache (60s TTL)
  cache.set(`vehicle:location:${req.params.id}`, { lat, lng, speed: speed || 0, heading: heading || 0, updatedAt: new Date().toISOString() }, 60000);

  // Broadcast via event bus → Socket.IO
  eventBus.emit('vehicle:update', {
    vehicleId: req.params.id, lat, lng, speed: speed || 0, heading: heading || 0,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, data: { message: 'Location updated' } });
});

// --- GPS History ---

router.get('/vehicles/:id/history', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const events = all('SELECT lat, lng, speed_kmh, heading, timestamp FROM gps_events WHERE vehicle_id = ? ORDER BY timestamp DESC LIMIT ?',
    [req.params.id, limit]);
  res.json({ success: true, data: events });
});

// --- Driver <-> Vehicle Assignment ---
router.post('/driver-with-vehicle', authenticate, requireRole('admin', 'dispatcher'), async (req, res) => {
  const { name, email, password, registration_no, type, capacity_kg, fuel_type, phone } = req.body;
  if (!name || !email || !password || !registration_no) {
    return res.status(400).json({ success: false, error: { message: 'All required fields (name, email, password, registration number) must be provided' } });
  }

  const existingUser = get('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  if (existingUser) return res.status(409).json({ success: false, error: { message: 'A user with this email already exists' } });

  const existingVehicle = get('SELECT id FROM vehicles WHERE registration_no = ?', [registration_no.trim().toUpperCase()]);
  if (existingVehicle) return res.status(409).json({ success: false, error: { message: 'A vehicle with this registration number already exists' } });

  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuid } = require('uuid');
    const hash = await bcrypt.hash(password, 10);
    const driverId = uuid();
    const vehicleId = uuid();

    run(
      'INSERT INTO users (id, name, email, phone, password, role, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [driverId, name.trim(), email.trim().toLowerCase(), phone || null, hash, 'driver']
    );
    run(
      'INSERT INTO vehicles (id, registration_no, type, capacity_kg, fuel_type, assigned_driver, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [vehicleId, registration_no.trim().toUpperCase(), type || 'medium', parseFloat(capacity_kg) || 5000, fuel_type || 'diesel', driverId, 'available']
    );

    res.status(201).json({ success: true, message: 'Driver and Vehicle created successfully', data: { driverId, vehicleId } });
  } catch (err) {
    console.error('Error creating driver and vehicle:', err);
    res.status(500).json({ success: false, error: { message: err.message || 'Failed to create driver and vehicle' } });
  }
});

router.post('/assign', authenticate, requireRole('admin', 'dispatcher'), (req, res) => {
  const { driver_id, vehicle_id, force } = req.body;
  if (!driver_id || !vehicle_id) return res.status(400).json({ success: false, error: { message: 'driver_id and vehicle_id required' } });

  const driver = get("SELECT id, name FROM users WHERE id = ? AND role = 'driver' AND is_active = 1", [driver_id]);
  if (!driver) return res.status(400).json({ success: false, error: { message: 'Driver is invalid or inactive' } });

  const vehicle = get("SELECT id, registration_no, status, assigned_driver FROM vehicles WHERE id = ?", [vehicle_id]);
  if (!vehicle || vehicle.status === 'retired') return res.status(400).json({ success: false, error: { message: 'Vehicle is invalid or retired' } });

  const driverExistingVehicle = get("SELECT id, registration_no FROM vehicles WHERE assigned_driver = ? AND id != ? AND status != 'retired'", [driver_id, vehicle_id]);
  const vehicleHasAnotherDriver = vehicle.assigned_driver && vehicle.assigned_driver !== driver_id;

  if (!force && (driverExistingVehicle || vehicleHasAnotherDriver)) {
    let msg = '';
    if (driverExistingVehicle && vehicleHasAnotherDriver) {
      msg = `Driver ${driver.name} is currently assigned to ${driverExistingVehicle.registration_no}, and Vehicle ${vehicle.registration_no} is currently assigned to another driver. Reassign both?`;
    } else if (driverExistingVehicle) {
      msg = `Driver ${driver.name} is currently assigned to ${driverExistingVehicle.registration_no}. Reassign to ${vehicle.registration_no}?`;
    } else {
      msg = `Vehicle ${vehicle.registration_no} is currently assigned to another driver. Reassign to ${driver.name}?`;
    }
    return res.status(409).json({ success: false, requires_confirmation: true, message: msg });
  }

  // Clear old driver's vehicle if any
  run("UPDATE vehicles SET assigned_driver = NULL WHERE assigned_driver = ?", [driver_id]);
  // Assign driver to new vehicle
  run("UPDATE vehicles SET assigned_driver = ? WHERE id = ?", [driver_id, vehicle_id]);

  res.json({ success: true, message: 'Assignment successful' });
});

// --- Available vehicles for allocation ---

router.get('/available', authenticate, (req, res) => {
  const vehicles = all("SELECT * FROM vehicles WHERE status = 'available' AND current_lat IS NOT NULL AND current_lng IS NOT NULL AND assigned_driver IS NOT NULL");
  res.json({ success: true, data: vehicles });
});

module.exports = router;
