import { useState, useEffect, DragEvent } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { Truck, User, AlertCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function DriverVehicleAllocationPanel() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedItem, setDraggedItem] = useState<{ type: 'driver' | 'vehicle', id: string } | null>(null);
  
  const [confirmModal, setConfirmModal] = useState<{ driver: any, vehicle: any, message: string } | null>(null);
  const [notification, setNotification] = useState<{ type: 'error' | 'success', message: string } | null>(null);
  const [showAddDriver, setShowAddDriver] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [dRes, vRes] = await Promise.all([
      apiGet('/api/v1/users?role=driver'),
      apiGet('/api/v1/fleet/vehicles')
    ]);
    setDrivers(dRes.data || []);
    setVehicles(vRes.data || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleDragStart = (type: 'driver' | 'vehicle', id: string) => {
    setDraggedItem({ type, id });
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
  };

  const handleDrop = async (e: DragEvent, dropType: 'driver' | 'vehicle', dropId: string) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (draggedItem.type === dropType) return; // Cannot drop driver on driver

    const driverId = draggedItem.type === 'driver' ? draggedItem.id : dropId;
    const vehicleId = draggedItem.type === 'vehicle' ? draggedItem.id : dropId;

    const d = drivers.find(x => x.id === driverId);
    const v = vehicles.find(x => x.id === vehicleId);

    if (!d || !v) return;
    
    // Attempt assignment
    try {
      await apiPost('/api/v1/fleet/assign', { driver_id: driverId, vehicle_id: vehicleId });
      setNotification({ type: 'success', message: `Assigned ${d.name} to ${v.registration_no}` });
      loadData();
    } catch (err: any) {
      if (err.message && err.message.includes('Reassign')) {
        // Needs confirmation
        setConfirmModal({ driver: d, vehicle: v, message: err.message });
      } else {
        setNotification({ type: 'error', message: err.message });
      }
    }
    setDraggedItem(null);
  };

  const confirmAssignment = async () => {
    if (!confirmModal) return;
    try {
      await apiPost('/api/v1/fleet/assign', { driver_id: confirmModal.driver.id, vehicle_id: confirmModal.vehicle.id, force: true });
      setNotification({ type: 'success', message: `Reassigned successfully.` });
      setConfirmModal(null);
      loadData();
    } catch (err: any) {
      setNotification({ type: 'error', message: err.message });
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Loading allocation data...</div>;

  return (
    <div className="flex h-full gap-4 p-4">
      {/* Drivers Column */}
      <div className="flex-1 flex flex-col bg-[#091724]/50 border border-white/5 rounded">
        <div className="p-3 border-b border-white/5 flex items-center justify-between">
          <div className="font-bold text-sm tracking-wider uppercase text-cyan-400">Drivers</div>
          <button onClick={() => setShowAddDriver(true)} className="text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded hover:bg-cyan-500/30">+ Add Driver</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {drivers.map(d => (
            <div 
              key={d.id}
              draggable
              onDragStart={() => handleDragStart('driver', d.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'driver', d.id)}
              className={`p-3 rounded border bg-[#03101a] cursor-grab active:cursor-grabbing transition-colors ${
                draggedItem?.type === 'vehicle' ? 'border-cyan-500/50 hover:bg-cyan-900/20' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <User size={14} className="text-slate-400" /> {d.name}
                </div>
                {d.is_active === 1 ? <span className="text-[10px] text-emerald-400 px-1.5 py-0.5 bg-emerald-400/10 rounded">Active</span> : <span className="text-[10px] text-red-400">Inactive</span>}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                {vehicles.find(v => v.assigned_driver === d.id) 
                  ? <span className="text-cyan-300 flex items-center gap-1"><Truck size={12}/> {vehicles.find(v => v.assigned_driver === d.id)?.registration_no}</span>
                  : <span className="text-amber-500/70">Unassigned</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Vehicles Column */}
      <div className="flex-1 flex flex-col bg-[#091724]/50 border border-white/5 rounded">
        <div className="p-3 border-b border-white/5 font-bold text-sm tracking-wider uppercase text-cyan-400">Vehicles</div>
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {vehicles.filter(v => v.status !== 'retired').map(v => (
            <div 
              key={v.id}
              draggable
              onDragStart={() => handleDragStart('vehicle', v.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'vehicle', v.id)}
              className={`p-3 rounded border bg-[#03101a] cursor-grab active:cursor-grabbing transition-colors ${
                draggedItem?.type === 'driver' ? 'border-cyan-500/50 hover:bg-cyan-900/20' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <Truck size={14} className="text-slate-400" /> {v.registration_no}
                </div>
                <span className="text-[10px] text-slate-400 uppercase">{v.type} / {v.fuel_type}</span>
              </div>
              <div className="mt-2 text-xs text-slate-400 flex justify-between">
                <span>{v.assigned_driver ? <span className="text-cyan-300 flex items-center gap-1"><User size={12}/> {drivers.find(d => d.id === v.assigned_driver)?.name || 'Unknown'}</span> : <span className="text-amber-500/70">Unassigned</span>}</span>
                <span className="text-[10px] uppercase">{v.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Confirm Modal */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-md border border-white/10 bg-[#091724] p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><AlertCircle className="text-amber-400" /> Confirm Reassignment</h3>
              <p className="text-sm text-slate-300 leading-relaxed mb-6">{confirmModal.message}</p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setConfirmModal(null)} className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white">Cancel</button>
                <button onClick={confirmAssignment} className="bg-cyan-500 px-4 py-2 text-xs font-bold text-[#03101a] hover:bg-cyan-400">Force Reassign</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Driver Modal */}
      <AnimatePresence>
        {showAddDriver && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-lg border border-white/10 bg-[#091724] p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
              <h3 className="text-lg font-bold text-white mb-4">Add Driver & Vehicle</h3>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                try {
                  await apiPost('/api/v1/fleet/driver-with-vehicle', {
                    name: fd.get('name'),
                    email: fd.get('email'),
                    password: fd.get('password'),
                    registration_no: fd.get('registration_no'),
                    type: fd.get('type'),
                    capacity_kg: fd.get('capacity_kg'),
                    fuel_type: fd.get('fuel_type'),
                  });
                  setNotification({ type: 'success', message: 'Driver and Vehicle created successfully.' });
                  setShowAddDriver(false);
                  loadData();
                } catch(err: any) {
                  setNotification({ type: 'error', message: err.message });
                }
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs text-slate-400">Name *</label><input name="name" required className="form-input mt-1 w-full text-sm p-2 bg-[#03101a] border border-white/10" /></div>
                  <div><label className="text-xs text-slate-400">Email *</label><input name="email" type="email" required className="form-input mt-1 w-full text-sm p-2 bg-[#03101a] border border-white/10" /></div>
                  <div className="col-span-2"><label className="text-xs text-slate-400">Temporary Password *</label><input name="password" required className="form-input mt-1 w-full text-sm p-2 bg-[#03101a] border border-white/10" /></div>
                </div>
                
                <div className="border-t border-white/10 pt-4 mt-4">
                  <h4 className="text-xs font-bold text-cyan-400 mb-2">Linked Vehicle Registration (Required)</h4>
                  <div className="grid grid-cols-2 gap-4 mt-3">
                    <div><label className="text-xs text-slate-400">Registration No *</label><input name="registration_no" placeholder="e.g. KA-01-AB-1234" required className="form-input mt-1 w-full text-sm p-2 bg-[#03101a] border border-white/10 uppercase" /></div>
                    <div>
                      <label className="text-xs text-slate-400">Type *</label>
                      <select name="type" required className="form-input mt-1 w-full text-sm p-2 bg-[#03101a] border border-white/10">
                        <option value="light">Light</option><option value="medium">Medium</option><option value="heavy">Heavy</option><option value="refrigerated">Refrigerated</option>
                      </select>
                    </div>
                    <div><label className="text-xs text-slate-400">Capacity (kg) *</label><input name="capacity_kg" type="number" defaultValue={5000} required className="form-input mt-1 w-full text-sm p-2 bg-[#03101a] border border-white/10" /></div>
                    <div>
                      <label className="text-xs text-slate-400">Fuel *</label>
                      <select name="fuel_type" required className="form-input mt-1 w-full text-sm p-2 bg-[#03101a] border border-white/10">
                        <option value="diesel">Diesel</option><option value="petrol">Petrol</option><option value="electric">Electric</option><option value="cng">CNG</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 justify-end mt-6">
                  <button type="button" onClick={() => setShowAddDriver(false)} className="px-4 py-2 text-xs font-bold text-slate-300">Cancel</button>
                  <button type="submit" className="bg-cyan-500 px-4 py-2 text-xs font-bold text-[#03101a] hover:bg-cyan-400">Create Driver</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`fixed bottom-4 right-4 z-[9999] flex items-center gap-2 px-4 py-3 shadow-xl ${notification.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-emerald-500/90 text-white'}`}>
            {notification.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
            <span className="text-xs font-bold">{notification.message}</span>
            <button onClick={() => setNotification(null)} className="ml-4 opacity-70 hover:opacity-100">×</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
