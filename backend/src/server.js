require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./config/database');
const socketManager = require('./realtime/socketManager');

const app = express();
const server = http.createServer(app);

// Middleware
// Restrict CORS to specified client origin or fallback to localhost
const allowedOrigins = [process.env.CLIENT_URL, 'http://localhost:3000', 'http://localhost:5173'].filter(Boolean);
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Permissive in dev
    }
  },
  credentials: true
}));

// Strict Helmet Configuration (Security Headers)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.socket.io", "https://www.gstatic.com", "https://apis.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https://*.cartocdn.com", "https://*.tile.openstreetmap.org", "https://unpkg.com", "https://www.gstatic.com"],
      connectSrc: ["'self'", "http://localhost:5173", "ws://localhost:5173", "https://router.project-osrm.org", "https://overpass-api.de", "ws:", "wss:", "https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"],
      frameSrc: ["'self'", "https://fleetos-3451c.firebaseapp.com"],
      frameAncestors: ["'none'"] // X-Frame-Options: DENY
    }
  },
  crossOriginResourcePolicy: { policy: "cross-origin" } // For images/tiles
}));
app.use(morgan('dev'));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve new React UI from frontend-app/dist
const distPath = path.join(__dirname, '..', '..', 'frontend-app', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Fallback & Legacy routes
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));
app.use('/legacy', express.static(path.join(__dirname, '..', '..', 'frontend')));

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per `window`
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many authentication attempts, please try again later.' } }
});

// Routes
app.use('/api/v1/auth', require('./services/auth/auth.routes'));
app.use('/api/v1/users', require('./services/users/users.routes'));
app.use('/api/v1/fleet', require('./services/fleet/fleet.routes'));
app.use('/api/v1/shipments', require('./services/shipments/shipments.routes'));
app.use('/api/v1/allocation', require('./services/allocation/allocation.routes'));
app.use('/api/v1/routes', require('./services/routes/routes.routes'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
  // Log detailed error internally
  const correlationId = Math.random().toString(36).substring(2, 10);
  console.error(`[Error ID: ${correlationId}]`, err.stack);
  
  // Return generic error to client
  res.status(500).json({ 
    success: false, 
    error: { 
      code: 'INTERNAL_ERROR', 
      message: 'An unexpected internal error occurred. Please contact support.',
      correlationId
    } 
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await getDb(); // Initialize SQLite
  socketManager.init(server);
  server.listen(PORT, () => console.log(`\n🚛 FleetOS API running on http://localhost:${PORT}\n`));
}

start().catch(console.error);
