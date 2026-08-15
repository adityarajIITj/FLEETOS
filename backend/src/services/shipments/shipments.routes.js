const { Router } = require('express');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const Joi = require('joi');
const path = require('path');
const multer = require('multer');
const { run, get, all } = require('../../config/database');
const { authenticate } = require('../../middleware/auth');
const { STATUS_TRANSITIONS } = require('../../config/constants');
const { haversine, estimateETA } = require('../../algorithms/haversine');
const cache = require('../../cache/memoryCache');
const eventBus = require('../../realtime/eventBus');

// Multer for POD uploads — 5MB, images only
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', '..', 'uploads'),
  filename: (req, file, cb) => cb(null, `pod-${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

const router = Router();

const shipmentSchema = Joi.object({
  cargo_type: Joi.string().max(100).required(),
  weight_kg: Joi.number().positive().required(),
  volume_m3: Joi.number().positive().allow(null),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
  origin_address: Joi.string().required(),
  origin_lat: Joi.number().min(-90).max(90).required(),
  origin_lng: Joi.number().min(-180).max(180).required(),
  dest_address: Joi.string().required(),
  dest_lat: Joi.number().min(-90).max(90).required(),
  dest_lng: Joi.number().min(-180).max(180).required(),
  requires_vehicle_type: Joi.string().valid('light', 'medium', 'heavy', 'refrigerated').allow(null),
  client_name: Joi.string().max(100).allow(null),
  client_email: Joi.string().email().allow(null),
  client_phone: Joi.string().max(20).allow(null),
  scheduled_pickup: Joi.string().allow(null),
  deadline: Joi.string().allow(null),
  special_instructions: Joi.string().allow(null),
  assigned_driver: Joi.string().uuid().allow(null),
  assigned_vehicle: Joi.string().uuid().allow(null)
});

router.post('/', authenticate, (req, res) => {
  const { error, value } = shipmentSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: error.details[0].message } });

  const id = uuid();
  const tracking_token = crypto.randomBytes(16).toString('hex');

  let v = null;
  if (value.assigned_vehicle) {
    v = get("SELECT id, assigned_driver FROM vehicles WHERE id = ? AND status != 'retired'", [value.assigned_vehicle]);
  } else if (value.assigned_driver) {
    v = get("SELECT id, assigned_driver FROM vehicles WHERE assigned_driver = ? AND status != 'retired'", [value.assigned_driver]);
  }

  if ((value.assigned_vehicle || value.assigned_driver) && !v) {
    return res.status(400).json({ success: false, error: { code: 'NOT_FOUND', message: 'Assigned Vehicle/Driver not found or invalid' } });
  }

  const initialStatus = v ? 'allocated' : 'pending';

  run(`INSERT INTO shipments (id, tracking_token, status, cargo_type, weight_kg, volume_m3, priority,
    origin_address, origin_lat, origin_lng, dest_address, dest_lat, dest_lng,
    requires_vehicle_type, client_name, client_email, client_phone,
    scheduled_pickup, deadline, special_instructions, created_by, assigned_vehicle, assigned_driver)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, tracking_token, initialStatus, value.cargo_type, value.weight_kg, value.volume_m3 || null, value.priority,
      value.origin_address, value.origin_lat, value.origin_lng, value.dest_address, value.dest_lat, value.dest_lng,
      value.requires_vehicle_type || null, value.client_name || null, value.client_email || null, value.client_phone || null,
      value.scheduled_pickup || null, value.deadline || null, value.special_instructions || null, req.user.id,
      v ? v.id : null, v ? v.assigned_driver : null]);

  if (v) {
    run("UPDATE vehicles SET status = 'en_route' WHERE id = ?", [v.id]);
    eventBus.emit('shipment:status_update', { shipmentId: id, status: 'allocated', vehicleId: v.id });
  }

  const shipment = get('SELECT * FROM shipments WHERE id = ?', [id]);
  res.status(201).json({ success: true, data: shipment });
});

router.get('/', authenticate, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const status = req.query.status;

  const conditions = [];
  const params = [];

  // IDOR & Role Isolation: Driver can only view their assigned shipments
  if (req.user.role === 'driver') {
    conditions.push('(s.assigned_driver = ? OR s.assigned_vehicle IN (SELECT id FROM vehicles WHERE assigned_driver = ?))');
    params.push(req.user.id, req.user.id);
  }

  // IDOR & Role Isolation: Client can only view their own shipments
  if (req.user.role === 'client') {
    conditions.push('(s.created_by = ? OR s.client_email = ?)');
    params.push(req.user.id, req.user.email);
  }

  if (status) {
    conditions.push('s.status = ?');
    params.push(status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) as count FROM shipments s ${where}`, params);
  params.push(limit, offset);
  const shipments = all(`SELECT s.*, v.registration_no as vehicle_reg FROM shipments s
    LEFT JOIN vehicles v ON s.assigned_vehicle = v.id ${where}
    ORDER BY s.created_at DESC LIMIT ? OFFSET ?`, params);

  res.json({ success: true, data: shipments, meta: { page, limit, total: total ? total.count : 0 } });
});

router.get('/:id', authenticate, (req, res) => {
  const shipment = get(`SELECT s.*, v.registration_no as vehicle_reg, v.current_lat as vehicle_lat, v.current_lng as vehicle_lng
    FROM shipments s LEFT JOIN vehicles v ON s.assigned_vehicle = v.id WHERE s.id = ?`, [req.params.id]);
  if (!shipment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });

  // IDOR check for driver
  if (req.user.role === 'driver') {
    const isAssigned = shipment.assigned_driver === req.user.id;
    const vehicle = get('SELECT id FROM vehicles WHERE assigned_driver = ?', [req.user.id]);
    const isVehicleAssigned = vehicle && shipment.assigned_vehicle === vehicle.id;
    if (!isAssigned && !isVehicleAssigned) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this shipment.' } });
    }
  }

  // IDOR check for client
  if (req.user.role === 'client') {
    if (shipment.created_by !== req.user.id && shipment.client_email !== req.user.email) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this shipment.' } });
    }
  }

  res.json({ success: true, data: shipment });
});

// Admin / Dispatcher Delete / Archive Shipment
router.delete('/:id', authenticate, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'dispatcher') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
  }

  const shipment = get('SELECT id FROM shipments WHERE id = ?', [req.params.id]);
  if (!shipment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });

  run('DELETE FROM shipments WHERE id = ?', [req.params.id]);
  res.json({ success: true, data: { message: 'Shipment deleted successfully' } });
});

// Status lifecycle with valid transitions
router.put('/:id/status', authenticate, (req, res) => {
  if (req.user.role === 'client') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Clients cannot update shipment status.' } });
  }

  const { status } = req.body;
  if (!status) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'status required' } });

  const shipment = get('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
  if (!shipment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });

  // IDOR Protection: Drivers can only update their own shipments
  if (req.user.role === 'driver') {
    const vehicle = get('SELECT id FROM vehicles WHERE assigned_driver = ?', [req.user.id]);
    if (!vehicle || shipment.assigned_vehicle !== vehicle.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You can only update shipments assigned to your vehicle.' } });
    }
  }

  const allowed = STATUS_TRANSITIONS[shipment.status] || [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_TRANSITION', message: `Cannot transition from '${shipment.status}' to '${status}'. Allowed: ${allowed.join(', ')}` } });
  }

  const updates = [`status = ?`];
  const params = [status];

  if (status === 'picked_up') { updates.push('actual_pickup = datetime("now")'); }
  if (status === 'delivered') {
    updates.push('actual_delivery = datetime("now")');
    // Free up the vehicle
    if (shipment.assigned_vehicle) {
      run("UPDATE vehicles SET status = 'available' WHERE id = ?", [shipment.assigned_vehicle]);
    }
  }

  params.push(req.params.id);
  run(`UPDATE shipments SET ${updates.join(', ')} WHERE id = ?`, params);

  eventBus.emit('shipment:status_update', { shipmentId: req.params.id, status, vehicleId: shipment.assigned_vehicle });

  res.json({ success: true, data: get('SELECT * FROM shipments WHERE id = ?', [req.params.id]) });
});

// Public tracking — NO AUTH
router.get('/track/:token', (req, res) => {
  const shipment = get(`SELECT s.id, s.tracking_token, s.status, s.cargo_type, s.origin_address, s.dest_address,
    s.origin_lat, s.origin_lng, s.dest_lat, s.dest_lng, s.priority,
    s.actual_pickup, s.actual_delivery, s.scheduled_pickup, s.deadline,
    v.id as vehicle_id, v.registration_no, v.current_lat as vehicle_lat, v.current_lng as vehicle_lng, v.current_speed as vehicle_speed
    FROM shipments s LEFT JOIN vehicles v ON s.assigned_vehicle = v.id
    WHERE s.tracking_token = ?`, [req.params.token]);

  if (!shipment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });

  // Compute live ETA if in transit
  let eta_minutes = null;
  if (shipment.vehicle_lat && shipment.vehicle_lng && ['in_transit', 'picked_up'].includes(shipment.status)) {
    const dist = haversine(shipment.vehicle_lat, shipment.vehicle_lng, shipment.dest_lat, shipment.dest_lng) * 1.3;
    eta_minutes = Math.round(estimateETA(dist) * 60);
  }

  res.json({ success: true, data: { ...shipment, eta_minutes } });
});

// POD upload
router.post('/:id/pod', authenticate, upload.single('pod'), (req, res) => {
  if (req.user.role === 'client') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Clients cannot upload PODs.' } });
  }

  if (!req.file) return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No image uploaded' } });

  const shipment = get('SELECT id, assigned_vehicle FROM shipments WHERE id = ?', [req.params.id]);
  if (!shipment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });

  // IDOR Protection: Drivers can only upload PODs for their own shipments
  if (req.user.role === 'driver') {
    const vehicle = get('SELECT id FROM vehicles WHERE assigned_driver = ?', [req.user.id]);
    if (!vehicle || shipment.assigned_vehicle !== vehicle.id) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You can only upload PODs for shipments assigned to your vehicle.' } });
    }
  }

  const imageUrl = `/uploads/${req.file.filename}`;
  run('UPDATE shipments SET pod_image_url = ? WHERE id = ?', [imageUrl, req.params.id]);
  res.json({ success: true, data: { pod_image_url: imageUrl } });
});

// ETA endpoint — uses OSRM real-time from vehicle position to destination
router.get('/:id/eta', authenticate, async (req, res) => {
  const shipment = get(`SELECT s.*, v.current_lat as vehicle_lat, v.current_lng as vehicle_lng, v.type as vehicle_type
    FROM shipments s LEFT JOIN vehicles v ON s.assigned_vehicle = v.id WHERE s.id = ?`, [req.params.id]);
  if (!shipment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });

  // IDOR check for client
  if (req.user.role === 'client') {
    if (shipment.created_by !== req.user.id && shipment.client_email !== req.user.email) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied to this shipment.' } });
    }
  }

  if (!shipment.vehicle_lat || !shipment.vehicle_lng) {
    return res.json({ success: true, data: { eta_minutes: null, message: 'Vehicle location unavailable' } });
  }

  // Try OSRM real-time first
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${shipment.vehicle_lng},${shipment.vehicle_lat};${shipment.dest_lng},${shipment.dest_lat}?overview=false`;
    const osrmRes = await fetch(url);
    const osrmData = await osrmRes.json();
    if (osrmData.routes && osrmData.routes.length > 0) {
      const r = osrmData.routes[0];
      return res.json({ success: true, data: {
        eta_minutes: Math.round(r.duration / 60),
        distance_km: (r.distance / 1000).toFixed(1),
        source: 'osrm_live'
      }});
    }
  } catch(e) { /* fall through */ }

  // Haversine fallback
  const dist = haversine(shipment.vehicle_lat, shipment.vehicle_lng, shipment.dest_lat, shipment.dest_lng) * 1.3;
  const hours = estimateETA(dist, shipment.vehicle_type || 'medium');
  res.json({ success: true, data: { eta_minutes: Math.round(hours * 60), distance_km: dist.toFixed(1), source: 'haversine_estimate' } });
});

// --- Fleet Analytics ---
router.get('/analytics/summary', authenticate, (req, res) => {
  if (req.user.role === 'client') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Clients cannot access fleet analytics.' } });
  }

  const totalVehicles = get('SELECT COUNT(*) as c FROM vehicles').c;
  const enRoute = get("SELECT COUNT(*) as c FROM vehicles WHERE status='en_route'").c;
  const available = get("SELECT COUNT(*) as c FROM vehicles WHERE status='available'").c;
  const maintenance = get("SELECT COUNT(*) as c FROM vehicles WHERE status='maintenance'").c;

  const totalShipments = get('SELECT COUNT(*) as c FROM shipments').c;
  const pending = get("SELECT COUNT(*) as c FROM shipments WHERE status='pending'").c;
  const inTransit = get("SELECT COUNT(*) as c FROM shipments WHERE status IN ('in_transit','picked_up')").c;
  const delivered = get("SELECT COUNT(*) as c FROM shipments WHERE status='delivered'").c;

  const fuelBreakdown = all("SELECT fuel_type, COUNT(*) as count FROM vehicles GROUP BY fuel_type");
  const typeBreakdown = all("SELECT type, COUNT(*) as count FROM vehicles GROUP BY type");

  const totalWeight = get("SELECT COALESCE(SUM(weight_kg),0) as w FROM shipments WHERE status != 'cancelled'").w;
  const urgentCount = get("SELECT COUNT(*) as c FROM shipments WHERE priority='urgent'").c;

  const gpsEvents24h = get("SELECT COUNT(*) as c FROM gps_events WHERE timestamp > datetime('now','-1 day')").c;

  const avgDeliveryTime = get(`SELECT AVG(
    (julianday(actual_delivery) - julianday(actual_pickup)) * 24 * 60
  ) as avg_min FROM shipments WHERE actual_delivery IS NOT NULL AND actual_pickup IS NOT NULL`);

  res.json({ success: true, data: {
    fleet: { total: totalVehicles, en_route: enRoute, available, maintenance },
    shipments: { total: totalShipments, pending, in_transit: inTransit, delivered },
    fuel_breakdown: fuelBreakdown,
    type_breakdown: typeBreakdown,
    total_cargo_weight_kg: totalWeight,
    urgent_shipments: urgentCount,
    gps_events_24h: gpsEvents24h,
    avg_delivery_minutes: avgDeliveryTime?.avg_min ? Math.round(avgDeliveryTime.avg_min) : null
  }});
});

module.exports = router;
