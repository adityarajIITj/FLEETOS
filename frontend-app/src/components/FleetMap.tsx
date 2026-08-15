import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, type Vehicle, type Shipment } from '../lib/api';
import { useTheme } from '../hooks/useTheme';

interface FleetMapProps {
  vehicles: Vehicle[];
  shipments: Shipment[];
  selectedVehicle: Vehicle | null;
  selectedShipment: Shipment | null;
  onSelectVehicle: (v: Vehicle) => void;
  geofenceActive: boolean;
  showAllRoutes: boolean;
  trailActive?: boolean;
}

const statusColors: Record<string, string> = {
  available: '#10b981',
  en_route: '#06b6d4',
  idle: '#f59e0b',
  maintenance: '#ef4444',
};

// Sleek SVG Vehicle Marker with Status Beacon
function createVehicleIcon(status: string, heading: number = 0) {
  const color = statusColors[status] || '#06b6d4';
  const svg = `
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.5"/>
      <g transform="rotate(${heading}, 16, 16)">
        <path d="M16 6L23 22L16 18L9 22L16 6Z" fill="${color}" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>
      </g>
    </svg>
  `;

  return L.divIcon({
    className: 'fleet-vehicle-blip',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
    html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.4));">${svg}</div>`,
  });
}

// Sleek SVG Pin Icon for Origin/Destination
function createPinIcon(color: string, type: 'origin' | 'dest') {
  const innerSymbol = type === 'origin' ? '●' : '▲';
  return L.divIcon({
    className: 'fleet-pin-marker',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `
      <div style="width:22px;height:22px;border-radius:50%;background:${color};border:2px solid #ffffff;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:10px;font-weight:900;box-shadow:0 2px 6px rgba(0,0,0,0.4);">
        ${innerSymbol}
      </div>
    `,
  });
}

export default function FleetMap({
  vehicles,
  shipments,
  selectedVehicle,
  selectedShipment,
  onSelectVehicle,
  geofenceActive,
  showAllRoutes,
  trailActive = false,
}: FleetMapProps) {
  const { theme } = useTheme();
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const shipmentMarkersRef = useRef<L.Marker[]>([]);
  const routeLayerRef = useRef<L.GeoJSON | null>(null);
  const allRoutesLayersRef = useRef<L.Layer[]>([]);
  const trailLayerRef = useRef<L.Polyline | null>(null);
  const geofenceLayerRef = useRef<L.Circle[]>([]);
  const hasFitRef = useRef(false);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false }).setView([12.9716, 77.5946], 11);
    
    const tileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    const tileLayer = L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap © CARTO',
    }).addTo(map);

    tileLayerRef.current = tileLayer;
    L.control.zoom({ position: 'topright' }).addTo(map);
    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 100);
    setTimeout(() => map.invalidateSize(), 500);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map tiles when theme changes
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return;
    const tileUrl = theme === 'light'
      ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

    tileLayerRef.current.setUrl(tileUrl);
  }, [theme]);

  // Update vehicle markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const bounds: L.LatLngTuple[] = [];

    vehicles.forEach(v => {
      if (!v.current_lat || !v.current_lng) return;
      const pos: L.LatLngTuple = [v.current_lat, v.current_lng];
      bounds.push(pos);

      const popupHtml = `
        <div style="font-family:sans-serif;min-width:160px;">
          <h3 style="margin:0 0 4px;font-size:13px;font-weight:700;color:#06b6d4;">${v.registration_no}</h3>
          <div style="font-size:11px;color:#64748b;">Class: <strong style="color:#0f172a;">${v.type}</strong> | ${v.fuel_type.toUpperCase()}</div>
          <div style="font-size:11px;color:#64748b;">Status: <strong style="color:${statusColors[v.status] || '#888'}">${v.status.replace('_', ' ').toUpperCase()}</strong></div>
          <div style="font-size:11px;color:#64748b;">Live Speed: <strong style="color:#10b981">${(v.current_speed || 0).toFixed(0)} km/h</strong></div>
          <div style="font-size:11px;color:#64748b;">Capacity: ${v.capacity_kg} kg</div>
          ${v.driver_name ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">Driver: <strong>${v.driver_name}</strong></div>` : ''}
        </div>`;

      if (markersRef.current[v.id]) {
        markersRef.current[v.id].setLatLng(pos);
        markersRef.current[v.id].setIcon(createVehicleIcon(v.status));
        markersRef.current[v.id].setPopupContent(popupHtml);
      } else {
        const marker = L.marker(pos, { icon: createVehicleIcon(v.status) })
          .addTo(map)
          .bindPopup(popupHtml);
        marker.on('click', () => onSelectVehicle(v));
        markersRef.current[v.id] = marker;
      }
    });

    // Fit bounds once on first load
    if (bounds.length > 0 && !hasFitRef.current) {
      setTimeout(() => {
        map.invalidateSize();
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }, 300);
      hasFitRef.current = true;
    }
  }, [vehicles, onSelectVehicle]);

  // Handle selected vehicle centering
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedVehicle?.current_lat || !selectedVehicle?.current_lng) return;
    map.flyTo([selectedVehicle.current_lat, selectedVehicle.current_lng], 14, { duration: 0.8 });
  }, [selectedVehicle]);

  // Handle shipment markers & route
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    shipmentMarkersRef.current.forEach(m => map.removeLayer(m));
    shipmentMarkersRef.current = [];
    if (routeLayerRef.current) {
      map.removeLayer(routeLayerRef.current);
      routeLayerRef.current = null;
    }

    if (!selectedShipment) return;

    const oPos: L.LatLngTuple = [selectedShipment.origin_lat, selectedShipment.origin_lng];
    const dPos: L.LatLngTuple = [selectedShipment.dest_lat, selectedShipment.dest_lng];

    const oMarker = L.marker(oPos, { icon: createPinIcon('#10b981', 'origin') })
      .addTo(map)
      .bindPopup(`<strong>Origin:</strong> ${selectedShipment.origin_address}`);

    const dMarker = L.marker(dPos, { icon: createPinIcon('#ef4444', 'dest') })
      .addTo(map)
      .bindPopup(`<strong>Destination:</strong> ${selectedShipment.dest_address}`);

    shipmentMarkersRef.current = [oMarker, dMarker];

    // Fetch real road geometry from OSRM
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${selectedShipment.origin_lng},${selectedShipment.origin_lat};${selectedShipment.dest_lng},${selectedShipment.dest_lat}?overview=full&geometries=geojson`;

    fetch(osrmUrl)
      .then(res => res.json())
      .then(data => {
        if (data.routes && data.routes.length > 0 && mapRef.current) {
          const route = data.routes[0];
          const geojsonLayer = L.geoJSON(route.geometry, {
            style: {
              color: '#06b6d4',
              weight: 4,
              opacity: 0.85,
              dashArray: '6, 8',
            },
          }).addTo(mapRef.current);
          routeLayerRef.current = geojsonLayer;
          mapRef.current.fitBounds(geojsonLayer.getBounds(), { padding: [60, 60] });
        }
      })
      .catch(() => {
        // Fallback straight line if OSRM unavailable
        if (mapRef.current) {
          const line = L.polyline([oPos, dPos], { color: '#06b6d4', weight: 3, dashArray: '4, 6' }).addTo(mapRef.current);
          routeLayerRef.current = line as any;
          mapRef.current.fitBounds([oPos, dPos], { padding: [60, 60] });
        }
      });
  }, [selectedShipment]);

  // Handle All Routes Toggle
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous all-route layers
    allRoutesLayersRef.current.forEach(l => map.removeLayer(l));
    allRoutesLayersRef.current = [];

    if (!showAllRoutes) return;

    const routeShipments = shipments.filter(
      s => s.status !== 'delivered' && s.status !== 'cancelled' && s.origin_lat && s.origin_lng && s.dest_lat && s.dest_lng
    );

    const activeList = routeShipments.length > 0
      ? routeShipments
      : shipments.filter(s => s.origin_lat && s.origin_lng && s.dest_lat && s.dest_lng);

    const colors = ['#06b6d4', '#818cf8', '#f59e0b', '#10b981', '#ec4899', '#38bdf8', '#a855f7', '#14b8a6'];

    activeList.forEach((s, idx) => {
      const color = colors[idx % colors.length];
      const oPos: L.LatLngTuple = [s.origin_lat, s.origin_lng];
      const dPos: L.LatLngTuple = [s.dest_lat, s.dest_lng];

      const popupHtml = `
        <div style="font-family:sans-serif;min-width:180px;">
          <h4 style="margin:0 0 4px;font-size:12px;font-weight:700;color:${color};">📦 ${s.tracking_token || s.id.slice(0, 8)}</h4>
          <div style="font-size:11px;color:#64748b;">Status: <strong style="color:#0f172a;text-transform:capitalize;">${s.status.replace('_', ' ')}</strong></div>
          <div style="font-size:11px;color:#64748b;">Cargo: <strong>${s.cargo_type}</strong> (${s.weight_kg} kg)</div>
          <div style="font-size:10px;color:#64748b;margin-top:4px;"><strong>From:</strong> ${s.origin_address}</div>
          <div style="font-size:10px;color:#64748b;"><strong>To:</strong> ${s.dest_address}</div>
        </div>
      `;

      // Origin & Dest tiny markers
      const oMarker = L.circleMarker(oPos, { radius: 5, color, fillColor: '#ffffff', fillOpacity: 1, weight: 2 }).addTo(map).bindPopup(popupHtml);
      const dMarker = L.circleMarker(dPos, { radius: 5, color, fillColor: color, fillOpacity: 1, weight: 2 }).addTo(map).bindPopup(popupHtml);
      allRoutesLayersRef.current.push(oMarker, dMarker);

      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${s.origin_lng},${s.origin_lat};${s.dest_lng},${s.dest_lat}?overview=full&geometries=geojson`;

      fetch(osrmUrl)
        .then(res => res.json())
        .then(data => {
          if (!mapRef.current || !showAllRoutes) return;
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const geojsonLayer = L.geoJSON(route.geometry, {
              style: {
                color,
                weight: 4,
                opacity: 0.8,
                dashArray: '6, 6',
              },
            }).addTo(mapRef.current).bindPopup(popupHtml);
            allRoutesLayersRef.current.push(geojsonLayer);
          } else {
            const line = L.polyline([oPos, dPos], { color, weight: 3, opacity: 0.8, dashArray: '4, 6' })
              .addTo(mapRef.current)
              .bindPopup(popupHtml);
            allRoutesLayersRef.current.push(line);
          }
        })
        .catch(() => {
          if (!mapRef.current || !showAllRoutes) return;
          const line = L.polyline([oPos, dPos], { color, weight: 3, opacity: 0.8, dashArray: '4, 6' })
            .addTo(mapRef.current)
            .bindPopup(popupHtml);
          allRoutesLayersRef.current.push(line);
        });
    });

    return () => {
      if (mapRef.current) {
        allRoutesLayersRef.current.forEach(l => mapRef.current?.removeLayer(l));
        allRoutesLayersRef.current = [];
      }
    };
  }, [showAllRoutes, shipments]);

  // Handle GPS Trail
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (trailLayerRef.current) {
      map.removeLayer(trailLayerRef.current);
      trailLayerRef.current = null;
    }

    if (!trailActive || !selectedVehicle) return;

    apiGet<Array<{ lat: number; lng: number; speed_kmh: number; timestamp: string }>>(
      `/api/v1/fleet/vehicles/${selectedVehicle.id}/history?limit=150`
    )
      .then(res => {
        if (!mapRef.current || !trailActive) return;
        const points = (res.data || []).map(p => [p.lat, p.lng] as L.LatLngTuple);
        if (points.length > 1) {
          const polyline = L.polyline(points, {
            color: '#6366f1',
            weight: 4,
            opacity: 0.75,
            dashArray: '4, 4',
          }).addTo(mapRef.current);
          trailLayerRef.current = polyline;
        }
      })
      .catch(e => {
        console.warn('GPS trail fetch failed', e);
      });

    return () => {
      if (mapRef.current && trailLayerRef.current) {
        mapRef.current.removeLayer(trailLayerRef.current);
        trailLayerRef.current = null;
      }
    };
  }, [trailActive, selectedVehicle]);

  // Handle Geofences
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    geofenceLayerRef.current.forEach(c => map.removeLayer(c));
    geofenceLayerRef.current = [];

    if (!geofenceActive) return;

    vehicles.forEach(v => {
      if (!v.current_lat || !v.current_lng) return;
      const circle = L.circle([v.current_lat, v.current_lng], {
        radius: 3000,
        color: '#06b6d4',
        fillColor: '#06b6d4',
        fillOpacity: 0.08,
        weight: 1,
        dashArray: '4, 4',
      }).addTo(map);
      geofenceLayerRef.current.push(circle);
    });
  }, [geofenceActive, vehicles]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
