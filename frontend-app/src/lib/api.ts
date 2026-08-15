const API_BASE = '';

export async function api<T = any>(
  method: string,
  path: string,
  body?: any
): Promise<{ success: boolean; data: T; error?: { message: string; code?: string } }> {
  const token = sessionStorage.getItem('fleetToken');
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${path}`, opts);

  if (res.status === 401) {
    sessionStorage.removeItem('fleetToken');
    sessionStorage.removeItem('fleetUser');
    window.location.href = '/';
    throw new Error('Session expired');
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error?.message || 'API error');
  }
  return data;
}

// Typed API helpers
export const apiGet = <T = any>(path: string) => api<T>('GET', path);
export const apiPost = <T = any>(path: string, body?: any) => api<T>('POST', path, body);
export const apiPut = <T = any>(path: string, body?: any) => api<T>('PUT', path, body);
export const apiDelete = <T = any>(path: string) => api<T>('DELETE', path);

// Types
export interface Vehicle {
  id: string;
  registration_no: string;
  type: 'light' | 'medium' | 'heavy' | 'refrigerated';
  capacity_kg: number;
  fuel_type: 'diesel' | 'petrol' | 'electric' | 'cng';
  status: 'available' | 'en_route' | 'maintenance' | 'idle';
  current_lat: number | null;
  current_lng: number | null;
  current_speed: number | null;
  odometer_km: number;
  assigned_driver: string | null;
  driver_name?: string;
  created_at: string;
}

export interface Shipment {
  id: string;
  tracking_token: string;
  status: 'pending' | 'allocated' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
  cargo_type: string;
  weight_kg: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  dest_address: string;
  dest_lat: number;
  dest_lng: number;
  assigned_vehicle: string | null;
  assigned_driver: string | null;
  requires_vehicle_type: string | null;
  vehicle_reg?: string;
  special_instructions?: string;
  created_at: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'admin' | 'dispatcher' | 'driver' | 'client';
  is_active?: number;
  created_at?: string;
  updated_at?: string;
}

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lng: number;
  type?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface AnalyticsSummary {
  fleet: { total: number; available: number; en_route: number; maintenance: number; idle: number };
  shipments: { total: number; pending: number; allocated: number; in_transit: number; delivered: number; cancelled: number };
  type_breakdown: { type: string; count: number }[];
  fuel_breakdown: { fuel_type: string; count: number }[];
  total_cargo_weight_kg: number;
  gps_events_24h: number;
  urgent_shipments: number;
}

