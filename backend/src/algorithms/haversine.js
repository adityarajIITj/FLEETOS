// Haversine formula — distance between two lat/lng points in km
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) { return deg * Math.PI / 180; }

// ETA in hours from haversine distance + assumed avg speed
function estimateETA(distanceKm, vehicleType = 'medium') {
  const speeds = { light: 60, medium: 50, heavy: 40, refrigerated: 45 };
  const avgSpeed = speeds[vehicleType] || 50;
  // Time-of-day factor: rush hours are slower
  const hour = new Date().getHours();
  const factor = (hour >= 8 && hour <= 10) || (hour >= 17 && hour <= 19) ? 1.3 : 1.0;
  return (distanceKm / avgSpeed) * factor;
}

module.exports = { haversine, estimateETA };
