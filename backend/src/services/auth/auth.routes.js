const { Router } = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { v4: uuid } = require('uuid');
const { run, get } = require('../../config/database');
const { signToken, authenticate, firebaseAuth } = require('../../middleware/auth');

const router = Router();

// Permanent Admin Whitelist
const ADMIN_EMAILS = [
  'sharma2002divyansh@gmail.com',
  'b25bs1020@iitj.ac.in',
  'admin@fleetos.io'
];

// --- In-memory OTP store (key: email, value: { code, expires, attempts, passwordVerified }) ---
const otpStore = {};

// --- In-memory login attempt tracker (key: email, value: { count, windowStart }) ---
const loginAttempts = {};
const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(email) {
  const now = Date.now();
  const entry = loginAttempts[email];
  if (!entry || (now - entry.windowStart) > LOGIN_WINDOW_MS) {
    loginAttempts[email] = { count: 1, windowStart: now };
    return true;
  }
  entry.count++;
  if (entry.count > MAX_LOGIN_ATTEMPTS) {
    return false;
  }
  return true;
}

// --- Gmail SMTP transporter ---
let transporter = null;
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  transporter.verify().then(() => console.log('✅ SMTP ready')).catch(e => console.warn('⚠️ SMTP failed:', e.message));
}

// Helper: Generate and send OTP
async function generateAndSendOtp(email) {
  if (!transporter) {
    console.warn('Email verification service is not configured. Logging OTP to console only.');
  }

  // Rate limit: 60s cooldown between sends
  const existing = otpStore[email];
  if (existing && existing.expires > Date.now() && (existing.expires - Date.now()) > 4 * 60 * 1000) {
    // OTP was sent less than 60 seconds ago
    return { alreadySent: true };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
  otpStore[email] = {
    code,
    expires: Date.now() + 5 * 60 * 1000, // 5 min expiry
    attempts: 0,
    passwordVerified: true
  };
  
  console.log(`[DEV OTP for ${email}]: ${code}`);

  if (transporter) {
    await transporter.sendMail({
      from: `"FleetOS Security" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'FleetOS — Verification Code',
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:420px;margin:0 auto;padding:28px;background:#0a1628;color:#e4e4e7;border-radius:8px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
            <div style="width:28px;height:28px;background:rgba(34,211,238,0.15);border:1px solid rgba(34,211,238,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;">🚛</div>
            <span style="font-weight:700;font-size:15px;color:#fff;">Fleet<span style="color:#22d3ee;">OS</span></span>
          </div>
          <p style="color:#94a3b8;margin:0 0 20px;font-size:14px;">Your one-time verification code:</p>
          <div style="background:#1e293b;padding:18px;border-radius:6px;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:#22d3ee;border:1px solid #334155;">
            ${code}
          </div>
          <p style="color:#64748b;font-size:12px;margin-top:18px;line-height:1.5;">
            This code expires in 5 minutes.<br/>
            If you did not request this code, you can safely ignore this email.
          </p>
        </div>
      `
    });
  }

  return { alreadySent: false };
}

// =====================================================================
// POST /login — Step 1: Verify email + password, then send OTP
// Does NOT issue a JWT. Returns { requiresOtp: true } on success.
// =====================================================================
router.post('/login', async (req, res) => {
  const { email, password, selectedRole } = req.body;
  if (!email || !password || !selectedRole) {
    return res.status(400).json({ success: false, error: { message: 'Email, password, and role are required.' } });
  }

  // Rate limit check
  if (!checkLoginRateLimit(email)) {
    return res.status(429).json({ success: false, error: { message: 'Too many login attempts. Please try again in 15 minutes.' } });
  }

  const emailLower = email.toLowerCase().trim();
  const isAdminEmail = ADMIN_EMAILS.includes(emailLower);

  let user = get('SELECT id, name, email, password, role, is_active FROM users WHERE LOWER(email) = ?', [emailLower]);
  if (!user) {
    return res.status(401).json({ success: false, error: { message: 'Invalid email or password.' } });
  }

  if (isAdminEmail && user.role !== 'admin') {
    run('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id]);
    user.role = 'admin';
  }

  // Strict role validation (admins can access any role workspace)
  if (user.role !== selectedRole && user.role !== 'admin') {
    const displayRole = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
    return res.status(403).json({ success: false, error: { message: `Access Denied: Your account does not have ${displayRole} privileges.` } });
  }

  // Check account activation
  if (user.is_active === 0) {
    return res.status(403).json({ success: false, error: { message: 'This account has been deactivated. Contact your administrator.' } });
  }

  // Verify password (skip for OAuth-managed accounts)
  if (user.password !== 'firebase_managed' && user.password !== 'google_oauth_managed') {
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, error: { message: 'Invalid email or password.' } });
    }
  } else {
    // This user signed up via Google — they should use Google sign-in, not password
    return res.status(401).json({ success: false, error: { message: 'This account uses Google sign-in. Please use "Continue with Google" instead.' } });
  }

  // Client role gets instant access (no OTP)
  if (user.role === 'client' || selectedRole === 'client') {
    const token = signToken({ id: user.id, email: user.email, role: user.role });
    return res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    });
  }

  // Password verified — now send OTP
  try {
    const result = await generateAndSendOtp(email);
    if (result.alreadySent) {
      return res.json({
        success: true,
        data: { requiresOtp: true, email: user.email, message: 'Verification code already sent. Check your email.' }
      });
    }
    res.json({
      success: true,
      data: { requiresOtp: true, email: user.email, message: 'Verification code sent to your email.' }
    });
  } catch (e) {
    console.error('Login OTP send error:', e);
    res.status(500).json({ success: false, error: { message: 'Unable to send verification email. Please try again.' } });
  }
});

// =====================================================================
// POST /register — Step 1 (New User): Create account, then send OTP
// Does NOT issue a JWT. Returns { requiresOtp: true } on success.
// =====================================================================
router.post('/register', async (req, res) => {
  const { name, email, password, selectedRole } = req.body;
  if (!name || !email || !password || !selectedRole) {
    return res.status(400).json({ success: false, error: { message: 'Name, email, password, and role are required.' } });
  }

  // Rate limit check
  if (!checkLoginRateLimit(email)) {
    return res.status(429).json({ success: false, error: { message: 'Too many attempts. Please try again in 15 minutes.' } });
  }

  // Check if user already exists
  const existingUser = get('SELECT id FROM users WHERE email = ?', [email]);
  if (existingUser) {
    return res.status(409).json({ success: false, error: { message: 'An account with this email already exists.' } });
  }

  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({ success: false, error: { message: 'Password must be at least 6 characters.' } });
  }

  const validRole = ['admin', 'dispatcher', 'driver', 'client'].includes(selectedRole) ? selectedRole : 'dispatcher';
  
  try {
    const hash = await bcrypt.hash(password, 10);
    const id = uuid();

    run(
      'INSERT INTO users (id, name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [id, name, email, hash, validRole]
    );

    // Client role gets instant access (no OTP)
    if (validRole === 'client') {
      const user = get('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
      const token = signToken({ id: user.id, email: user.email, role: user.role });
      return res.json({
        success: true,
        data: {
          token,
          user: { id: user.id, name: user.name, email: user.email, role: user.role }
        }
      });
    }

    // Account created — now send OTP
    const result = await generateAndSendOtp(email);
    if (result.alreadySent) {
      return res.json({
        success: true,
        data: { requiresOtp: true, email: email, message: 'Account created. Verification code already sent. Check your email.' }
      });
    }
    res.json({
      success: true,
      data: { requiresOtp: true, email: email, message: 'Account created. Verification code sent to your email.' }
    });
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ success: false, error: { message: 'Unable to create account. Please try again.' } });
  }
});

// =====================================================================
// POST /otp/send — Resend OTP (for authenticated password flow)
// =====================================================================
router.post('/otp/send', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, error: { message: 'Email is required.' } });

  // Verify the user exists
  const user = get('SELECT id, email, is_active FROM users WHERE email = ?', [email]);
  if (!user) return res.status(404).json({ success: false, error: { message: 'No account found with this email.' } });
  if (user.is_active === 0) return res.status(403).json({ success: false, error: { message: 'This account has been deactivated.' } });

  try {
    const result = await generateAndSendOtp(email);
    if (result.alreadySent) {
      return res.status(429).json({ success: false, error: { message: 'Verification code already sent. Please wait 60 seconds before requesting again.' } });
    }
    res.json({ success: true, data: { message: 'Verification code sent to ' + email } });
  } catch (e) {
    console.error('OTP resend error:', e);
    res.status(500).json({ success: false, error: { message: 'Unable to send verification email. Please try again.' } });
  }
});

// =====================================================================
// POST /otp/verify — Step 2: Verify OTP code and issue JWT
// =====================================================================
router.post('/otp/verify', (req, res) => {
  const { email, code, selectedRole } = req.body;
  if (!email || !code || !selectedRole) return res.status(400).json({ success: false, error: { message: 'Email, verification code, and role are required.' } });

  const entry = otpStore[email];
  if (!entry) return res.status(400).json({ success: false, error: { message: 'No verification code found. Please sign in again.' } });
  if (entry.expires < Date.now()) {
    delete otpStore[email];
    return res.status(400).json({ success: false, error: { message: 'Verification code has expired. Please sign in again.' } });
  }
  if (entry.attempts >= 5) {
    delete otpStore[email];
    return res.status(429).json({ success: false, error: { message: 'Too many incorrect attempts. Please sign in again.' } });
  }

  entry.attempts++;
  if (entry.code !== code.trim()) {
    const remaining = 5 - entry.attempts;
    return res.status(401).json({ success: false, error: { message: `Invalid verification code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` } });
  }

  // OTP verified — clean up and issue JWT
  delete otpStore[email];

  // Reset login attempt counter on success
  delete loginAttempts[email];

  const emailLower = email.toLowerCase().trim();
  const isAdminEmail = ADMIN_EMAILS.includes(emailLower);

  let user = get('SELECT id, name, email, role, is_active FROM users WHERE LOWER(email) = ?', [emailLower]);
  if (!user) return res.status(404).json({ success: false, error: { message: 'User account not found.' } });
  if (user.is_active === 0) return res.status(403).json({ success: false, error: { message: 'This account has been deactivated. Contact your administrator.' } });
  
  if (isAdminEmail && user.role !== 'admin') {
    run('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id]);
    user.role = 'admin';
  }

  if (user.role !== selectedRole && user.role !== 'admin') {
    const displayRole = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
    return res.status(403).json({ success: false, error: { message: `Access Denied: Your account does not have ${displayRole} privileges.` } });
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  res.json({ success: true, data: { token, user: { id: user.id, name: user.name, email: user.email, role: user.role } } });
});

// Helper: Verify Google Token (Firebase Admin -> Identity Toolkit -> OAuth API -> JWT Decode)
async function verifyGoogleToken(idToken) {
  // Method 1: Firebase Admin SDK
  if (firebaseAuth) {
    try {
      const decoded = await firebaseAuth.verifyIdToken(idToken);
      if (decoded && decoded.email) return decoded;
    } catch (e) {
      console.warn('Firebase Admin verify failed:', e.message);
    }
  }

  const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyA-paB8nJHR0HqY2ObYQILVkqSj_hCk7yw';
  const projectId = process.env.FIREBASE_PROJECT_ID || 'fleetos-3451c';
  const axios = require('axios');

  // Method 2: Google Identity Toolkit REST API (Official Firebase token verification)
  try {
    const res = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      { idToken },
      { timeout: 8000 }
    );
    const user = res.data?.users?.[0];
    if (user && user.email) {
      return {
        email: user.email,
        name: user.displayName || user.email.split('@')[0],
        uid: user.localId
      };
    }
  } catch (err) {
    console.warn('Google Identity Toolkit lookup error:', err?.response?.data || err.message);
  }

  // Method 3: Google OAuth TokenInfo endpoint
  try {
    const res = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { timeout: 6000 }
    );
    if (res.data?.email) {
      return {
        email: res.data.email,
        name: res.data.name || res.data.email.split('@')[0],
        uid: res.data.sub
      };
    }
  } catch (err) {
    console.warn('Google tokeninfo lookup error:', err?.response?.data || err.message);
  }

  // Method 4: Validate Firebase JWT claims
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(idToken);
    if (decoded && decoded.email) {
      if (!decoded.exp || (decoded.exp * 1000 > Date.now() - 60000)) {
        return {
          email: decoded.email,
          name: decoded.name || decoded.email.split('@')[0],
          uid: decoded.sub || decoded.user_id
        };
      }
    }
  } catch (jwtErr) {
    console.warn('JWT decode fallback failed:', jwtErr.message);
  }

  throw new Error('Google token could not be verified. Please try again.');
}

// =====================================================================
// POST /google — Google OAuth via Firebase ID Token (no OTP needed)
// =====================================================================
router.post('/google', async (req, res) => {
  const { idToken, selectedRole } = req.body;
  if (!idToken || !selectedRole) {
    return res.status(400).json({ success: false, error: { message: 'Google token and selected role are required.' } });
  }

  try {
    const decoded = await verifyGoogleToken(idToken);
    if (!decoded.email) {
      return res.status(400).json({ success: false, error: { message: 'Google account is missing an email address.' } });
    }

    const emailLower = decoded.email.toLowerCase().trim();
    const isAdminEmail = ADMIN_EMAILS.includes(emailLower);

    let user = get('SELECT id, name, email, role, is_active FROM users WHERE LOWER(email) = ?', [emailLower]);

    if (!user) {
      // Disallow non-admin self-registering as Administrator via Google OAuth
      if (selectedRole === 'admin' && !isAdminEmail) {
        return res.status(403).json({
          success: false,
          error: { message: 'Administrator registration is disabled. Please contact the system owner.' }
        });
      }

      // New user signup via Google — grant admin to whitelisted accounts
      const id = uuid();
      const role = isAdminEmail ? 'admin' : (['dispatcher', 'driver', 'client'].includes(selectedRole) ? selectedRole : 'dispatcher');
      const name = decoded.name || decoded.email.split('@')[0];

      run(
        'INSERT INTO users (id, name, email, password, role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [id, name, decoded.email, 'google_oauth_managed', role]
      );
      user = get('SELECT id, name, email, role, is_active FROM users WHERE id = ?', [id]);
    } else if (isAdminEmail && user.role !== 'admin') {
      run('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id]);
      user.role = 'admin';
    }

    if (user.is_active === 0) {
      return res.status(403).json({ success: false, error: { message: 'Your account has been deactivated. Contact your administrator.' } });
    }

    // Admins can log into any role workspace or administrator workspace
    if (user.role !== selectedRole && user.role !== 'admin') {
      const displayRole = selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1);
      return res.status(403).json({ success: false, error: { message: `Access Denied: Your account does not have ${displayRole} privileges.` } });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role });
    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      }
    });
  } catch (err) {
    console.error('Google Auth verification failed:', err.message);
    res.status(401).json({ success: false, error: { message: 'Google authentication failed. Please try again.' } });
  }
});

// --- Firebase sync (optional legacy) ---
router.post('/sync', async (req, res) => {
  if (!firebaseAuth) return res.status(400).json({ success: false, error: { message: 'Firebase not configured' } });
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { message: 'No token' } });
  try {
    const decoded = await firebaseAuth.verifyIdToken(header.split(' ')[1]);
    if (!decoded.email) return res.status(400).json({ success: false, error: { message: 'Token missing email' } });
    let user = get('SELECT id, name, email, role FROM users WHERE email = ?', [decoded.email]);
    if (!user) {
      const id = uuid();
      run('INSERT INTO users (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)',
        [id, decoded.name || decoded.email.split('@')[0], decoded.email, 'firebase_managed', 'driver']);
      user = get('SELECT id, name, email, role FROM users WHERE id = ?', [id]);
    }
    res.json({ success: true, data: { user } });
  } catch (e) {
    res.status(401).json({ success: false, error: { message: 'Invalid Firebase token' } });
  }
});

router.get('/me', authenticate, (req, res) => {
  const user = get('SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ success: false, error: { message: 'User not found' } });
  res.json({ success: true, data: user });
});

module.exports = router;
