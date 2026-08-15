const { Router } = require('express');
const { run, get, all } = require('../../config/database');
const { authenticate, requireRole } = require('../../middleware/auth');
const { allocate, batchAllocate } = require('../../algorithms/allocator');
const eventBus = require('../../realtime/eventBus');

const router = Router();

// Auto-allocate all pending shipments to best-fit vehicles
router.post('/auto', authenticate, requireRole('admin', 'dispatcher'), (req, res) => {
  const pending = all("SELECT * FROM shipments WHERE status = 'pending'");
  if (pending.length === 0) return res.json({ success: true, data: { allocated: 0, results: [], message: 'No pending shipments' } });

  const available = all("SELECT * FROM vehicles WHERE status = 'available' AND current_lat IS NOT NULL AND assigned_driver IS NOT NULL");
  if (available.length === 0) return res.json({ success: true, data: { allocated: 0, results: [], message: 'No available vehicles with assigned drivers' } });

  const results = batchAllocate(pending, available);
  let allocated = 0;

  for (const r of results) {
    if (r.vehicle_id) {
      run("UPDATE shipments SET status = 'allocated', assigned_vehicle = ? WHERE id = ?", [r.vehicle_id, r.shipment_id]);
      run("UPDATE vehicles SET status = 'en_route' WHERE id = ?", [r.vehicle_id]);
      allocated++;
      eventBus.emit('shipment:status_update', { shipmentId: r.shipment_id, status: 'allocated', vehicleId: r.vehicle_id });
    }
  }

  res.json({ success: true, data: { allocated, total_pending: pending.length, results } });
});

// Manual assignment
router.post('/manual', authenticate, requireRole('admin', 'dispatcher'), (req, res) => {
  const { shipment_id, vehicle_id, driver_id } = req.body;
  if (!shipment_id || (!vehicle_id && !driver_id)) return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'shipment_id and (vehicle_id or driver_id) required' } });

  const shipment = get('SELECT * FROM shipments WHERE id = ?', [shipment_id]);
  if (!shipment) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Shipment not found' } });

  let vehicle;
  if (vehicle_id) {
    vehicle = get('SELECT * FROM vehicles WHERE id = ?', [vehicle_id]);
  } else {
    vehicle = get("SELECT * FROM vehicles WHERE assigned_driver = ? AND status != 'retired'", [driver_id]);
  }

  if (!vehicle) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Linked vehicle not found' } });
  
  if (!vehicle.assigned_driver) return res.status(400).json({ success: false, error: { code: 'NO_DRIVER', message: 'Vehicle must have an assigned driver before allocation' } });

  if (shipment.weight_kg > vehicle.capacity_kg) {
    return res.status(400).json({ success: false, error: { code: 'OVERWEIGHT', message: `Shipment (${shipment.weight_kg}kg) exceeds vehicle capacity (${vehicle.capacity_kg}kg)` } });
  }

  run("UPDATE shipments SET status = 'allocated', assigned_vehicle = ?, assigned_driver = ? WHERE id = ?", [vehicle.id, vehicle.assigned_driver, shipment_id]);
  run("UPDATE vehicles SET status = 'en_route' WHERE id = ?", [vehicle.id]);
  eventBus.emit('shipment:status_update', { shipmentId: shipment_id, status: 'allocated', vehicleId: vehicle.id });

  res.json({ success: true, data: get('SELECT * FROM shipments WHERE id = ?', [shipment_id]) });
});

// Pending (unallocated) shipments
router.get('/pending', authenticate, (req, res) => {
  const pending = all("SELECT * FROM shipments WHERE status = 'pending' ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at ASC");
  res.json({ success: true, data: pending });
});

module.exports = router;
