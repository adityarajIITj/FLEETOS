const axios = require('axios');
const { haversine, estimateETA } = require('./haversine');
const { FUEL_COST_PER_KM } = require('../config/constants');

const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const OSRM_TIMEOUT_MS = 5000;

/**
 * Get route from OSRM. Auto-falls back to haversine on timeout/error.
 */
async function computeRoute(originLat, originLng, destLat, destLng, vehicleType = 'medium', fuelType = 'diesel') {
  try {
    const url = `${OSRM_BASE}/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson`;
    const { data } = await axios.get(url, { timeout: OSRM_TIMEOUT_MS });

    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceKm = route.distance / 1000;
      const estimatedHours = route.duration / 3600;
      const cost = distanceKm * (FUEL_COST_PER_KM[fuelType] || 8);

      return {
        source: 'osrm',
        distance_km: Math.round(distanceKm * 100) / 100,
        estimated_hours: Math.round(estimatedHours * 100) / 100,
        estimated_cost: Math.round(cost * 100) / 100,
        polyline: JSON.stringify(route.geometry),
        waypoints: JSON.stringify(data.waypoints.map(w => ({ lat: w.location[1], lng: w.location[0], name: w.name }))),
      };
    }
  } catch (err) {
    console.warn(`[Route] OSRM failed (${err.message}), using haversine fallback`);
  }

  // Haversine fallback
  return haversineFallback(originLat, originLng, destLat, destLng, vehicleType, fuelType);
}

function haversineFallback(originLat, originLng, destLat, destLng, vehicleType, fuelType) {
  const distanceKm = haversine(originLat, originLng, destLat, destLng) * 1.3; // road factor
  const estimatedHours = estimateETA(distanceKm, vehicleType);
  const cost = distanceKm * (FUEL_COST_PER_KM[fuelType] || 8);

  return {
    source: 'haversine_fallback',
    distance_km: Math.round(distanceKm * 100) / 100,
    estimated_hours: Math.round(estimatedHours * 100) / 100,
    estimated_cost: Math.round(cost * 100) / 100,
    polyline: JSON.stringify({
      type: 'LineString',
      coordinates: [[originLng, originLat], [destLng, destLat]]
    }),
    waypoints: JSON.stringify([
      { lat: originLat, lng: originLng, name: 'Origin' },
      { lat: destLat, lng: destLng, name: 'Destination' }
    ]),
  };
}

/**
 * Multi-stop: order stops by nearest-neighbor, then get OSRM route per leg.
 */
async function computeMultiStop(stops, vehicleType = 'medium', fuelType = 'diesel') {
  if (stops.length < 2) throw new Error('Need at least 2 stops');

  // Nearest-neighbor ordering
  const ordered = [stops[0]];
  const remaining = stops.slice(1);
  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1];
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversine(last.lat, last.lng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  }

  // Build OSRM waypoints string
  const coords = ordered.map(s => `${s.lng},${s.lat}`).join(';');
  try {
    const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const { data } = await axios.get(url, { timeout: OSRM_TIMEOUT_MS });
    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceKm = route.distance / 1000;
      return {
        source: 'osrm',
        ordered_stops: ordered,
        distance_km: Math.round(distanceKm * 100) / 100,
        estimated_hours: Math.round(route.duration / 3600 * 100) / 100,
        estimated_cost: Math.round(distanceKm * (FUEL_COST_PER_KM[fuelType] || 8) * 100) / 100,
        polyline: JSON.stringify(route.geometry),
      };
    }
  } catch (err) {
    console.warn(`[Route] Multi-stop OSRM failed: ${err.message}`);
  }

  // Fallback: sum haversine legs
  let totalDist = 0;
  for (let i = 0; i < ordered.length - 1; i++) {
    totalDist += haversine(ordered[i].lat, ordered[i].lng, ordered[i + 1].lat, ordered[i + 1].lng) * 1.3;
  }
  return {
    source: 'haversine_fallback',
    ordered_stops: ordered,
    distance_km: Math.round(totalDist * 100) / 100,
    estimated_hours: Math.round(estimateETA(totalDist, vehicleType) * 100) / 100,
    estimated_cost: Math.round(totalDist * (FUEL_COST_PER_KM[fuelType] || 8) * 100) / 100,
    polyline: JSON.stringify({ type: 'LineString', coordinates: ordered.map(s => [s.lng, s.lat]) }),
  };
}

module.exports = { computeRoute, computeMultiStop };
