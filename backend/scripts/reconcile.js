const { getDb, all, run, get } = require('../src/config/database');

async function reconcile() {
  await getDb();
  console.log("Starting DB Reconciliation...");
  
  // 1. Ensure 1:1 Driver -> Vehicle
  // Find drivers assigned to more than 1 active vehicle
  const driversWithMultiple = all(`
    SELECT assigned_driver, COUNT(id) as c 
    FROM vehicles 
    WHERE assigned_driver IS NOT NULL AND status != 'retired' 
    GROUP BY assigned_driver 
    HAVING c > 1
  `);
  
  for (const d of driversWithMultiple) {
    const vehicles = all("SELECT id, registration_no FROM vehicles WHERE assigned_driver = ? AND status != 'retired' ORDER BY created_at DESC", [d.assigned_driver]);
    console.log(`Driver ${d.assigned_driver} has ${vehicles.length} vehicles. Keeping the latest active.`);
    const activeV = vehicles[0];
    for (let i = 1; i < vehicles.length; i++) {
      console.log(` Unassigning vehicle ${vehicles[i].registration_no}`);
      run("UPDATE vehicles SET assigned_driver = NULL WHERE id = ?", [vehicles[i].id]);
    }
  }

  // 2. Fix Shipments that have mismatched assigned_driver and assigned_vehicle
  const shipments = all("SELECT id, assigned_driver, assigned_vehicle FROM shipments WHERE assigned_driver IS NOT NULL OR assigned_vehicle IS NOT NULL");
  for (const s of shipments) {
    if (s.assigned_vehicle) {
      const v = get("SELECT assigned_driver FROM vehicles WHERE id = ?", [s.assigned_vehicle]);
      if (v && v.assigned_driver && v.assigned_driver !== s.assigned_driver) {
        console.log(`Fixing shipment ${s.id} driver to match vehicle driver.`);
        run("UPDATE shipments SET assigned_driver = ? WHERE id = ?", [v.assigned_driver, s.id]);
      }
    } else if (s.assigned_driver) {
      const v = get("SELECT id FROM vehicles WHERE assigned_driver = ? AND status != 'retired'", [s.assigned_driver]);
      if (v && v.id !== s.assigned_vehicle) {
        console.log(`Fixing shipment ${s.id} vehicle to match driver.`);
        run("UPDATE shipments SET assigned_vehicle = ? WHERE id = ?", [v.id, s.id]);
      }
    }
  }

  console.log("Reconciliation complete.");
}

reconcile().catch(console.error);
