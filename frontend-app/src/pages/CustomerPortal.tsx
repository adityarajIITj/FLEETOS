import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { apiGet, type Shipment, type Vehicle } from '../lib/api';
import {
  Package,
  MapPin,
  Clock,
  LogOut,
  Sun,
  Moon,
  RefreshCw,
  Navigation
} from 'lucide-react';
import FleetMap from '../components/FleetMap';

export default function CustomerPortal() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [etaMinutes, setEtaMinutes] = useState<number | null>(null);
  const [liveVehicle, setLiveVehicle] = useState<Vehicle | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const sRes = await apiGet<Shipment[]>('/api/v1/shipments');
      const myShipments = sRes.data || [];
      setShipments(myShipments);

      if (!selectedShipment && myShipments.length > 0) {
        handleSelectShipment(myShipments[0]);
      } else if (selectedShipment) {
        handleSelectShipment(myShipments.find(s => s.id === selectedShipment.id) || null);
      }
    } catch (err) {
      console.error('Failed to load shipments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectShipment = async (shipment: Shipment | null) => {
    setSelectedShipment(shipment);
    if (!shipment) return;

    try {
      const detailRes = await apiGet<any>(`/api/v1/shipments/${shipment.id}`);
      const detail = detailRes.data;
      
      if (detail.assigned_vehicle && detail.vehicle_lat && detail.vehicle_lng) {
        setLiveVehicle({
          id: detail.assigned_vehicle,
          registration_no: detail.vehicle_reg || 'Assigned Vehicle',
          type: detail.requires_vehicle_type || 'medium',
          fuel_type: 'diesel',
          capacity_kg: 0,
          status: 'en_route',
          current_lat: detail.vehicle_lat,
          current_lng: detail.vehicle_lng,
          current_speed: detail.vehicle_speed || 0,
        });
      } else {
        setLiveVehicle(null);
      }

      if (['picked_up', 'in_transit'].includes(detail.status)) {
        const etaRes = await apiGet<any>(`/api/v1/shipments/${shipment.id}/eta`);
        setEtaMinutes(etaRes.data?.eta_minutes ?? null);
      } else {
        setEtaMinutes(null);
      }
    } catch (err) {
      console.error('Failed to load shipment details', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // Auto-refresh every 15s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-screen w-full flex-col bg-[hsl(var(--background))] text-[hsl(var(--foreground))] transition-colors duration-200">
      
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]/90 px-4 sm:px-6 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded border border-cyan-400/50 bg-cyan-400/10 text-cyan-400">
            <Package size={17} />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">Customer Tracking</div>
            <div className="mono text-[10px] text-[hsl(var(--muted-foreground))]">
              {user?.name} ({user?.email})
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded border border-[hsl(var(--border))] bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]"
            title="Toggle Theme"
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

      {/* Main Content */}
      <main className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar - Shipment List */}
        <div className="w-full sm:w-80 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] flex flex-col">
          <div className="p-4 border-b border-[hsl(var(--border))]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
              Your Shipments
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading && shipments.length === 0 ? (
              <div className="flex justify-center p-8">
                <RefreshCw className="animate-spin text-cyan-400" size={20} />
              </div>
            ) : shipments.length === 0 ? (
              <div className="text-center p-6 text-sm text-[hsl(var(--muted-foreground))]">
                No active shipments found.
              </div>
            ) : (
              shipments.map(s => (
                <button
                  key={s.id}
                  onClick={() => handleSelectShipment(s)}
                  className={`w-full text-left rounded border p-3 transition-all ${
                    selectedShipment?.id === s.id
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-[hsl(var(--border))] bg-[hsl(var(--secondary))] hover:border-cyan-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-bold text-sm truncate pr-2">{s.cargo_type}</span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                      s.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-cyan-500/10 text-cyan-400'
                    }`}>
                      {s.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                    <MapPin size={10} />
                    <span className="truncate">{s.origin_address} → {s.dest_address}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Content - Map & Details */}
        <div className="hidden sm:flex flex-col flex-1 relative bg-[hsl(var(--background))]">
          {selectedShipment ? (
            <>
              {/* Top overlay details */}
              <div className="absolute top-4 left-4 right-4 z-10 flex gap-4 pointer-events-none">
                <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 p-4 shadow-xl backdrop-blur-md pointer-events-auto max-w-sm w-full">
                  <h3 className="text-lg font-bold mb-1 text-cyan-400">{selectedShipment.cargo_type}</h3>
                  <div className="mono text-[10px] text-[hsl(var(--muted-foreground))] mb-4 uppercase tracking-widest">
                    ID: {selectedShipment.id.split('-')[0]}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5"><MapPin size={14} className="text-emerald-400" /></div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[hsl(var(--muted-foreground))]">Origin</div>
                        <div className="text-sm">{selectedShipment.origin_address}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5"><MapPin size={14} className="text-red-400" /></div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-[hsl(var(--muted-foreground))]">Destination</div>
                        <div className="text-sm">{selectedShipment.dest_address}</div>
                      </div>
                    </div>

                    <div className="h-px w-full bg-[hsl(var(--border))] my-2" />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Navigation size={14} className="text-cyan-400" />
                        <span className="text-xs font-semibold">Vehicle</span>
                      </div>
                      <span className="text-xs">{liveVehicle ? liveVehicle.registration_no : 'Pending Assignment'}</span>
                    </div>

                    {etaMinutes !== null && (
                      <div className="flex items-center justify-between rounded bg-cyan-500/10 px-3 py-2 border border-cyan-500/20">
                        <div className="flex items-center gap-2">
                          <Clock size={14} className="text-cyan-400" />
                          <span className="text-xs font-semibold text-cyan-400">ETA</span>
                        </div>
                        <span className="text-sm font-bold">{etaMinutes} mins</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Map */}
              <div className="flex-1">
                <FleetMap
                  vehicles={liveVehicle ? [liveVehicle] : []}
                  shipments={[]}
                  selectedVehicle={null}
                  selectedShipment={selectedShipment}
                  onSelectVehicle={() => {}}
                  geofenceActive={false}
                  showAllRoutes={false}
                />
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))] text-sm">
              Select a shipment to view live tracking.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
