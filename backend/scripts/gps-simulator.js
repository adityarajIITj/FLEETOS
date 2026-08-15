/**
 * GPS Simulator — moves en_route vehicles along a path for demo purposes.
 * Pushes location updates to the API every 10 seconds.
 * Run: npm run simulate
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const axios = require('axios');

const BASE = `http://localhost:${process.env.PORT || 3000}`;
let token = null;

async function login() {
  const { data } = await axios.post(`${BASE}/api/v1/auth/login`, { email: 'arun@fleetos.io', password: 'password123' });
  token = data.data.token;
  console.log('Logged in as driver');
}

async function getEnRouteVehicles() {
  const { data } = await axios.get(`${BASE}/api/v1/fleet/vehicles?status=en_route`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return data.data;
}

// Simulate movement toward destination
function moveToward(currentLat, currentLng, destLat, destLng, stepKm = 0.5) {
  const R = 6371;
  const dLat = destLat - currentLat;
  const dLng = destLng - currentLng;
  const dist = Math.sqrt(dLat * dLat + dLng * dLng);
  if (dist < 0.001) return { lat: destLat, lng: destLng, arrived: true };

  const stepDeg = stepKm / 111; // ~111km per degree
  const ratio = Math.min(stepDeg / dist, 1);
  return {
    lat: +(currentLat + dLat * ratio).toFixed(6),
    lng: +(currentLng + dLng * ratio).toFixed(6),
    arrived: false
  };
}

async function simulate() {
  await login();
  console.log('Starting GPS simulation (Ctrl+C to stop)...\n');

  // Get shipments for destinations
  const { data: shipmentsRes } = await axios.get(`${BASE}/api/v1/shipments?status=in_transit`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const shipmentMap = {};
  for (const s of shipmentsRes.data) {
    if (s.assigned_vehicle) shipmentMap[s.assigned_vehicle] = { destLat: s.dest_lat, destLng: s.dest_lng };
  }

  setInterval(async () => {
    try {
      const vehicles = await getEnRouteVehicles();
      for (const v of vehicles) {
        const dest = shipmentMap[v.id];
        if (!dest) continue;

        const { lat, lng, arrived } = moveToward(
          v.current_lat, v.current_lng, dest.destLat, dest.destLng, 0.3 + Math.random() * 0.4
        );

        const speed = arrived ? 0 : 30 + Math.random() * 50;
        const heading = Math.atan2(dest.destLng - v.current_lng, dest.destLat - v.current_lat) * 180 / Math.PI;

        await axios.post(`${BASE}/api/v1/fleet/vehicles/${v.id}/location`,
          { lat, lng, speed: +speed.toFixed(1), heading: +((heading + 360) % 360).toFixed(1) },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log(`📍 ${v.registration_no}: ${lat}, ${lng} (${speed.toFixed(0)} km/h)${arrived ? ' — ARRIVED!' : ''}`);
      }
    } catch (err) {
      console.error('Sim error:', err.message);
    }
  }, 10000);
}

simulate().catch(console.error);
