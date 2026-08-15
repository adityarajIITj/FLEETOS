const { Server } = require('socket.io');
const eventBus = require('./eventBus');

let io = null;

function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    socket.on('subscribe:fleet', () => {
      socket.join('fleet');
    });

    socket.on('subscribe:vehicle', (vehicleId) => {
      socket.join(`vehicle:${vehicleId}`);
    });

    // Public tracking — scoped to one vehicle only
    socket.on('subscribe:tracking', (vehicleId) => {
      socket.join(`vehicle:${vehicleId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Forward event-bus events to socket rooms
  eventBus.on('vehicle:update', (data) => {
    io.to('fleet').emit('vehicle:update', data);
    io.to(`vehicle:${data.vehicleId}`).emit('vehicle:update', data);
  });

  eventBus.on('shipment:status_update', (data) => {
    io.to('fleet').emit('shipment:status_update', data);
  });

  return io;
}

function getIO() { return io; }

module.exports = { init, getIO };
