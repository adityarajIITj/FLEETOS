/**
 * Seed script — populates FleetOS with demo data.
 * Clustered around Bangalore + Chennai for realistic allocation demos.
 * Run: npm run seed
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const crypto = require('crypto');

async function seed() {
  const { getDb, run, get } = require('../config/database');
  await getDb();

  // Check if already seeded
  const existing = get('SELECT COUNT(*) as count FROM users');
  if (existing.count > 0) {
    console.log('Database already has data. Run with --force to re-seed.');
    if (!process.argv.includes('--force')) return;
    // Clear all tables
    run('DELETE FROM gps_events');
    run('DELETE FROM shipments');
    run('DELETE FROM routes');
    run('DELETE FROM vehicles');
    run('DELETE FROM users');
    console.log('Cleared existing data.');
  }

  const defaultHash = await bcrypt.hash('password123', 10);
  const adminHash = await bcrypt.hash('123', 10);

  // Users
  const users = [
    { id: uuid(), name: 'System Admin', email: 'admin@fleetos.io', role: 'admin', password: adminHash },
    { id: uuid(), name: 'Divyansh Sharma', email: 'sharma2002divyansh@gmail.com', role: 'admin', password: defaultHash },
    { id: uuid(), name: 'Aditya Raj', email: 'b25bs1020@iitj.ac.in', role: 'admin', password: defaultHash },
    { id: uuid(), name: 'Rajesh Kumar', email: 'rajesh@fleetos.io', role: 'dispatcher', password: defaultHash },
    { id: uuid(), name: 'Priya Sharma', email: 'priya@fleetos.io', role: 'dispatcher', password: defaultHash },
    { id: uuid(), name: 'Arun Nair', email: 'arun@fleetos.io', role: 'driver', password: defaultHash },
    { id: uuid(), name: 'Suresh Babu', email: 'suresh@fleetos.io', role: 'driver', password: defaultHash },
    { id: uuid(), name: 'Kavitha R', email: 'kavitha@fleetos.io', role: 'driver', password: defaultHash },
  ];
  for (const u of users) {
    run('INSERT INTO users (id, name, email, password, role) VALUES (?,?,?,?,?)', [u.id, u.name, u.email, u.password || defaultHash, u.role]);
  }

  const drivers = users.filter(u => u.role === 'driver');

  // Vehicles — clustered in Bangalore and Chennai
  const vehicles = [
    { id: uuid(), reg: 'KA-01-AB-1234', type: 'heavy',        cap: 10000, fuel: 'diesel', lat: 12.9716, lng: 77.5946, driver: drivers[0].id }, // Bangalore center
    { id: uuid(), reg: 'KA-01-CD-5678', type: 'medium',       cap: 5000,  fuel: 'diesel', lat: 12.9352, lng: 77.6245, driver: drivers[1].id }, // Koramangala
    { id: uuid(), reg: 'KA-01-EF-9012', type: 'refrigerated', cap: 3000,  fuel: 'diesel', lat: 12.9857, lng: 77.6057, driver: drivers[2].id }, // Indiranagar
    { id: uuid(), reg: 'TN-01-GH-3456', type: 'light',        cap: 1500,  fuel: 'petrol', lat: 13.0827, lng: 80.2707, driver: null },          // Chennai center
    { id: uuid(), reg: 'TN-01-IJ-7890', type: 'heavy',        cap: 12000, fuel: 'diesel', lat: 13.0674, lng: 80.2376, driver: null },          // Chennai T Nagar
    { id: uuid(), reg: 'KA-01-KL-2345', type: 'medium',       cap: 4000,  fuel: 'cng',    lat: 12.9611, lng: 77.6387, driver: null },          // Bangalore HSR
    { id: uuid(), reg: 'KA-02-MN-6789', type: 'light',        cap: 2000,  fuel: 'electric', lat: 12.2958, lng: 76.6394, driver: null },        // Mysore
    { id: uuid(), reg: 'TN-02-OP-0123', type: 'refrigerated', cap: 4000,  fuel: 'diesel', lat: 12.9165, lng: 79.1325, driver: null },          // Vellore
  ];
  for (const v of vehicles) {
    run('INSERT INTO vehicles (id, registration_no, type, capacity_kg, fuel_type, current_lat, current_lng, assigned_driver, status) VALUES (?,?,?,?,?,?,?,?,?)',
      [v.id, v.reg, v.type, v.cap, v.fuel, v.lat, v.lng, v.driver, v.driver ? 'idle' : 'available']);
  }

  // Shipments — mix of pending, allocated, in_transit, delivered
  const shipments = [
    // Pending — awaiting allocation (good for demo)
    { cargo: 'Electronics', weight: 500, priority: 'high', reqType: null,
      oAddr: 'Whitefield, Bangalore', oLat: 12.9698, oLng: 77.7500,
      dAddr: 'Mysore City Center', dLat: 12.2958, dLng: 76.6394, status: 'pending' },
    { cargo: 'Frozen Fish', weight: 1200, priority: 'urgent', reqType: 'refrigerated',
      oAddr: 'Madiwala, Bangalore', oLat: 12.9226, oLng: 77.6174,
      dAddr: 'Electronic City', dLat: 12.8399, dLng: 77.6770, status: 'pending' },
    { cargo: 'Furniture', weight: 3000, priority: 'medium', reqType: 'heavy',
      oAddr: 'Peenya Industrial', oLat: 13.0324, oLng: 77.5199,
      dAddr: 'Hosur', dLat: 12.7409, dLng: 77.8253, status: 'pending' },
    { cargo: 'Medical Supplies', weight: 200, priority: 'urgent', reqType: null,
      oAddr: 'MG Road, Bangalore', oLat: 12.9758, oLng: 77.6045,
      dAddr: 'Yelahanka', dLat: 13.1007, dLng: 77.5963, status: 'pending' },
    // In-transit (demo: shows on map as moving)
    { cargo: 'Textiles', weight: 2500, priority: 'medium', reqType: null,
      oAddr: 'Chickpet, Bangalore', oLat: 12.9686, oLng: 77.5768,
      dAddr: 'Tumkur', dLat: 13.3392, dLng: 77.1017, status: 'in_transit',
      vehicle: vehicles[0].id, driver: drivers[0].id },
    { cargo: 'Dairy Products', weight: 800, priority: 'high', reqType: 'refrigerated',
      oAddr: 'KR Market, Bangalore', oLat: 12.9621, oLng: 77.5774,
      dAddr: 'Mandya', dLat: 12.5242, dLng: 76.8958, status: 'in_transit',
      vehicle: vehicles[2].id, driver: drivers[2].id },
    // Delivered
    { cargo: 'Auto Parts', weight: 1500, priority: 'low', reqType: null,
      oAddr: 'Rajajinagar, Bangalore', oLat: 12.9869, oLng: 77.5527,
      dAddr: 'Kolar', dLat: 13.1368, dLng: 78.1291, status: 'delivered',
      vehicle: vehicles[1].id, driver: drivers[1].id },
  ];

  for (const s of shipments) {
    const id = uuid();
    const token = crypto.randomBytes(16).toString('hex');
    run(`INSERT INTO shipments (id, tracking_token, status, cargo_type, weight_kg, priority,
      origin_address, origin_lat, origin_lng, dest_address, dest_lat, dest_lng,
      requires_vehicle_type, assigned_vehicle, assigned_driver, created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, token, s.status, s.cargo, s.weight, s.priority,
        s.oAddr, s.oLat, s.oLng, s.dAddr, s.dLat, s.dLng,
        s.reqType, s.vehicle || null, s.driver || null, users[1].id]);
  }

  // Mark vehicles with in-transit shipments as en_route
  run("UPDATE vehicles SET status = 'en_route' WHERE id IN (SELECT assigned_vehicle FROM shipments WHERE status = 'in_transit' AND assigned_vehicle IS NOT NULL)");

  const totalUsers = get('SELECT COUNT(*) as c FROM users').c;
  const totalVehicles = get('SELECT COUNT(*) as c FROM vehicles').c;
  const totalShipments = get('SELECT COUNT(*) as c FROM shipments').c;

  console.log(`\n✅ Seeded FleetOS database:`);
  console.log(`   ${totalUsers} users (password: password123)`);
  console.log(`   ${totalVehicles} vehicles`);
  console.log(`   ${totalShipments} shipments`);
  console.log(`\n📧 Login emails: admin@fleetos.io, rajesh@fleetos.io, arun@fleetos.io`);
  console.log(`🔑 All passwords: password123\n`);
}

module.exports = { seed };

if (require.main === module) {
  seed().catch(console.error);
}
