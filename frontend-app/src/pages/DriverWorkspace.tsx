import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { apiGet, apiPut, apiPost, type Vehicle, type Shipment } from '../lib/api';
import {
  Truck,
  Package,
  CheckCircle2,
  Play,
  Check,
  Sun,
  Moon,
  LogOut,
  Upload,
  Radio,
  Clock,
  MapPin,
  RefreshCw
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

export default function DriverWorkspace() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [activeShipment, setActiveShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podUploading, setPodUploading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const gpsIntervalRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadDriverData = async () => {
    try {
      setLoading(true);
      // Driver scoped endpoint returns only driver's vehicle
      const vRes = await apiGet<Vehicle[]>('/api/v1/fleet/vehicles');
      const myVehicles = vRes.data || [];
      const myVeh = myVehicles.find(v => v.assigned_driver === user?.id) || myVehicles[0] || null;
      setVehicle(myVeh);

      // Driver scoped endpoint returns only driver's shipments
      const sRes = await apiGet<Shipment[]>('/api/v1/shipments');
      const myShipments = sRes.data || [];
      setShipments(myShipments);

      // Find primary active shipment
      const active = myShipments.find(
        s => s.status !== 'delivered' && s.status !== 'cancelled'
      ) || null;
      setActiveShipment(active);

      if (active) {
        try {
          const etaRes = await apiGet<{ eta_minutes: number }>(`/api/v1/shipments/${active.id}/eta`);
          setEtaMinutes(etaRes.data?.eta_minutes ?? null);
        } catch {
          // ETA calculation fallback
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load driver data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDriverData();

    socketRef.current = io({ transports: ['websocket', 'polling'] });
    socketRef.current.on('shipment:status_update', (d) => {
      if (activeShipment && d.shipmentId === activeShipment.id) {
        loadDriverData();
      }
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    };
  }, [user?.id]);

  // Handle GPS Simulation / Beacon
  useEffect(() => {
    if (gpsActive && vehicle) {
      gpsIntervalRef.current = window.setInterval(async () => {
        if (!vehicle.current_lat || !vehicle.current_lng) return;
        // Small random drift along heading
        const deltaLat = (Math.random() - 0.48) * 0.001;
        const deltaLng = (Math.random() - 0.48) * 0.001;
        const newLat = vehicle.current_lat + deltaLat;
        const newLng = vehicle.current_lng + deltaLng;
        const speed = Math.floor(40 + Math.random() * 25);

        try {
          await apiPost(`/api/v1/fleet/vehicles/${vehicle.id}/location`, {
            lat: newLat,
            lng: newLng,
            speed,
            heading: 90
          });
          setVehicle(prev => prev ? { ...prev, current_lat: newLat, current_lng: newLng, current_speed: speed } : null);
        } catch {
          // location update error ignored
        }
      }, 5000);
    } else {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    }
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    };
  }, [gpsActive, vehicle?.id]);

  const handleUpdateStatus = async (nextStatus: 'picked_up' | 'in_transit' | 'delivered') => {
    if (!activeShipment) return;
    setStatusUpdating(true);
    try {
      await apiPut(`/api/v1/shipments/${activeShipment.id}/status`, { status: nextStatus });
      showToast(`Status updated to ${nextStatus.replace('_', ' ').toUpperCase()}`);
      await loadDriverData();
    } catch (err: any) {
      showToast(err.message || 'Status transition failed');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleUploadPOD = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podFile || !activeShipment) return;
    setPodUploading(true);

    const formData = new FormData();
    formData.append('pod', podFile);

    const token = sessionStorage.getItem('fleetToken');
    try {
      const res = await fetch(`/api/v1/shipments/${activeShipment.id}/pod`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        showToast('Proof of delivery attached successfully');
        setPodFile(null);
        await handleUpdateStatus('delivered');
      } else {
        throw new Error(data.error?.message || 'POD upload failed');
      }
    } catch (err: any) {
      showToast(err.message || 'Upload failed');
    } finally {
      setPodUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 rounded border border-cyan-500/40 bg-[#06111e] px-4 py-2.5 text-xs font-semibold text-cyan-300 shadow-xl">
          {toastMessage}
        </div>
      )}

      {/* Driver Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-cyan-400/50 bg-cyan-400/10 text-cyan-400">
            <Truck size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight">Driver Workspace</span>
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
                Active
              </span>
            </div>
            <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">
              Operator: {user?.name || 'Driver'} ({user?.email})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setGpsActive(!gpsActive)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold transition-all ${
              gpsActive
                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-400'
                : 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
            }`}
            title="Toggle Live GPS Beacon"
          >
            <Radio size={13} className={gpsActive ? 'animate-pulse text-emerald-400' : ''} />
            <span className="hidden sm:inline">{gpsActive ? 'GPS Live' : 'Enable GPS'}</span>
          </button>

          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            onClick={logout}
            className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20"
          >
            <LogOut size={13} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <RefreshCw className="animate-spin text-cyan-400" size={24} />
          </div>
        ) : (
          <>
            {/* Vehicle Card */}
            <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
                <div className="flex items-center gap-2.5">
                  <Truck size={18} className="text-cyan-400" />
                  <div>
                    <h2 className="text-sm font-bold">Assigned Vehicle</h2>
                    <p className="mono text-[11px] text-[hsl(var(--muted-foreground))]">
                      {vehicle ? vehicle.registration_no : 'No Vehicle Assigned'}
                    </p>
                  </div>
                </div>
                {vehicle && (
                  <span className="rounded bg-cyan-500/10 px-2 py-0.5 text-xs font-bold uppercase text-cyan-400">
                    {vehicle.type} · {vehicle.fuel_type}
                  </span>
                )}
              </div>

              {vehicle ? (
                <div className="grid grid-cols-2 gap-3 pt-3 sm:grid-cols-4">
                  <div className="rounded bg-[hsl(var(--secondary))] p-2.5">
                    <span className="text-[10px] uppercase font-bold text-[hsl(var(--muted-foreground))]">Status</span>
                    <p className="mt-0.5 text-xs font-semibold capitalize text-emerald-400">{vehicle.status}</p>
                  </div>
                  <div className="rounded bg-[hsl(var(--secondary))] p-2.5">
                    <span className="text-[10px] uppercase font-bold text-[hsl(var(--muted-foreground))]">Payload Capacity</span>
                    <p className="mono mt-0.5 text-xs font-semibold tabular-nums">{vehicle.capacity_kg} kg</p>
                  </div>
                  <div className="rounded bg-[hsl(var(--secondary))] p-2.5">
                    <span className="text-[10px] uppercase font-bold text-[hsl(var(--muted-foreground))]">Current Speed</span>
                    <p className="mono mt-0.5 text-xs font-semibold tabular-nums">
                      {vehicle.current_speed ? `${Math.round(vehicle.current_speed)} km/h` : '0 km/h'}
                    </p>
                  </div>
                  <div className="rounded bg-[hsl(var(--secondary))] p-2.5">
                    <span className="text-[10px] uppercase font-bold text-[hsl(var(--muted-foreground))]">Coordinates</span>
                    <p className="mono mt-0.5 text-[11px] font-semibold tabular-nums truncate">
                      {vehicle.current_lat && vehicle.current_lng
                        ? `${vehicle.current_lat.toFixed(4)}, ${vehicle.current_lng.toFixed(4)}`
                        : 'GPS Pending'}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="pt-3 text-xs text-[hsl(var(--muted-foreground))]">
                  No vehicle is currently linked to your driver account. Contact your dispatcher.
                </p>
              )}
            </div>

            {/* Active Load Section */}
            {activeShipment ? (
              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--border))] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="mono text-[10px] uppercase tracking-wider text-cyan-400">Active Cargo Assignment</span>
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                        {activeShipment.priority}
                      </span>
                    </div>
                    <h3 className="text-base font-bold">{activeShipment.cargo_type}</h3>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-[hsl(var(--muted-foreground))]">Current Stage</span>
                    <p className="text-xs font-bold uppercase text-cyan-400">
                      {activeShipment.status.replace('_', ' ')}
                    </p>
                  </div>
                </div>

                {/* Progress Indicators */}
                <div className="grid grid-cols-3 gap-2 py-1">
                  <div className={`rounded p-2 text-center text-xs font-bold transition-all ${
                    ['allocated', 'picked_up', 'in_transit', 'delivered'].includes(activeShipment.status)
                      ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                      : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
                  }`}>
                    1. Allocated
                  </div>
                  <div className={`rounded p-2 text-center text-xs font-bold transition-all ${
                    ['picked_up', 'in_transit', 'delivered'].includes(activeShipment.status)
                      ? 'border border-cyan-500/40 bg-cyan-500/10 text-cyan-400'
                      : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
                  }`}>
                    2. In Transit
                  </div>
                  <div className={`rounded p-2 text-center text-xs font-bold transition-all ${
                    activeShipment.status === 'delivered'
                      ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
                  }`}>
                    3. Delivered
                  </div>
                </div>

                {/* Route Info */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                      <MapPin size={14} /> Origin Pickup
                    </div>
                    <p className="mt-1 text-xs font-semibold">{activeShipment.origin_address}</p>
                    <p className="mono text-[10px] text-[hsl(var(--muted-foreground))]">
                      Lat: {activeShipment.origin_lat.toFixed(4)}, Lng: {activeShipment.origin_lng.toFixed(4)}
                    </p>
                  </div>

                  <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                      <MapPin size={14} /> Destination Drop-off
                    </div>
                    <p className="mt-1 text-xs font-semibold">{activeShipment.dest_address}</p>
                    <p className="mono text-[10px] text-[hsl(var(--muted-foreground))]">
                      Lat: {activeShipment.dest_lat.toFixed(4)}, Lng: {activeShipment.dest_lng.toFixed(4)}
                    </p>
                  </div>
                </div>

                {/* Live ETA Metric */}
                <div className="flex items-center justify-between rounded bg-cyan-500/10 p-3 border border-cyan-500/30">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-cyan-400" />
                    <div>
                      <span className="text-[10px] uppercase font-bold text-cyan-400">Estimated Transit Time</span>
                      <p className="text-sm font-bold">
                        {etaMinutes !== null ? `${etaMinutes} Minutes Remaining` : 'Calculating route telemetry...'}
                      </p>
                    </div>
                  </div>
                  <span className="mono text-xs font-bold tabular-nums text-cyan-300">
                    Cargo Weight: {activeShipment.weight_kg} kg
                  </span>
                </div>

                {/* Action Flow */}
                <div className="pt-2">
                  {activeShipment.status === 'allocated' && (
                    <button
                      onClick={() => handleUpdateStatus('picked_up')}
                      disabled={statusUpdating}
                      className="flex w-full items-center justify-center gap-2 rounded bg-amber-500 py-3 text-xs font-bold uppercase tracking-wider text-black transition-all hover:bg-amber-400 disabled:opacity-50"
                    >
                      <Package size={15} />
                      {statusUpdating ? 'Updating...' : 'Confirm Cargo Picked Up'}
                    </button>
                  )}

                  {activeShipment.status === 'picked_up' && (
                    <button
                      onClick={() => handleUpdateStatus('in_transit')}
                      disabled={statusUpdating}
                      className="flex w-full items-center justify-center gap-2 rounded bg-cyan-500 py-3 text-xs font-bold uppercase tracking-wider text-black transition-all hover:bg-cyan-400 disabled:opacity-50"
                    >
                      <Play size={15} />
                      {statusUpdating ? 'Starting...' : 'Start Driving / Transit'}
                    </button>
                  )}

                  {activeShipment.status === 'in_transit' && (
                    <div className="space-y-3">
                      <form onSubmit={handleUploadPOD} className="rounded border border-dashed border-[hsl(var(--border))] p-4 text-center">
                        <Upload size={20} className="mx-auto text-cyan-400 mb-2" />
                        <span className="block text-xs font-semibold">Proof of Delivery (POD)</span>
                        <p className="text-[11px] text-[hsl(var(--muted-foreground))] mb-3">
                          Upload recipient signature or delivery photo to complete shipment.
                        </p>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => setPodFile(e.target.files?.[0] || null)}
                          className="mx-auto block text-xs"
                        />
                        <button
                          type="submit"
                          disabled={!podFile || podUploading}
                          className="mt-3 inline-flex items-center gap-2 rounded bg-emerald-500 px-4 py-2 text-xs font-bold uppercase text-black hover:bg-emerald-400 disabled:opacity-50"
                        >
                          <Check size={14} />
                          {podUploading ? 'Uploading...' : 'Submit POD & Complete Delivery'}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center">
                <CheckCircle2 size={32} className="mx-auto text-emerald-400 mb-2" />
                <h3 className="text-sm font-bold">No Active Shipments</h3>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                  You are currently clear for dispatch. New assignments will appear here automatically.
                </p>
              </div>
            )}

            {/* Shipment History */}
            {shipments.length > 0 && (
              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 shadow-sm">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] mb-3">
                  Assigned Cargo History ({shipments.length})
                </h3>
                <div className="space-y-2">
                  {shipments.map(s => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] p-2.5 text-xs"
                    >
                      <div>
                        <span className="font-semibold">{s.cargo_type}</span>
                        <p className="mono text-[10px] text-[hsl(var(--muted-foreground))]">
                          {s.origin_address} → {s.dest_address}
                        </p>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                        s.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'
                      }`}>
                        {s.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
