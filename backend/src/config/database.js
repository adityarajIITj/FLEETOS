const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'fleetos.db');
let db = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','dispatcher','driver','client')),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  registration_no TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('light','medium','heavy','refrigerated')),
  capacity_kg REAL NOT NULL,
  capacity_m3 REAL,
  fuel_type TEXT NOT NULL CHECK(fuel_type IN ('diesel','petrol','electric','cng')),
  status TEXT DEFAULT 'available' CHECK(status IN ('available','en_route','maintenance','idle')),
  current_lat REAL,
  current_lng REAL,
  current_speed REAL,
  odometer_km REAL DEFAULT 0,
  assigned_driver TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  shipment_id TEXT,
  status TEXT DEFAULT 'computed' CHECK(status IN ('computed','active','completed','cancelled')),
  origin_lat REAL,
  origin_lng REAL,
  dest_lat REAL,
  dest_lng REAL,
  waypoints TEXT,
  polyline TEXT,
  distance_km REAL,
  estimated_hours REAL,
  estimated_cost REAL,
  source TEXT,
  computed_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  tracking_token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','allocated','picked_up','in_transit','delivered','cancelled')),
  cargo_type TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  volume_m3 REAL,
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
  origin_address TEXT NOT NULL,
  origin_lat REAL NOT NULL,
  origin_lng REAL NOT NULL,
  dest_address TEXT NOT NULL,
  dest_lat REAL NOT NULL,
  dest_lng REAL NOT NULL,
  assigned_vehicle TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
  assigned_driver TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_route TEXT REFERENCES routes(id) ON DELETE SET NULL,
  requires_vehicle_type TEXT,
  client_name TEXT,
  client_email TEXT,
  client_phone TEXT,
  scheduled_pickup TEXT,
  deadline TEXT,
  actual_pickup TEXT,
  actual_delivery TEXT,
  pod_image_url TEXT,
  special_instructions TEXT,
  cost_estimate REAL,
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gps_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  speed_kmh REAL,
  heading REAL,
  timestamp TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gps_vehicle_time ON gps_events(vehicle_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_token ON shipments(tracking_token);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
`;

async function getDb() {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run(SCHEMA);
  save();
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// Helper: run INSERT/UPDATE/DELETE, auto-save
function run(sql, params = []) {
  db.run(sql, params);
  save();
}

// Helper: get one row
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

// Helper: get all rows
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = { getDb, run, get, all, save };
