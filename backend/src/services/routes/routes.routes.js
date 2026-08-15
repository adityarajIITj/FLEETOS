const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { run, get, all } = require('../../config/database');
const { authenticate, requireRole } = require('../../middleware/auth');
const { computeRoute, computeMultiStop } = require('../../algorithms/routeOptimizer');
const cache = require('../../cache/memoryCache');

const router = Router();

// Compute route — checks stored routes first, then OSRM, then haversine fallback
router.post('/compute', authenticate, requireRole('admin', 'dispatcher'), async (req, res) => {
  try {
    const { origin_lat, origin_lng, dest_lat, dest_lng, vehicle_id, shipment_id } = req.body;
    if (origin_lat == null || origin_lng == null || dest_lat == null || dest_lng == null) {
      return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'origin and destination coordinates required' } });
    }

    // Check cache first (avoid re-calling OSRM for same route)
    const cacheKey = `route:${origin_lat},${origin_lng}:${dest_lat},${dest_lng}`;
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ success: true, data: cached, meta: { from_cache: true } });

    // Get vehicle info for fuel cost calc
    let vehicleType = 'medium', fuelType = 'diesel';
    if (vehicle_id) {
      const v = get('SELECT type, fuel_type FROM vehicles WHERE id = ?', [vehicle_id]);
      if (v) { vehicleType = v.type; fuelType = v.fuel_type; }
    }

    const result = await computeRoute(origin_lat, origin_lng, dest_lat, dest_lng, vehicleType, fuelType);

    // Store in DB
    const id = uuid();
    run(`INSERT INTO routes (id, vehicle_id, shipment_id, origin_lat, origin_lng, dest_lat, dest_lng, waypoints, polyline, distance_km, estimated_hours, estimated_cost, source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, vehicle_id || null, shipment_id || null, origin_lat, origin_lng, dest_lat, dest_lng,
        result.waypoints, result.polyline, result.distance_km, result.estimated_hours, result.estimated_cost, result.source]);

    // Link to shipment if provided
    if (shipment_id) {
      run('UPDATE shipments SET assigned_route = ?, cost_estimate = ? WHERE id = ?', [id, result.estimated_cost, shipment_id]);
    }

    const routeData = { id, ...result, origin_lat, origin_lng, dest_lat, dest_lng };

    // Cache for 15 min
    cache.set(cacheKey, routeData, 15 * 60 * 1000);

    res.status(201).json({ success: true, data: routeData });
  } catch (err) {
    console.error('[Route] Error:', err.message);
    res.status(500).json({ success: false, error: { code: 'ROUTE_ERROR', message: err.message } });
  }
});

const axios = require('axios');

// Geocoding Proxy Endpoint — Resolves real places to coordinates (e.g. Sambhal, Moradabad, UP)
router.get('/geocode', authenticate, async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION', message: 'Search query q is required' } });
  }

  const cleanQuery = query.trim();
  const cacheKey = `geocode:${cleanQuery.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json({ success: true, data: cached, meta: { from_cache: true } });

  try {
    // 1. Try Nominatim OpenStreetMap
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&addressdetails=1&limit=5`;
    const { data: nomResults } = await axios.get(nominatimUrl, {
      headers: { 'User-Agent': 'FleetOS-Logistics-Platform/2.0 (contact@fleetos.io)' },
      timeout: 5000,
    });

    if (Array.isArray(nomResults) && nomResults.length > 0) {
      const results = nomResults.map(item => ({
        display_name: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        type: item.type || item.class,
        city: item.address?.city || item.address?.town || item.address?.village || item.address?.county || '',
        state: item.address?.state || '',
        country: item.address?.country || '',
      }));

      cache.set(cacheKey, results, 60 * 60 * 1000); // 1 hr cache
      return res.json({ success: true, data: results });
    }
  } catch (err) {
    console.warn(`[Geocode] Nominatim failed: ${err.message}, attempting Photon fallback`);
  }

  try {
    // 2. Try Photon as fallback
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleanQuery)}&limit=5`;
    const { data: photonData } = await axios.get(photonUrl, { timeout: 4000 });

    if (photonData?.features && photonData.features.length > 0) {
      const results = photonData.features.map(f => {
        const p = f.properties || {};
        const coords = f.geometry?.coordinates || [0, 0];
        const nameParts = [p.name, p.city, p.state, p.country].filter(Boolean);
        return {
          display_name: nameParts.join(', '),
          lat: coords[1],
          lng: coords[0],
          type: p.type || 'place',
          city: p.city || p.name || '',
          state: p.state || '',
          country: p.country || '',
        };
      });

      cache.set(cacheKey, results, 60 * 60 * 1000);
      return res.json({ success: true, data: results });
    }
  } catch (err) {
    console.warn(`[Geocode] Photon fallback failed: ${err.message}`);
  }

  return res.json({ success: true, data: [], message: 'No locations matched the search query' });
});

// Route history for a vehicle
router.get('/history/:vehicleId', authenticate, (req, res) => {
  const routes = all('SELECT * FROM routes WHERE vehicle_id = ? ORDER BY computed_at DESC LIMIT 20', [req.params.vehicleId]);
  res.json({ success: true, data: routes });
});

// Get stored route by ID
router.get('/:id', authenticate, (req, res) => {
  const route = get('SELECT * FROM routes WHERE id = ?', [req.params.id]);
  if (!route) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
  res.json({ success: true, data: route });
});

module.exports = router;

