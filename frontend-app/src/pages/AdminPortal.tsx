import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { DriverVehicleAllocationPanel } from '../components/DriverVehicleAllocationPanel';
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  type User,
  type Vehicle,
  type Shipment,
  type GeocodeResult,
  type AnalyticsSummary
} from '../lib/api';
import {
  Shield,
  Users,
  Truck,
  Package,
  Activity,
  Plus,
  Trash2,
  Edit2,
  Search,
  CheckCircle,
  XCircle,
  ExternalLink,
  Sun,
  Moon,
  LogOut,
  LayoutDashboard,
  Link
} from 'lucide-react';

interface AdminPortalProps {
  onSwitchToCommandCenter?: () => void;
}

type AdminTab = 'users' | 'fleet' | 'allocation' | 'shipments' | 'analytics';

export default function AdminPortal({ onSwitchToCommandCenter }: AdminPortalProps) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Data states
  const [usersList, setUsersList] = useState<User[]>([]);
  const [vehiclesList, setVehiclesList] = useState<Vehicle[]>([]);
  const [shipmentsList, setShipmentsList] = useState<Shipment[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  // Modals
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showShipmentModal, setShowShipmentModal] = useState(false);

  // Filters & Search
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = async () => {
    try {
      const res = await apiGet<User[]>(`/api/v1/users?search=${encodeURIComponent(userSearch)}&role=${roleFilter}`);
      setUsersList(res.data || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load users');
    }
  };

  const fetchFleet = async () => {
    try {
      const res = await apiGet<Vehicle[]>('/api/v1/fleet/vehicles');
      setVehiclesList(res.data || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load vehicles');
    }
  };

  const fetchShipments = async () => {
    try {
      const res = await apiGet<Shipment[]>('/api/v1/shipments');
      setShipmentsList(res.data || []);
    } catch (err: any) {
      showToast(err.message || 'Failed to load shipments');
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await apiGet<AnalyticsSummary>('/api/v1/shipments/analytics/summary');
      setAnalytics(res.data || null);
    } catch (err: any) {
      showToast(err.message || 'Failed to load analytics');
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchUsers(), fetchFleet(), fetchShipments(), fetchAnalytics()]).finally(() => {
      setLoading(false);
    });
  }, [userSearch, roleFilter]);

  // User Actions
  const handleToggleUserActive = async (u: User) => {
    try {
      const newStatus = u.is_active === 1 ? 0 : 1;
      await apiPut(`/api/v1/users/${u.id}`, { is_active: newStatus });
      showToast(`User ${u.name} ${newStatus === 1 ? 'activated' : 'deactivated'}`);
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Action failed');
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await apiDelete(`/api/v1/users/${userId}`);
      showToast('User deleted');
      fetchUsers();
    } catch (err: any) {
      showToast(err.message || 'Delete failed');
    }
  };

  // Vehicle Actions
  const handleDeleteVehicle = async (vehicleId: string) => {
    if (!window.confirm('Delete this vehicle from fleet?')) return;
    try {
      await apiDelete(`/api/v1/fleet/vehicles/${vehicleId}`);
      showToast('Vehicle deleted');
      fetchFleet();
    } catch (err: any) {
      showToast(err.message || 'Delete failed');
    }
  };

  // Shipment Actions
  const handleDeleteShipment = async (shipmentId: string) => {
    if (!window.confirm('Delete this shipment record?')) return;
    try {
      await apiDelete(`/api/v1/shipments/${shipmentId}`);
      showToast('Shipment deleted');
      fetchShipments();
    } catch (err: any) {
      showToast(err.message || 'Delete failed');
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors duration-200">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded border border-cyan-500/40 bg-[#06111e] px-4 py-2 text-xs font-semibold text-cyan-300 shadow-2xl">
          {toast}
        </div>
      )}

      {/* Admin Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 px-4 sm:px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-purple-500/50 bg-purple-500/10 text-purple-400">
            <Shield size={17} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold tracking-tight">Admin Management Console</span>
              <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-purple-400">
                Superuser
              </span>
            </div>
            <span className="mono text-[10px] text-[hsl(var(--muted-foreground))]">
              Session: {user?.email}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onSwitchToCommandCenter && (
            <button
              onClick={onSwitchToCommandCenter}
              className="flex items-center gap-1.5 rounded border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400 hover:bg-cyan-500/20"
            >
              <LayoutDashboard size={14} />
              <span className="hidden sm:inline">Launch Command Center</span>
            </button>
          )}

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

      {/* Admin Navigation Tabs */}
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/50 px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'users'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Users size={14} /> Users & RBAC ({usersList.length})
          </button>

          <button
            onClick={() => setActiveTab('fleet')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'fleet'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Truck size={14} /> Fleet Vehicles ({vehiclesList.length})
          </button>

          <button
            onClick={() => setActiveTab('allocation')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'allocation'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Link size={14} /> Allocation
          </button>

          <button
            onClick={() => setActiveTab('shipments')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'shipments'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Package size={14} /> Shipments ({shipmentsList.length})
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-bold transition-all ${
              activeTab === 'analytics'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}
          >
            <Activity size={14} /> System & Metrics
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        {loading && (
          <div className="mb-4 text-xs font-semibold text-cyan-400">Synchronizing database...</div>
        )}
        {/* USERS TAB */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-2.5 text-[hsl(var(--muted-foreground))]" />
                  <input
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1.5 pl-8 pr-3 text-xs placeholder:text-[hsl(var(--muted-foreground))] focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={e => setRoleFilter(e.target.value)}
                  className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1.5 text-xs text-[hsl(var(--foreground))] focus:border-cyan-400 focus:outline-none"
                >
                  <option value="">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="driver">Driver</option>
                  <option value="client">Client</option>
                </select>
              </div>

              <button
                onClick={() => { setEditingUser(null); setShowUserModal(true); }}
                className="flex items-center gap-1.5 rounded bg-cyan-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-cyan-300"
              >
                <Plus size={14} /> Add User
              </button>
            </div>

            {/* Users Table */}
            <div className="overflow-x-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="p-3">User Name</th>
                    <th className="p-3">Email Address</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {usersList.map(u => (
                    <tr key={u.id} className="hover:bg-[hsl(var(--secondary))]/50">
                      <td className="p-3 font-semibold">{u.name}</td>
                      <td className="p-3 mono text-[hsl(var(--muted-foreground))]">{u.email}</td>
                      <td className="p-3">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          u.role === 'admin'
                            ? 'bg-purple-500/10 text-purple-400'
                            : u.role === 'dispatcher'
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="p-3 mono text-[hsl(var(--muted-foreground))]">{u.phone || '—'}</td>
                      <td className="p-3">
                        <button
                          onClick={() => handleToggleUserActive(u)}
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase transition-all ${
                            u.is_active === 1
                              ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                              : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          }`}
                        >
                          {u.is_active === 1 ? <CheckCircle size={11} /> : <XCircle size={11} />}
                          {u.is_active === 1 ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="p-3 mono text-[10px] text-[hsl(var(--muted-foreground))]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => { setEditingUser(u); setShowUserModal(true); }}
                            className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))] hover:text-cyan-400"
                            title="Edit User"
                          >
                            <Edit2 size={13} />
                          </button>
                          {u.id !== user?.id && (
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400"
                              title="Delete User"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FLEET TAB */}
        {activeTab === 'fleet' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Vehicle Fleet Roster</h2>
              <button
                onClick={() => setShowVehicleModal(true)}
                className="flex items-center gap-1.5 rounded bg-cyan-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-cyan-300"
              >
                <Plus size={14} /> Register Vehicle
              </button>
            </div>

            <div className="overflow-x-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="p-3">Reg. Number</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Fuel</th>
                    <th className="p-3">Capacity</th>
                    <th className="p-3">Assigned Driver</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {vehiclesList.map(v => (
                    <tr key={v.id} className="hover:bg-[hsl(var(--secondary))]/50">
                      <td className="p-3 font-semibold mono text-cyan-400">{v.registration_no}</td>
                      <td className="p-3 capitalize">{v.type}</td>
                      <td className="p-3 uppercase mono text-[hsl(var(--muted-foreground))]">{v.fuel_type}</td>
                      <td className="p-3 mono tabular-nums">{v.capacity_kg} kg</td>
                      <td className="p-3 font-semibold">{v.driver_name || <span className="text-[hsl(var(--muted-foreground))]">Unassigned</span>}</td>
                      <td className="p-3">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          v.status === 'available'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : v.status === 'en_route'
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteVehicle(v.id)}
                          className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400"
                          title="Delete Vehicle"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ALLOCATION TAB */}
        {activeTab === 'allocation' && (
          <div className="h-full">
            <h2 className="mb-6 text-sm font-bold">Driver ↔ Vehicle Allocation</h2>
            <div className="h-full">
              <DriverVehicleAllocationPanel />
            </div>
          </div>
        )}

        {/* SHIPMENTS TAB */}
        {activeTab === 'shipments' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Cargo & Logistics Manifests</h2>
              <button
                onClick={() => setShowShipmentModal(true)}
                className="flex items-center gap-1.5 rounded bg-cyan-400 px-3 py-1.5 text-xs font-bold text-black hover:bg-cyan-300"
              >
                <Plus size={14} /> Create Shipment
              </button>
            </div>

            <div className="overflow-x-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]">
                  <tr>
                    <th className="p-3">Cargo Description</th>
                    <th className="p-3">Origin</th>
                    <th className="p-3">Destination</th>
                    <th className="p-3">Weight</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Tracking Link</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--border))]">
                  {shipmentsList.map(s => (
                    <tr key={s.id} className="hover:bg-[hsl(var(--secondary))]/50">
                      <td className="p-3 font-semibold">{s.cargo_type}</td>
                      <td className="p-3 text-[hsl(var(--muted-foreground))]">{s.origin_address}</td>
                      <td className="p-3 text-[hsl(var(--muted-foreground))]">{s.dest_address}</td>
                      <td className="p-3 mono tabular-nums">{s.weight_kg} kg</td>
                      <td className="p-3">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          s.status === 'delivered'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : s.status === 'in_transit'
                            ? 'bg-cyan-500/10 text-cyan-400'
                            : 'bg-amber-500/10 text-amber-400'
                        }`}>
                          {s.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="p-3 mono text-[10px]">
                        <a
                          href={`/tracking.html#${s.tracking_token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                        >
                          {s.tracking_token.substring(0, 10)}... <ExternalLink size={11} />
                        </a>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleDeleteShipment(s.id)}
                          className="rounded p-1 text-[hsl(var(--muted-foreground))] hover:bg-red-500/10 hover:text-red-400"
                          title="Delete Shipment"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ANALYTICS & AUDIT TAB */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <span className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">Total Fleet Vehicles</span>
                <p className="mono mt-1 text-2xl font-bold tabular-nums text-cyan-400">{analytics?.fleet.total ?? vehiclesList.length}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                  <span>Available: {analytics?.fleet.available ?? 0}</span>
                  <span>·</span>
                  <span>En Route: {analytics?.fleet.en_route ?? 0}</span>
                </div>
              </div>

              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <span className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">Total Cargo Shipments</span>
                <p className="mono mt-1 text-2xl font-bold tabular-nums text-emerald-400">{analytics?.shipments.total ?? shipmentsList.length}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                  <span>Delivered: {analytics?.shipments.delivered ?? 0}</span>
                  <span>·</span>
                  <span>In Transit: {analytics?.shipments.in_transit ?? 0}</span>
                </div>
              </div>

              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <span className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">Cargo Tonnage Handled</span>
                <p className="mono mt-1 text-2xl font-bold tabular-nums">
                  {analytics?.total_cargo_weight_kg ? `${(analytics.total_cargo_weight_kg / 1000).toFixed(1)} T` : '0 T'}
                </p>
                <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Aggregated payload weight</p>
              </div>

              <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
                <span className="text-[10px] font-bold uppercase text-[hsl(var(--muted-foreground))]">Telemetry GPS Events (24h)</span>
                <p className="mono mt-1 text-2xl font-bold tabular-nums text-purple-400">{analytics?.gps_events_24h ?? 0}</p>
                <p className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">Real-time coordinates logged</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* USER MODAL */}
      {showUserModal && (
        <UserModal
          user={editingUser}
          onClose={() => setShowUserModal(false)}
          onSaved={() => { setShowUserModal(false); fetchUsers(); showToast('User saved successfully'); }}
        />
      )}

      {/* VEHICLE MODAL */}
      {showVehicleModal && (
        <VehicleModal
          drivers={usersList.filter(u => u.role === 'driver')}
          onClose={() => setShowVehicleModal(false)}
          onSaved={() => { setShowVehicleModal(false); fetchFleet(); showToast('Vehicle registered'); }}
        />
      )}

      {/* SHIPMENT MODAL */}
      {showShipmentModal && (
        <ShipmentModal
          onClose={() => setShowShipmentModal(false)}
          onSaved={() => { setShowShipmentModal(false); fetchShipments(); showToast('Shipment created'); }}
        />
      )}
    </div>
  );
}

// User Modal Component
function UserModal({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>(user?.role || 'driver');
  const [phone, setPhone] = useState(user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (user) {
        // Update
        await apiPut(`/api/v1/users/${user.id}`, { name, email, role, phone, ...(password ? { password } : {}) });
      } else {
        // Create
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');
        await apiPost('/api/v1/users', { name, email, password, role, phone });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Error saving user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl">
        <h3 className="text-sm font-bold">{user ? 'Edit User Record' : 'Register New User'}</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold">
            Full Name
            <input value={name} onChange={e => setName(e.target.value)} required className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]" />
          </label>
          <label className="block text-xs font-semibold">
            Email Address
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]" />
          </label>
          <label className="block text-xs font-semibold">
            Password {user && <span className="text-[hsl(var(--muted-foreground))]">(Leave blank to keep current)</span>}
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={user ? '••••••••' : 'Minimum 6 chars'} className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]" />
          </label>
          <label className="block text-xs font-semibold">
            System Role
            <select value={role} onChange={e => setRole(e.target.value as User['role'])} className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]">
              <option value="driver">Driver (Mobile Terminal Access)</option>
              <option value="dispatcher">Dispatcher (Command Center)</option>
              <option value="admin">Administrator (Full Access)</option>
            </select>
          </label>
          <label className="block text-xs font-semibold">
            Contact Phone
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 98765 43210" className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]" />
          </label>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="mt-4 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">Cancel</button>
            <button type="submit" disabled={loading} className="rounded bg-cyan-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50">{loading ? 'Saving...' : 'Save User'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Vehicle Modal Component
function VehicleModal({ drivers, onClose, onSaved }: { drivers: User[]; onClose: () => void; onSaved: () => void }) {
  const [regNo, setRegNo] = useState('');
  const [type, setType] = useState('medium');
  const [capacity, setCapacity] = useState('5000');
  const [fuel, setFuel] = useState('diesel');
  const [assignedDriver, setAssignedDriver] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await apiPost('/api/v1/fleet/vehicles', {
        registration_no: regNo.toUpperCase().trim(),
        type,
        capacity_kg: parseFloat(capacity),
        fuel_type: fuel,
        assigned_driver: assignedDriver || null
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Error registering vehicle');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl">
        <h3 className="text-sm font-bold">Register Fleet Vehicle</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-xs font-semibold">
            Registration Plate
            <input value={regNo} onChange={e => setRegNo(e.target.value)} placeholder="e.g. KA-01-AB-1234" required className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs uppercase text-[hsl(var(--foreground))]" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold">
              Vehicle Class
              <select value={type} onChange={e => setType(e.target.value)} className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]">
                <option value="light">Light Truck (1.5T)</option>
                <option value="medium">Medium Hauler (5T)</option>
                <option value="heavy">Heavy Semi (12T)</option>
                <option value="refrigerated">Refrigerated Reefer</option>
              </select>
            </label>
            <label className="block text-xs font-semibold">
              Fuel Engine
              <select value={fuel} onChange={e => setFuel(e.target.value)} className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]">
                <option value="diesel">Diesel</option>
                <option value="cng">CNG</option>
                <option value="electric">Electric (EV)</option>
                <option value="petrol">Petrol</option>
              </select>
            </label>
          </div>
          <label className="block text-xs font-semibold">
            Payload Capacity (kg)
            <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} required className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]" />
          </label>
          <label className="block text-xs font-semibold">
            Assign Driver *
            <select value={assignedDriver} onChange={e => setAssignedDriver(e.target.value)} required className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]">
              <option value="" disabled>Select Driver</option>
              {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name} ({d.email})</option>
              ))}
            </select>
          </label>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="mt-4 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">Cancel</button>
            <button type="submit" disabled={loading} className="rounded bg-cyan-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50">{loading ? 'Registering...' : 'Register Vehicle'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Shipment Modal with Geocoding
function ShipmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [cargo, setCargo] = useState('Medical Equipment');
  const [weight, setWeight] = useState('850');
  const [priority, setPriority] = useState('high');

  // Origin Geocoding
  const [originQuery, setOriginQuery] = useState('Sambhal, Uttar Pradesh');
  const [originLat, setOriginLat] = useState('28.5833');
  const [originLng, setOriginLng] = useState('78.5667');
  const [originSuggestions, setOriginSuggestions] = useState<GeocodeResult[]>([]);

  // Dest Geocoding
  const [destQuery, setDestQuery] = useState('Moradabad, Uttar Pradesh');
  const [destLat, setDestLat] = useState('28.8354');
  const [destLng, setDestLng] = useState('78.7758');
  const [destSuggestions, setDestSuggestions] = useState<GeocodeResult[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const searchGeocode = async (q: string, type: 'origin' | 'dest') => {
    if (!q || q.length < 3) return;
    try {
      const res = await apiGet<GeocodeResult[]>(`/api/v1/routes/geocode?q=${encodeURIComponent(q)}`);
      if (type === 'origin') setOriginSuggestions(res.data || []);
      else setDestSuggestions(res.data || []);
    } catch {
      // geocode fallback
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr('');
    try {
      await apiPost('/api/v1/shipments', {
        cargo_type: cargo,
        weight_kg: parseFloat(weight),
        priority,
        origin_address: originQuery,
        origin_lat: parseFloat(originLat),
        origin_lng: parseFloat(originLng),
        dest_address: destQuery,
        dest_lat: parseFloat(destLat),
        dest_lng: parseFloat(destLng),
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message || 'Error creating shipment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold">Dispatch New Cargo Manifest</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-semibold">
              Cargo Description
              <input value={cargo} onChange={e => setCargo(e.target.value)} required className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]" />
            </label>
            <label className="block text-xs font-semibold">
              Payload Weight (kg)
              <input type="number" value={weight} onChange={e => setWeight(e.target.value)} required className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]" />
            </label>
          </div>

          <label className="block text-xs font-semibold">
            Priority Class
            <select value={priority} onChange={e => setPriority(e.target.value)} className="mt-1 w-full rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] px-3 py-1.5 text-xs text-[hsl(var(--foreground))]">
              <option value="low">Low Priority</option>
              <option value="medium">Standard Priority</option>
              <option value="high">High Priority</option>
              <option value="urgent">Urgent Express</option>
            </select>
          </label>

          {/* Origin Geocoding Field */}
          <div className="space-y-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/50 p-2.5">
            <label className="block text-xs font-semibold text-emerald-400">Origin Location</label>
            <div className="flex gap-2">
              <input
                value={originQuery}
                onChange={e => { setOriginQuery(e.target.value); searchGeocode(e.target.value, 'origin'); }}
                placeholder="Type city or address..."
                required
                className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]"
              />
              <button
                type="button"
                onClick={() => searchGeocode(originQuery, 'origin')}
                className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-400"
              >
                Resolve
              </button>
            </div>
            {originSuggestions.length > 0 && (
              <div className="mt-1 max-h-24 overflow-y-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[11px]">
                {originSuggestions.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setOriginQuery(s.display_name);
                      setOriginLat(s.lat.toString());
                      setOriginLng(s.lng.toString());
                      setOriginSuggestions([]);
                    }}
                    className="cursor-pointer p-1.5 hover:bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))]/50 last:border-none"
                  >
                    {s.display_name}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1 mono text-[10px] text-[hsl(var(--muted-foreground))]">
              <span>Lat: {originLat}</span>
              <span>Lng: {originLng}</span>
            </div>
          </div>

          {/* Dest Geocoding Field */}
          <div className="space-y-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))]/50 p-2.5">
            <label className="block text-xs font-semibold text-red-400">Destination Location</label>
            <div className="flex gap-2">
              <input
                value={destQuery}
                onChange={e => { setDestQuery(e.target.value); searchGeocode(e.target.value, 'dest'); }}
                placeholder="Type city or address..."
                required
                className="flex-1 rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))]"
              />
              <button
                type="button"
                onClick={() => searchGeocode(destQuery, 'dest')}
                className="rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400"
              >
                Resolve
              </button>
            </div>
            {destSuggestions.length > 0 && (
              <div className="mt-1 max-h-24 overflow-y-auto rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[11px]">
                {destSuggestions.map((s, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setDestQuery(s.display_name);
                      setDestLat(s.lat.toString());
                      setDestLng(s.lng.toString());
                      setDestSuggestions([]);
                    }}
                    className="cursor-pointer p-1.5 hover:bg-[hsl(var(--secondary))] border-b border-[hsl(var(--border))]/50 last:border-none"
                  >
                    {s.display_name}
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1 mono text-[10px] text-[hsl(var(--muted-foreground))]">
              <span>Lat: {destLat}</span>
              <span>Lng: {destLng}</span>
            </div>
          </div>

          {err && <p className="text-xs text-red-400">{err}</p>}

          <div className="mt-4 flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--secondary))]">Cancel</button>
            <button type="submit" disabled={loading} className="rounded bg-cyan-400 px-4 py-1.5 text-xs font-bold text-black hover:bg-cyan-300 disabled:opacity-50">{loading ? 'Creating...' : 'Create Manifest'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
