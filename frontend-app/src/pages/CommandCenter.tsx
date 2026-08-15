import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation, Truck, Package, BarChart3, Settings, LogOut,
  Zap, MapPin, Circle, Route, Plus, X, Sun, Moon, Shield,
  Link
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { apiGet, apiPost, apiPut, type Vehicle, type Shipment, type AnalyticsSummary, type GeocodeResult, type User } from '../lib/api';
import { subscribeFleet, onVehicleUpdate, onShipmentStatusUpdate } from '../lib/socket';
import FleetMap from '../components/FleetMap';
import TransitionPanel from '../components/TransitionPanel';
import { DriverVehicleAllocationPanel } from '../components/DriverVehicleAllocationPanel';

type Tab = 'fleet' | 'allocation' | 'shipments' | 'analytics' | 'settings';
type VehicleFilter = 'all' | 'available' | 'en_route' | 'idle' | 'maintenance';
type ShipmentFilter = 'all' | 'pending' | 'allocated' | 'in_transit' | 'delivered';

const statusColors: Record<string, string> = {
  available: '#22c55e', en_route: '#3b82f6', in_transit: '#3b82f6',
  pending: '#f59e0b', idle: '#f59e0b', delivered: '#06b6d4',
  maintenance: '#ef4444', allocated: '#a78bfa', picked_up: '#22c55e',
  cancelled: '#ef4444',
};

function StatusPill({ status }: { status: string }) {
  const bg: Record<string, string> = {
    available: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
    en_route: 'bg-blue-400/10 text-blue-300 border-blue-400/30',
    in_transit: 'bg-blue-400/10 text-blue-300 border-blue-400/30',
    pending: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
    idle: 'bg-amber-400/10 text-amber-300 border-amber-400/30',
    delivered: 'bg-cyan-400/10 text-cyan-300 border-cyan-400/30',
    allocated: 'bg-purple-400/10 text-purple-300 border-purple-400/30',
    picked_up: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/30',
    cancelled: 'bg-red-400/10 text-red-300 border-red-400/30',
    maintenance: 'bg-red-400/10 text-red-300 border-red-400/30',
  };
  return (
    <span className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${bg[status] || 'bg-slate-400/10 text-slate-300'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function CommandCenter() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState<Tab>('fleet');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [vFilter, setVFilter] = useState<VehicleFilter>('all');
  const [sFilter, setSFilter] = useState<ShipmentFilter>('all');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [toasts, setToasts] = useState<{ id: number; icon: string; title: string; detail: string }[]>([]);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [clock, setClock] = useState(new Date().toLocaleTimeString());
  const [trailActive, setTrailActive] = useState(false);
  const [geofenceActive, setGeofenceActive] = useState(false);
  const [showAllRoutes, setShowAllRoutes] = useState(false);

  const showToast = useCallback((icon: string, title: string, detail: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, icon, title, detail }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  // Clock
  useEffect(() => {
    const interval = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Data fetching
  const refreshData = useCallback(async () => {
    try {
      const [vRes, sRes] = await Promise.all([
        apiGet<Vehicle[]>('/api/v1/fleet/vehicles'),
        apiGet<Shipment[]>('/api/v1/shipments'),
      ]);
      setVehicles(vRes.data || []);
      setShipments(sRes.data || []);
    } catch (e) {
      console.error('Refresh error:', e);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 15000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // Socket
  useEffect(() => {
    subscribeFleet();
    const unsub1 = onVehicleUpdate(data => {
      setVehicles(prev => prev.map(v =>
        v.id === data.vehicleId
          ? { ...v, current_lat: data.lat, current_lng: data.lng, current_speed: data.speed }
          : v
      ));
    });
    const unsub2 = onShipmentStatusUpdate(data => {
      showToast('📦', 'Shipment Update', `Status changed to ${data.status}`);
      refreshData();
    });
    return () => { unsub1(); unsub2(); };
  }, [refreshData, showToast]);

  // Analytics
  useEffect(() => {
    if (tab === 'analytics') {
      apiGet<AnalyticsSummary>('/api/v1/shipments/analytics/summary')
        .then(res => setAnalytics(res.data))
        .catch(() => {});
    }
  }, [tab]);

  // Auto allocate
  const autoAllocate = async () => {
    try {
      const res = await apiPost<{ allocated: number }>('/api/v1/allocation/auto');
      showToast('⚡', 'AI Allocation', `Matched ${res.data.allocated} shipments to vehicles`);
      refreshData();
    } catch (e: any) {
      showToast('❌', 'Allocation Error', e.message);
    }
  };

  // Advance shipment status
  const advanceStatus = async (shipmentId: string, nextStatus: string) => {
    try {
      await apiPut(`/api/v1/shipments/${shipmentId}/status`, { status: nextStatus });
      showToast('📦', 'Status Updated', `→ ${nextStatus.replace('_', ' ')}`);
      refreshData();
    } catch (e: any) {
      showToast('❌', 'Error', e.message);
    }
  };

  const getNextStatus = (s: string) => {
    const map: Record<string, string> = { pending: 'allocated', allocated: 'picked_up', picked_up: 'in_transit', in_transit: 'delivered' };
    return map[s] || null;
  };

  // Filtered lists
  const filteredVehicles = vFilter === 'all' ? vehicles : vehicles.filter(v => v.status === vFilter);
  const filteredShipments = sFilter === 'all' ? shipments : shipments.filter(s => s.status === sFilter);

  // KPIs
  const kpiTotal = vehicles.length;
  const kpiEnRoute = vehicles.filter(v => v.status === 'en_route').length;
  const kpiAvailable = vehicles.filter(v => v.status === 'available').length;
  const kpiShipments = shipments.length;

  const navItems: { tab: Tab; icon: typeof Truck; label: string }[] = [
    { tab: 'fleet', icon: Truck, label: 'Fleet' },
    { tab: 'allocation', icon: Link, label: 'Allocation' },
    { tab: 'shipments', icon: Package, label: 'Shipments' },
    { tab: 'analytics', icon: BarChart3, label: 'Analytics' },
    { tab: 'settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="app-shell app-noise flex h-[100dvh] overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar flex w-[56px] flex-col items-center border-r border-white/[.06] py-4 lg:w-[200px] lg:items-stretch lg:px-3">
        <div className="mb-6 flex items-center justify-center gap-2 lg:justify-start lg:px-2">
          <div className="flex h-7 w-7 items-center justify-center border border-cyan-400/70 bg-cyan-400/10">
            <Navigation size={14} className="text-cyan-300" />
          </div>
          <span className="hidden text-sm font-bold tracking-tight lg:block">
            Fleet<span className="text-cyan-300">OS</span>
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map(({ tab: t, icon: Icon, label }) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-3 rounded px-3 py-2.5 text-xs font-medium transition ${
                tab === t
                  ? 'bg-cyan-400/10 text-cyan-300'
                  : 'text-slate-500 hover:bg-white/[.04] hover:text-slate-300'
              }`}
            >
              <Icon size={16} />
              <span className="hidden lg:block">{label}</span>
            </button>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="mt-auto border-t border-white/[.06] pt-3">
          <div className="hidden px-2 text-[10px] text-slate-500 lg:block">
            {user?.name}
            <div className="mono text-[9px] text-slate-600">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            className="mt-2 flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400/70 hover:text-red-300"
          >
            <LogOut size={14} />
            <span className="hidden lg:block">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="app-header flex h-12 items-center justify-between border-b border-white/[.06] px-4">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-xs text-slate-500">
              <span className="status-pulse h-2 w-2 rounded-full bg-emerald-400" />
              Live
            </span>
            <span className="mono text-xs font-semibold text-slate-300">{clock}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowShipmentModal(true)}
              className="flex items-center gap-1.5 bg-cyan-400 px-3 py-1.5 text-[10px] font-bold text-[#03101a] hover:bg-cyan-300"
            >
              <Plus size={12} /> Shipment
            </button>
            <button
              onClick={() => setShowVehicleModal(true)}
              className="flex items-center gap-1.5 border border-white/10 px-3 py-1.5 text-[10px] font-bold text-slate-300 hover:border-cyan-400/50"
            >
              <Plus size={12} /> Vehicle
            </button>
            <button
              onClick={toggleTheme}
              className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-slate-300 hover:border-cyan-400/50 hover:text-white"
              title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            >
              {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            {user?.role === 'admin' && (
              <a
                href="#admin"
                onClick={(e) => { e.preventDefault(); window.location.hash = 'admin'; window.location.reload(); }}
                className="flex items-center gap-1 border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-[10px] font-bold text-purple-300 hover:bg-purple-500/20"
              >
                <Shield size={12} /> Admin Console
              </a>
            )}
            <a
              href="/tracking.html"
              target="_blank"
              className="flex items-center gap-1 border border-white/10 px-3 py-1.5 text-[10px] font-bold text-slate-400 hover:border-cyan-400/50 hover:text-white"
            >
              Tracker ↗
            </a>
          </div>
        </header>

        {/* KPI Strip */}
        <div className="metric-strip flex border-b border-white/[.06]">
          {[
            { label: 'VEHICLES', value: kpiTotal, color: 'text-cyan-300' },
            { label: 'EN ROUTE', value: kpiEnRoute, color: 'text-emerald-400' },
            { label: 'AVAILABLE', value: kpiAvailable, color: 'text-amber-300' },
            { label: 'SHIPMENTS', value: kpiShipments, color: 'text-purple-300' },
          ].map(kpi => (
            <div key={kpi.label} className="flex-1 border-r border-white/[.06] px-4 py-2.5 last:border-r-0">
              <div className="mono text-[8px] uppercase tracking-[.15em] text-slate-600">{kpi.label}</div>
              <div className={`mono text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Body: Sidebar Panel + Map */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel */}
          <div className="flex w-[340px] flex-col border-r border-white/[.06] bg-[#081420] lg:w-[380px]">
            {/* Panel Header */}
            <div className="flex items-center justify-between border-b border-white/[.06] px-4 py-3">
              <div>
                <div className="mono text-[9px] uppercase tracking-[.2em] text-cyan-300">
                  {tab === 'fleet' ? 'FLEET OPERATIONS' : tab === 'allocation' ? 'ALLOCATION ENGINE' : tab === 'shipments' ? 'CARGO CONTROL' : tab === 'analytics' ? 'INTELLIGENCE' : 'CONTROL PLANE'}
                </div>
                <h2 className="mt-1 text-base font-semibold text-white capitalize">{tab}</h2>
              </div>
              <span className="mono text-xs text-cyan-300">
                {tab === 'fleet' ? filteredVehicles.length : tab === 'shipments' ? filteredShipments.length : ''}
              </span>
            </div>

            {/* Filters */}
            {tab === 'fleet' && (
              <div className="flex flex-wrap gap-1.5 border-b border-white/[.06] px-4 py-2">
                {(['all', 'available', 'en_route', 'idle', 'maintenance'] as VehicleFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setVFilter(f)}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                      vFilter === f
                        ? 'bg-cyan-400 text-[#03101a]'
                        : 'border border-white/10 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}
            {tab === 'shipments' && (
              <div className="flex flex-wrap gap-1.5 border-b border-white/[.06] px-4 py-2">
                {(['all', 'pending', 'allocated', 'in_transit', 'delivered'] as ShipmentFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setSFilter(f)}
                    className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition ${
                      sFilter === f
                        ? 'bg-cyan-400 text-[#03101a]'
                        : 'border border-white/10 text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {f === 'all' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            )}

            {/* List with TransitionPanel */}
            <div className="workspace-content flex-1 overflow-y-auto">
              <TransitionPanel activeKey={tab} className="h-full">
                {tab === 'fleet' && (
                  <div>
                    {filteredVehicles.map(v => (
                      <button
                        key={v.id}
                        onClick={() => setSelectedVehicle(v)}
                        className={`data-row w-full border-b border-white/[.04] px-4 py-3 text-left transition hover:bg-cyan-300/[.04] ${
                          selectedVehicle?.id === v.id ? 'border-l-2 border-l-cyan-400 bg-cyan-300/[.06]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="mono text-sm font-bold text-white">{v.registration_no}</span>
                          <StatusPill status={v.status} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-500">
                          <span>{v.type.toUpperCase()}</span>
                          <span>⚖️ {v.capacity_kg}kg</span>
                          <span>⛽ {v.fuel_type}</span>
                          {v.current_speed ? <span className="text-emerald-400">{v.current_speed.toFixed(0)} km/h</span> : null}
                        </div>
                        {v.driver_name && (
                          <div className="mt-1 text-[10px] text-slate-600">👤 {v.driver_name}</div>
                        )}
                      </button>
                    ))}
                    {filteredVehicles.length === 0 && (
                      <div className="p-8 text-center text-sm text-slate-600">No vehicles match filter</div>
                    )}
                  </div>
                )}

                {tab === 'allocation' && (
                  <div className="h-full p-4 overflow-hidden">
                    <DriverVehicleAllocationPanel />
                  </div>
                )}

                {tab === 'shipments' && (
                  <div>
                    {filteredShipments.map(s => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedShipment(s)}
                        className={`data-row w-full border-b border-white/[.04] px-4 py-3 text-left transition hover:bg-cyan-300/[.04] ${
                          selectedShipment?.id === s.id ? 'border-l-2 border-l-cyan-400 bg-cyan-300/[.06]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-white">{s.cargo_type}</span>
                          <StatusPill status={s.status} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-500">
                          <span>⚖️ {s.weight_kg}kg</span>
                          <span className="uppercase">{s.priority}</span>
                          {s.requires_vehicle_type && <span>🚛 {s.requires_vehicle_type}</span>}
                          {s.vehicle_reg && <span className="text-cyan-300">→ {s.vehicle_reg}</span>}
                        </div>
                        <div className="mt-1 text-[10px] text-slate-600">
                          📍 {s.origin_address} → {s.dest_address}
                        </div>
                        {s.tracking_token && (
                          <a 
                            href={`/tracking.html#${s.tracking_token}`}
                            target="_blank"
                            onClick={(e) => e.stopPropagation()}
                            className="mono mt-1 text-[9px] text-cyan-400/80 hover:text-cyan-300 flex items-center gap-1"
                          >
                            Track: {s.tracking_token.slice(0, 16)}… <Link size={8} />
                          </a>
                        )}
                      </button>
                    ))}
                    {filteredShipments.length === 0 && (
                      <div className="p-8 text-center text-sm text-slate-600">No shipments match filter</div>
                    )}
                  </div>
                )}

                {tab === 'analytics' && analytics && (
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { label: 'Fleet Utilization', value: `${kpiTotal > 0 ? Math.round((kpiEnRoute / kpiTotal) * 100) : 0}%`, color: 'text-cyan-300' },
                        { label: 'Delivery Rate', value: `${analytics.shipments.total > 0 ? Math.round((analytics.shipments.delivered / analytics.shipments.total) * 100) : 0}%`, color: 'text-emerald-400' },
                        { label: 'Active Routes', value: String(analytics.fleet.en_route), color: 'text-blue-400' },
                        { label: 'In Transit', value: String(analytics.shipments.in_transit), color: 'text-amber-300' },
                        { label: 'Total Cargo', value: `${(analytics.total_cargo_weight_kg / 1000).toFixed(1)}t`, color: 'text-white' },
                        { label: 'GPS Events 24h', value: String(analytics.gps_events_24h), color: 'text-cyan-300' },
                        { label: 'Urgent', value: String(analytics.urgent_shipments), color: 'text-red-400' },
                        { label: 'Pending', value: String(analytics.shipments.pending), color: 'text-amber-300' },
                      ].map(m => (
                        <div key={m.label} className="border border-white/[.06] bg-[#091724] p-3">
                          <div className="mono text-[8px] uppercase tracking-[.15em] text-slate-600">{m.label}</div>
                          <div className={`mono mt-1 text-xl font-bold ${m.color}`}>{m.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Fleet composition */}
                    <div className="border border-white/[.06] bg-[#091724] p-4 mb-3">
                      <div className="mono mb-3 text-[9px] uppercase tracking-[.15em] text-slate-600">Fleet Composition</div>
                      {(analytics.type_breakdown || []).map(t => {
                        const pct = Math.round((t.count / (kpiTotal || 1)) * 100);
                        return (
                          <div key={t.type} className="mb-2">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-400">{t.type.toUpperCase()}</span>
                              <span className="text-cyan-300">{t.count} ({pct}%)</span>
                            </div>
                            <div className="mt-1 h-1 bg-white/[.06]">
                              <div className="h-full bg-cyan-400" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Fuel mix */}
                    <div className="border border-white/[.06] bg-[#091724] p-4">
                      <div className="mono mb-3 text-[9px] uppercase tracking-[.15em] text-slate-600">Fuel Mix</div>
                      {(analytics.fuel_breakdown || []).map(f => {
                        const colors: Record<string, string> = { diesel: 'bg-amber-400', petrol: 'bg-red-400', electric: 'bg-emerald-400', cng: 'bg-blue-400' };
                        return (
                          <div key={f.fuel_type} className="mb-2 flex items-center gap-2 text-xs">
                            <span className={`h-2 w-2 rounded-full ${colors[f.fuel_type] || 'bg-slate-400'}`} />
                            <span className="text-slate-400">{f.fuel_type.toUpperCase()}</span>
                            <span className="ml-auto font-bold text-white">{f.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {tab === 'settings' && (
                  <div className="p-4">
                    <div className="border border-white/[.06] bg-[#091724] divide-y divide-white/[.06]">
                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-white">Workspace preferences</h3>
                        <label className="mt-4 flex items-center justify-between text-xs text-slate-400">
                          Use metric units
                          <input type="checkbox" defaultChecked className="h-4 w-4 accent-cyan-400" />
                        </label>
                        <label className="mt-4 flex items-center justify-between text-xs text-slate-400">
                          Sound notifications
                          <input type="checkbox" defaultChecked className="h-4 w-4 accent-cyan-400" />
                        </label>
                      </div>
                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-white">Live telemetry</h3>
                        <p className="mt-1 text-xs text-slate-500">GPS refresh interval.</p>
                        <select className="mt-3 border border-white/10 bg-[#06111e] px-3 py-2 text-xs text-slate-300">
                          <option>Every 15 seconds</option>
                          <option>Every 30 seconds</option>
                          <option>Every minute</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </TransitionPanel>
            </div>

            {/* Actions bar */}
            <div className="border-t border-white/[.06] bg-[#081420] p-3 space-y-2">
              <button
                onClick={autoAllocate}
                className="flex w-full items-center justify-center gap-2 bg-cyan-400 py-2.5 text-xs font-bold text-[#03101a] hover:bg-cyan-300"
              >
                <Zap size={14} /> AI Auto-Allocate
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setTrailActive(!trailActive)}
                  className={`flex flex-1 items-center justify-center gap-1.5 border py-2 text-[10px] font-bold transition ${
                    trailActive ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <MapPin size={12} /> Trail
                </button>
                <button
                  onClick={() => setShowAllRoutes(!showAllRoutes)}
                  className="flex flex-1 items-center justify-center gap-1.5 border border-white/10 py-2 text-[10px] font-bold text-slate-400 hover:text-white"
                >
                  <Route size={12} /> Routes
                </button>
                <button
                  onClick={() => setGeofenceActive(!geofenceActive)}
                  className={`flex flex-1 items-center justify-center gap-1.5 border py-2 text-[10px] font-bold transition ${
                    geofenceActive ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300' : 'border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <Circle size={12} /> Geo
                </button>
              </div>
            </div>
          </div>

          {/* Map Area */}
          <div className="relative flex-1">
            <FleetMap
              vehicles={vehicles}
              shipments={shipments}
              selectedVehicle={selectedVehicle}
              selectedShipment={selectedShipment}
              onSelectVehicle={setSelectedVehicle}
              geofenceActive={geofenceActive}
              showAllRoutes={showAllRoutes}
            />

            {/* Bottom info bar with smooth AnimatePresence inspector */}
            <AnimatePresence mode="wait">
              {(selectedVehicle || selectedShipment) && (
                <motion.div
                  key={selectedVehicle ? `v-${selectedVehicle.id}` : `s-${selectedShipment?.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-4 left-4 right-4 z-[1000] flex flex-wrap items-center gap-5 border border-white/[.08] bg-[#091724]/95 px-5 py-3 shadow-2xl shadow-black/40 backdrop-blur-md"
                >
                  {selectedVehicle && (
                    <>
                      <div>
                        <div className="mono text-[8px] uppercase text-slate-600">VEHICLE</div>
                        <div className="mono text-sm font-bold text-cyan-300">{selectedVehicle.registration_no}</div>
                      </div>
                      <div>
                        <div className="mono text-[8px] uppercase text-slate-600">TYPE</div>
                        <div className="text-sm font-bold text-white">{selectedVehicle.type} / {selectedVehicle.fuel_type}</div>
                      </div>
                      <div>
                        <div className="mono text-[8px] uppercase text-slate-600">STATUS</div>
                        <div className="text-sm font-bold" style={{ color: statusColors[selectedVehicle.status] }}>
                          {selectedVehicle.status.replace('_', ' ').toUpperCase()}
                        </div>
                      </div>
                      <div>
                        <div className="mono text-[8px] uppercase text-slate-600">SPEED</div>
                        <div className="mono text-sm font-bold text-emerald-400">
                          {(selectedVehicle.current_speed || 0).toFixed(0)} km/h
                        </div>
                      </div>
                    </>
                  )}
                  {selectedShipment && (
                    <>
                      <div>
                        <div className="mono text-[8px] uppercase text-slate-600">CARGO</div>
                        <div className="text-sm font-bold text-cyan-300">{selectedShipment.cargo_type}</div>
                      </div>
                      <div>
                        <div className="mono text-[8px] uppercase text-slate-600">ROUTE</div>
                        <div className="text-xs text-slate-300">{selectedShipment.origin_address} → {selectedShipment.dest_address}</div>
                      </div>
                      <div>
                        <div className="mono text-[8px] uppercase text-slate-600">STATUS</div>
                        <StatusPill status={selectedShipment.status} />
                      </div>
                      <div className="flex-1">
                        <div className="mono text-[8px] uppercase text-slate-600">TRACKING DEPENDENCY</div>
                        <div className="text-[11px] font-bold text-amber-400">
                          {!selectedShipment.assigned_vehicle 
                            ? "Waiting for vehicle assignment" 
                            : !selectedShipment.assigned_driver 
                            ? "Vehicle assigned — awaiting driver" 
                            : (!vehicles.find(v => v.id === selectedShipment.assigned_vehicle)?.current_lat)
                            ? "Driver assigned — GPS unavailable"
                            : <span className="text-emerald-400">Live Tracking Available</span>}
                        </div>
                      </div>
                      {getNextStatus(selectedShipment.status) && (
                        <button
                          onClick={() => advanceStatus(selectedShipment.id, getNextStatus(selectedShipment.status)!)}
                          className="ml-auto bg-cyan-400 px-3 py-1.5 text-[10px] font-bold text-[#03101a] hover:bg-cyan-300"
                        >
                          → {getNextStatus(selectedShipment.status)!.replace('_', ' ').toUpperCase()}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    onClick={() => { setSelectedVehicle(null); setSelectedShipment(null); }}
                    className="ml-auto text-slate-500 hover:text-red-400"
                  >
                    <X size={16} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Toast Notifications */}
      <div className="fixed right-4 top-16 z-[10000] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto flex items-center gap-3 border border-white/[.08] bg-[#091724] px-4 py-3 shadow-xl shadow-black/40 min-w-[280px]"
            >
              <span className="text-lg">{t.icon}</span>
              <div>
                <div className="text-xs font-bold text-white">{t.title}</div>
                <div className="text-[10px] text-slate-500">{t.detail}</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* New Shipment Modal */}
      <AnimatePresence>
        {showShipmentModal && (
          <ShipmentModal
            onClose={() => setShowShipmentModal(false)}
            onCreated={() => { setShowShipmentModal(false); showToast('📦', 'Shipment Created', 'New cargo queued'); refreshData(); setTab('shipments'); }}
          />
        )}
      </AnimatePresence>

      {/* New Vehicle Modal */}
      <AnimatePresence>
        {showVehicleModal && (
          <VehicleModal
            onClose={() => setShowVehicleModal(false)}
            onCreated={() => { setShowVehicleModal(false); showToast('🚛', 'Vehicle Registered', 'New vehicle added'); refreshData(); setTab('fleet'); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Modal Components ---

function ShipmentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [cargo, setCargo] = useState('Emergency Medical Supplies');
  const [weight, setWeight] = useState('600');
  const [priority, setPriority] = useState('high');
  const [req, setReq] = useState('');
  const [instructions, setInstructions] = useState('');

  const [assignmentType, setAssignmentType] = useState<'driver' | 'vehicle' | 'none'>('none');
  const [assignedId, setAssignedId] = useState('');
  
  const [drivers, setDrivers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      apiGet('/api/v1/users?role=driver'),
      apiGet('/api/v1/fleet/vehicles')
    ]).then(([d, v]) => {
      setDrivers(d.data || []);
      setVehicles(v.data || []);
    });
  }, []);

  // Origin geocoding
  const [oAddr, setOAddr] = useState('Sambhal, Uttar Pradesh');
  const [oLat, setOLat] = useState('28.5833');
  const [oLng, setOLng] = useState('78.5667');
  const [oSuggestions, setOSuggestions] = useState<GeocodeResult[]>([]);

  // Dest geocoding
  const [dAddr, setDAddr] = useState('Moradabad, Uttar Pradesh');
  const [dLat, setDLat] = useState('28.8354');
  const [dLng, setDLng] = useState('78.7758');
  const [dSuggestions, setDSuggestions] = useState<GeocodeResult[]>([]);

  const [loading, setLoading] = useState(false);

  const searchGeocode = async (q: string, target: 'origin' | 'dest') => {
    if (!q || q.length < 3) return;
    try {
      const res = await apiGet<GeocodeResult[]>(`/api/v1/routes/geocode?q=${encodeURIComponent(q)}`);
      if (target === 'origin') setOSuggestions(res.data || []);
      else setDSuggestions(res.data || []);
    } catch {
      // Fallback
    }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
        cargo_type: cargo,
        weight_kg: parseFloat(weight),
        requires_vehicle_type: req || null,
        origin_address: oAddr,
        origin_lat: parseFloat(oLat),
        origin_lng: parseFloat(oLng),
        dest_address: dAddr,
        dest_lat: parseFloat(dLat),
        dest_lng: parseFloat(dLng),
        priority,
        special_instructions: instructions || null,
      };

      if (assignmentType === 'driver' && assignedId) payload.assigned_driver = assignedId;
      if (assignmentType === 'vehicle' && assignedId) payload.assigned_vehicle = assignedId;

      await apiPost('/api/v1/shipments', payload);
      onCreated();
    } catch (e: any) {
      alert('Failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="w-[500px] max-h-[90vh] overflow-y-auto border border-white/10 bg-[#091827] p-6 shadow-2xl space-y-3"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">📦 Create Shipment</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>

        <FieldLabel label="Cargo Description">
          <input value={cargo} onChange={e => setCargo(e.target.value)} required className="form-input" />
        </FieldLabel>

        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Weight (kg)">
            <input type="number" value={weight} onChange={e => setWeight(e.target.value)} required className="form-input" />
          </FieldLabel>
          <FieldLabel label="Priority">
            <select value={priority} onChange={e => setPriority(e.target.value)} className="form-input">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </FieldLabel>
        </div>

        <FieldLabel label="Vehicle Requirement">
          <select value={req} onChange={e => setReq(e.target.value)} className="form-input">
            <option value="">Any</option>
            <option value="refrigerated">Refrigerated</option>
            <option value="heavy">Heavy</option>
            <option value="medium">Medium</option>
            <option value="light">Light</option>
          </select>
        </FieldLabel>

        {/* Origin with Geocoding */}
        <div className="rounded border border-white/10 bg-white/[0.02] p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
            <span>Origin Location</span>
            <span className="mono text-[10px] text-slate-400">{oLat}, {oLng}</span>
          </div>
          <div className="flex gap-2">
            <input
              value={oAddr}
              onChange={e => { setOAddr(e.target.value); searchGeocode(e.target.value, 'origin'); }}
              placeholder="City or location name..."
              required
              className="form-input flex-1"
            />
            <button
              type="button"
              onClick={() => searchGeocode(oAddr, 'origin')}
              className="border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400"
            >
              Resolve
            </button>
          </div>
          {oSuggestions.length > 0 && (
            <div className="max-h-24 overflow-y-auto rounded border border-white/10 bg-[#040e1a] text-[11px]">
              {oSuggestions.map((s, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setOAddr(s.display_name);
                    setOLat(s.lat.toString());
                    setOLng(s.lng.toString());
                    setOSuggestions([]);
                  }}
                  className="cursor-pointer p-1.5 hover:bg-cyan-500/10 text-slate-300 border-b border-white/5 last:border-none"
                >
                  {s.display_name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Destination with Geocoding */}
        <div className="rounded border border-white/10 bg-white/[0.02] p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-red-400">
            <span>Destination Location</span>
            <span className="mono text-[10px] text-slate-400">{dLat}, {dLng}</span>
          </div>
          <div className="flex gap-2">
            <input
              value={dAddr}
              onChange={e => { setDAddr(e.target.value); searchGeocode(e.target.value, 'dest'); }}
              placeholder="City or location name..."
              required
              className="form-input flex-1"
            />
            <button
              type="button"
              onClick={() => searchGeocode(dAddr, 'dest')}
              className="border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-400"
            >
              Resolve
            </button>
          </div>
          {dSuggestions.length > 0 && (
            <div className="max-h-24 overflow-y-auto rounded border border-white/10 bg-[#040e1a] text-[11px]">
              {dSuggestions.map((s, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setDAddr(s.display_name);
                    setDLat(s.lat.toString());
                    setDLng(s.lng.toString());
                    setDSuggestions([]);
                  }}
                  className="cursor-pointer p-1.5 hover:bg-red-500/10 text-slate-300 border-b border-white/5 last:border-none"
                >
                  {s.display_name}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unified Assignment Panel */}
        <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-3 space-y-2 mt-4">
          <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Link size={12} /> Operational Assignment
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-300">
              Assign By:
              <select value={assignmentType} onChange={e => { setAssignmentType(e.target.value as any); setAssignedId(''); }} className="form-input mt-1">
                <option value="none">Create Pending (No Assignment)</option>
                <option value="driver">Search by Driver</option>
                <option value="vehicle">Search by Vehicle</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-300">
              Selection:
              <select 
                value={assignedId} 
                onChange={e => setAssignedId(e.target.value)} 
                disabled={assignmentType === 'none'}
                className="form-input mt-1 disabled:opacity-50"
              >
                <option value="">-- Select --</option>
                {assignmentType === 'driver' && drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name} {vehicles.find(v => v.assigned_driver === d.id) ? `(Vehicle: ${vehicles.find(v => v.assigned_driver === d.id)?.registration_no})` : '(No Vehicle!)'}</option>
                ))}
                {assignmentType === 'vehicle' && vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.registration_no} {v.assigned_driver ? `(Driver: ${drivers.find(d => d.id === v.assigned_driver)?.name})` : '(No Driver!)'}</option>
                ))}
              </select>
            </label>
          </div>
          {assignmentType !== 'none' && assignedId && (
            <div className="mt-2 text-[10px] text-emerald-400 flex items-center gap-1">
              <CheckCircle size={10} /> Valid relationship selected. Shipment will be operational immediately.
            </div>
          )}
          {assignmentType === 'none' && (
            <div className="mt-2 text-[10px] text-amber-500 flex items-center gap-1">
              <AlertCircle size={10} /> Assign a Driver and Vehicle before finalizing shipment for live tracking.
            </div>
          )}
        </div>

        <FieldLabel label="Special Instructions">
          <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2} className="form-input" placeholder="Handle with care..." />
        </FieldLabel>

        <button type="submit" disabled={loading} className="mt-4 w-full bg-cyan-400 py-3 text-sm font-bold text-[#03101a] hover:bg-cyan-300 disabled:opacity-60">
          {loading ? 'Creating...' : (assignmentType !== 'none' && assignedId ? 'Finalize & Allocate' : 'Create Pending Shipment')}
        </button>
      </motion.form>
    </motion.div>
  );
}

function VehicleModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<User[]>([]);

  useEffect(() => {
    apiGet<User[]>('/api/v1/users?role=driver').then(res => setDrivers(res.data || []));
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    try {
      await apiPost('/api/v1/fleet/vehicles', {
        registration_no: fd.get('reg'),
        type: fd.get('type'),
        fuel_type: fd.get('fuel'),
        assigned_driver: fd.get('assigned_driver'),
        capacity_kg: parseFloat(fd.get('cap') as string),
        current_lat: parseFloat(fd.get('lat') as string) || null,
        current_lng: parseFloat(fd.get('lng') as string) || null,
      });
      onCreated();
    } catch (e: any) {
      alert('Failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.form
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 8 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        onSubmit={submit}
        onClick={e => e.stopPropagation()}
        className="w-[420px] border border-white/10 bg-[#091827] p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">🚛 Register Vehicle</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-white"><X size={18} /></button>
        </div>
        <FieldLabel label="Registration Number"><input name="reg" required placeholder="KA-01-XX-0000" className="form-input" /></FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Type">
            <select name="type" className="form-input"><option value="light">Light</option><option value="medium" selected>Medium</option><option value="heavy">Heavy</option><option value="refrigerated">Refrigerated</option></select>
          </FieldLabel>
          <FieldLabel label="Fuel">
            <select name="fuel" className="form-input"><option value="diesel" selected>Diesel</option><option value="petrol">Petrol</option><option value="electric">Electric</option><option value="cng">CNG</option></select>
          </FieldLabel>
        </div>
        <FieldLabel label="Capacity (kg)"><input name="cap" type="number" required defaultValue="5000" className="form-input" /></FieldLabel>
        <FieldLabel label="Assign Driver *">
          <select name="assigned_driver" required className="form-input">
            <option value="" disabled selected>Select Driver</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </FieldLabel>
        <div className="grid grid-cols-2 gap-3">
          <FieldLabel label="Start Lat"><input name="lat" type="number" step="any" defaultValue="12.9716" className="form-input" /></FieldLabel>
          <FieldLabel label="Start Lng"><input name="lng" type="number" step="any" defaultValue="77.5946" className="form-input" /></FieldLabel>
        </div>
        <button type="submit" disabled={loading} className="mt-4 w-full bg-cyan-400 py-3 text-sm font-bold text-[#03101a] hover:bg-cyan-300 disabled:opacity-60">
          {loading ? 'Registering...' : 'Register Vehicle'}
        </button>
      </motion.form>
    </motion.div>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mono text-[9px] uppercase tracking-[.15em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
