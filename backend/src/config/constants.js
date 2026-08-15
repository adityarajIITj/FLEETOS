module.exports = {
  ROLES: { ADMIN: 'admin', DISPATCHER: 'dispatcher', DRIVER: 'driver', CLIENT: 'client' },
  VEHICLE_TYPES: ['light', 'medium', 'heavy', 'refrigerated'],
  VEHICLE_STATUSES: ['available', 'en_route', 'maintenance', 'idle'],
  SHIPMENT_STATUSES: ['pending', 'allocated', 'picked_up', 'in_transit', 'delivered', 'cancelled'],
  // Valid status transitions
  STATUS_TRANSITIONS: {
    pending: ['allocated', 'cancelled'],
    allocated: ['picked_up', 'cancelled'],
    picked_up: ['in_transit', 'cancelled'],
    in_transit: ['delivered', 'cancelled'],
    delivered: [],
    cancelled: []
  },
  PRIORITIES: ['low', 'medium', 'high', 'urgent'],
  FUEL_COST_PER_KM: { diesel: 8, petrol: 10, electric: 3, cng: 6 }, // INR approx
};
