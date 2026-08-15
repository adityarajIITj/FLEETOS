import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const socketUrl = import.meta.env.VITE_API_URL || undefined;
    socket = io(socketUrl, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('⚡ Socket connected:', socket?.id);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  }
  return socket;
}

export function subscribeFleet(): void {
  const s = getSocket();
  s.emit('subscribe:fleet');
}

export function subscribeVehicle(vehicleId: string): void {
  const s = getSocket();
  s.emit('subscribe:vehicle', vehicleId);
}

export function onVehicleUpdate(
  callback: (data: { vehicleId: string; lat: number; lng: number; speed: number; heading?: number }) => void
): () => void {
  const s = getSocket();
  s.on('vehicle:update', callback);
  return () => { s.off('vehicle:update', callback); };
}

export function onShipmentStatusUpdate(
  callback: (data: { shipmentId: string; status: string }) => void
): () => void {
  const s = getSocket();
  s.on('shipment:status_update', callback);
  return () => { s.off('shipment:status_update', callback); };
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
