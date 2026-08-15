const { haversine } = require('./haversine');

/**
 * Greedy nearest-vehicle allocator.
 * 1. Filter by vehicle type compatibility
 * 2. Filter by weight capacity
 * 3. Rank remaining by distance to shipment origin
 * 4. Return best match
 */
function allocate(shipment, vehicles) {
  let candidates = vehicles.filter(v => {
    // Must be available
    if (v.status !== 'available') return false;
    // Must have GPS position
    if (v.current_lat == null || v.current_lng == null) return false;
    // Weight capacity check
    if (shipment.weight_kg > v.capacity_kg) return false;
    // Vehicle type compatibility
    if (shipment.requires_vehicle_type && v.type !== shipment.requires_vehicle_type) return false;
    return true;
  });

  if (candidates.length === 0) return null;

  // Score by distance to pickup point
  candidates = candidates.map(v => ({
    ...v,
    distance: haversine(v.current_lat, v.current_lng, shipment.origin_lat, shipment.origin_lng)
  }));

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0];
}

/**
 * Batch allocate: match multiple pending shipments to available vehicles.
 * Greedy approach: sort shipments by priority (urgent first), then allocate one by one.
 */
function batchAllocate(shipments, vehicles) {
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...shipments].sort((a, b) =>
    (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  );

  const available = [...vehicles];
  const results = [];

  for (const shipment of sorted) {
    const match = allocate(shipment, available);
    if (match) {
      results.push({ shipment_id: shipment.id, vehicle_id: match.id, distance_km: match.distance });
      // Remove allocated vehicle from pool
      const idx = available.findIndex(v => v.id === match.id);
      if (idx !== -1) available.splice(idx, 1);
    } else {
      results.push({ shipment_id: shipment.id, vehicle_id: null, reason: 'No compatible vehicle available' });
    }
  }

  return results;
}

module.exports = { allocate, batchAllocate };
