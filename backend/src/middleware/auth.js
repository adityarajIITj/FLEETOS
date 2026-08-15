const jwt = require('jsonwebtoken');
const { get } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'fleetos-hackathon-secret-2025';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

// Optional Firebase Admin — only initialize if credentials are present and valid
let firebaseAuth = null;
try {
  const pk = process.env.FIREBASE_PRIVATE_KEY;
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && pk && !pk.includes('YOUR_')) {
    const { getApp, getApps, initializeApp, cert } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    if (!getApps().length) {
      initializeApp({ credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: pk.replace(/\\n/g, '\n')
      })});
    }
    firebaseAuth = getAuth();
    console.log('✅ Firebase Admin initialized (optional auth)');
  }
} catch (e) {
  console.warn('⚠️ Firebase Admin not available — using local JWT only:', e.message);
}

// Sign a local JWT
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

// Auth Middleware: tries local JWT first, then Firebase token
async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  const tokenStr = header.split(' ')[1];
  if (!tokenStr || tokenStr === 'null' || tokenStr === 'undefined') {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
  }

  // Try 1: Local JWT
  try {
    const decoded = jwt.verify(tokenStr, JWT_SECRET);
    const user = get('SELECT id, name, email, role FROM users WHERE id = ?', [decoded.id]);
    if (user) {
      req.user = user;
      return next();
    }
  } catch (_) { /* not a local JWT, try Firebase */ }

  // Try 2: Firebase token (if available)
  if (firebaseAuth) {
    try {
      const decoded = await firebaseAuth.verifyIdToken(tokenStr);
      if (decoded.email) {
        const user = get('SELECT id, name, email, role FROM users WHERE email = ?', [decoded.email]);
        if (user) {
          req.user = user;
          req.firebaseUser = decoded;
          return next();
        }
      }
    } catch (_) { /* invalid firebase token too */ }
  }

  return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Token is invalid or expired' } });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } });
    }
    next();
  };
}

module.exports = { signToken, authenticate, requireRole, firebaseAuth };
