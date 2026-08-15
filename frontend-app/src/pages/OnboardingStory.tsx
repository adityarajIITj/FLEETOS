import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import {
  Navigation,
  ArrowRight,
  MapPin,
  Package,
  Radio,
  ShieldCheck,
  AlertCircle,
  Mail
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { signInWithGoogle } from '../lib/firebase';
import { API_BASE, parseJsonResponse } from '../lib/api';

interface OnboardingStoryProps {
  onComplete: () => void;
}

type OnboardingStep = 'boot' | 'type' | 'role' | 'auth' | 'immersion';
type AuthPhase = 'credentials' | 'otp';

const motionVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25, ease: 'easeIn' } },
};

export default function OnboardingStory({ onComplete }: OnboardingStoryProps) {
  const { login } = useAuth();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('boot');

  // Boot state
  const [filmDone, setFilmDone] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Auth state
  const [selectedRole, setSelectedRole] = useState('dispatcher');
  const [authPhase, setAuthPhase] = useState<AuthPhase>('credentials');
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Immersion state
  const [immersionProgress, setImmersionProgress] = useState(0);

  // ── Boot: video fallback timer ──
  useEffect(() => {
    const t = window.setTimeout(() => setFilmDone(true), 12000);
    return () => window.clearTimeout(t);
  }, []);

  // ── Boot: try to play video (handles autoplay policy) ──
  useEffect(() => {
    if (currentStep !== 'boot' || !videoRef.current) return;
    const v = videoRef.current;
    v.play().catch(() => {
      // Autoplay blocked — video will display first frame, user can skip
    });
  }, [currentStep]);

  // ── OTP cooldown ticker ──
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => setOtpCooldown(c => c - 1), 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  // ── Keyboard: ESC to skip video ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currentStep === 'boot' && !filmDone) {
        setFilmDone(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentStep, filmDone]);

  // ── Immersion auto-progress ──
  useEffect(() => {
    if (currentStep !== 'immersion') return;
    const steps = [
      { delay: 200, value: 20 },
      { delay: 550, value: 45 },
      { delay: 900, value: 70 },
      { delay: 1300, value: 90 },
      { delay: 1700, value: 100 },
    ];
    const timers = steps.map(s => setTimeout(() => setImmersionProgress(s.value), s.delay));
    const autoEnter = setTimeout(onComplete, 2400);
    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(autoEnter);
    };
  }, [currentStep, onComplete]);

  // ═══════════════════════════════════════════════════════════
  // AUTH HANDLERS
  // ═══════════════════════════════════════════════════════════

  // Step 1: Submit email + password → server verifies and sends OTP
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (isSignUp && !name.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!email.includes('@')) {
      setAuthError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setAuthLoading(true);
    try {
      const endpoint = isSignUp ? `${API_BASE}/api/v1/auth/register` : `${API_BASE}/api/v1/auth/login`;
      const body = isSignUp ? { name, email, password, selectedRole } : { email, password, selectedRole };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await parseJsonResponse(res);

      if (data.success && data.data?.requiresOtp) {
        // Password verified/Account created, OTP sent — move to OTP phase
        setAuthPhase('otp');
        setOtpCooldown(60);
        setOtpCode('');
      } else if (!data.success) {
        throw new Error(data.error?.message || 'Authentication failed.');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Step 2: Verify OTP → receive JWT
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.length < 6) {
      setAuthError('Please enter the 6-digit verification code.');
      return;
    }

    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode, selectedRole }),
      });
      const data = await parseJsonResponse(res);

      if (data.success) {
        login(data.data.token, data.data.user);
        setCurrentStep('immersion');
      } else {
        throw new Error(data.error?.message || 'Verification failed.');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (otpCooldown > 0) return;
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        setOtpCooldown(60);
      } else {
        throw new Error(data.error?.message || 'Failed to resend code.');
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  // Google OAuth (secondary)
  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const { idToken } = await signInWithGoogle();
      const res = await fetch(`${API_BASE}/api/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, selectedRole }),
      });
      const data = await parseJsonResponse(res);
      if (data.success) {
        login(data.data.token, data.data.user);
        setCurrentStep('immersion');
      } else {
        throw new Error(data.error?.message || 'Google authentication failed.');
      }
    } catch (err: any) {
      // Handle Firebase popup-closed error gracefully
      const msg = err?.code === 'auth/popup-closed-by-user'
        ? 'Google sign-in was cancelled.'
        : (err.message || 'Google authentication failed. Please try again.');
      setAuthError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // Reset back to credentials phase
  const handleBackToCredentials = () => {
    setAuthPhase('credentials');
    setOtpCode('');
    setAuthError('');
  };

  const toggleAuthMode = () => {
    setIsSignUp(!isSignUp);
    setAuthError('');
  };

  // ═══════════════════════════════════════════════════════════
  // IMMERSION DATA
  // ═══════════════════════════════════════════════════════════

  const telemetryItems = [
    { label: 'Leaflet Dark Tile Cache', icon: MapPin, threshold: 20 },
    { label: 'OSRM Routing Engine', icon: Navigation, threshold: 45 },
    { label: 'Live GPS Broadcast & WebSockets', icon: Radio, threshold: 70 },
    { label: 'RBAC Security Matrix', icon: ShieldCheck, threshold: 90 },
    { label: 'Cargo Manifests & Geofences', icon: Package, threshold: 100 },
  ];

  // ═══════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-[#040b14] text-slate-100 select-none">

      {/* ── BOOT: Background Video Layer ── */}
      {currentStep === 'boot' && (
        <>
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={() => setFilmDone(true)}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-1200 ${
              filmDone ? 'opacity-0' : 'opacity-100'
            }`}
            src="/assets/fleetos-intro.mp4"
            aria-label="FleetOS cinematic opening sequence"
          />
          <div
            className={`absolute inset-0 bg-[#040b14] transition-opacity duration-1000 ${
              filmDone ? 'opacity-100' : 'opacity-20'
            }`}
          />
        </>
      )}

      {/* ── AUTH: Atmospheric background ── */}
      {currentStep === 'auth' && (
        <div className="pointer-events-none absolute inset-0">
          <img
            src="/assets/frame-aerial.png"
            alt=""
            className="h-full w-full object-cover opacity-[0.08]"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-[#040b14] via-[#040b14]/95 to-[#0a1628]/90" />
        </div>
      )}

      {/* ── Radial vignette ── */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(14,96,124,0.1),transparent_70%)]" />

      {/* ── HUD Header ── */}
      <header className="relative z-30 flex h-14 w-full items-center justify-between border-b border-white/[0.06] bg-[#040b14]/80 px-5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center border border-cyan-400/50 bg-cyan-400/10">
            <Navigation size={14} className="text-cyan-300" />
          </div>
          <span className="text-sm font-bold tracking-tight text-white">
            Fleet<span className="text-cyan-300">OS</span>
          </span>
          <span className="mono ml-2 hidden border-l border-white/10 pl-2.5 text-[9px] uppercase tracking-[0.22em] text-slate-500 sm:inline-block">
            Autonomous Operating Core
          </span>
        </div>
        <div className="mono text-[9px] uppercase tracking-widest text-slate-600">
          {currentStep === 'boot' ? 'SYS INIT' : 
           currentStep === 'type' ? 'IDENTIFICATION' : 
           currentStep === 'role' ? 'WORKSPACE SELECT' : 
           currentStep === 'auth' ? 'SECURITY GATEWAY' : 'SYNC'}
        </div>
      </header>

      {/* ── Main Stage ── */}
      <main className="relative z-20 flex min-h-[calc(100dvh-56px)] items-center justify-center px-4 py-8 sm:px-8">
        <AnimatePresence mode="wait">

          {/* ════════════════════════════════════════════════════════
              STEP 1: BOOT — Cinematic Intro → Logo → Enter
              ════════════════════════════════════════════════════════ */}
          {currentStep === 'boot' && (
            <motion.div
              key="boot"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex w-full max-w-xl flex-col items-center text-center"
            >
              {filmDone ? (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="flex flex-col items-center"
                >
                  <div className="mb-6 w-full max-w-[340px] border border-white/[0.08] bg-white p-4 shadow-2xl shadow-cyan-950/40">
                    <img
                      src="/assets/fleetos-logo.png"
                      alt="FleetOS"
                      className="h-auto w-full object-contain"
                    />
                  </div>
                  <p className="mono mb-8 text-[10px] uppercase tracking-[0.32em] text-slate-400">
                    TRACK · OPTIMIZE · DELIVER
                  </p>
                  <button
                    onClick={() => setCurrentStep('type')}
                    className="group inline-flex items-center gap-3 border border-cyan-400/60 bg-cyan-400 px-7 py-3 text-xs font-bold tracking-wider uppercase text-[#03101a] transition-all hover:bg-cyan-300 active:scale-[0.98]"
                  >
                    Enter Command Network
                    <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                  </button>
                </motion.div>
              ) : (
                /* Skip button — small, bottom-right, unobtrusive */
                <div className="fixed bottom-6 right-6 z-40">
                  <button
                    onClick={() => setFilmDone(true)}
                    className="inline-flex items-center gap-2 rounded border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-white/50 backdrop-blur-md transition-all hover:border-cyan-400/40 hover:text-white/80"
                  >
                    Skip <span className="mono text-[9px] text-cyan-300/70">ESC</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 1.5: TYPE — Customer or Staff
              ════════════════════════════════════════════════════════ */}
          {currentStep === 'type' && (
            <motion.div
              key="type"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex w-full max-w-2xl flex-col items-center"
            >
              <h2 className="mb-2 text-2xl font-bold tracking-tight text-white">Identify User Type</h2>
              <p className="mb-10 text-sm text-slate-400">Select your access level to continue.</p>
              
              <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2">
                {/* Staff Route */}
                <button
                  onClick={() => setCurrentStep('role')}
                  className="group relative flex flex-col items-center justify-center gap-4 border border-cyan-400/20 bg-[#0a1628]/60 p-8 transition-all hover:border-cyan-400/50 hover:bg-[#0a1628] active:scale-[0.98]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-400/10 transition-colors group-hover:bg-cyan-400/20">
                    <ShieldCheck size={24} className="text-cyan-400" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold tracking-wide text-white">Internal Staff</div>
                    <div className="mt-2 text-xs text-slate-400">Driver, Dispatcher, or Administrator access</div>
                  </div>
                </button>

                {/* Customer Route */}
                <button
                  onClick={() => {
                    setSelectedRole('client');
                    setCurrentStep('auth');
                  }}
                  className="group relative flex flex-col items-center justify-center gap-4 border border-white/[0.08] bg-[#0a1628]/40 p-8 transition-all hover:border-white/20 hover:bg-[#0a1628] active:scale-[0.98]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.03] transition-colors group-hover:bg-white/[0.08]">
                    <Package size={24} className="text-slate-300 group-hover:text-white" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold tracking-wide text-white">Customer</div>
                    <div className="mt-2 text-xs text-slate-400">Track shipments and view delivery status</div>
                  </div>
                </button>
              </div>
              
              <button
                onClick={() => setCurrentStep('boot')}
                className="mt-10 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Back
              </button>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 1.75: ROLE — Select intended workspace (Staff Only)
              ════════════════════════════════════════════════════════ */}
          {currentStep === 'role' && (
            <motion.div
              key="role"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex w-full max-w-2xl flex-col items-center"
            >
              <h2 className="mb-2 text-2xl font-bold tracking-tight text-white">What's your role?</h2>
              <p className="mb-10 text-sm text-slate-400">Select your intended workspace to continue.</p>
              
              <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { id: 'driver', label: 'Driver', desc: 'Active routes & assignments' },
                  { id: 'dispatcher', label: 'Dispatcher', desc: 'Fleet command & logistics' },
                  { id: 'admin', label: 'Administrator', desc: 'System management' }
                ].map(r => (
                  <button
                    key={r.id}
                    onClick={() => {
                      setSelectedRole(r.id);
                      if (r.id === 'admin') setIsSignUp(false);
                      setCurrentStep('auth');
                    }}
                    className="group relative flex flex-col items-center justify-center gap-3 border border-white/[0.08] bg-[#0a1628]/60 p-6 transition-all hover:border-cyan-400/50 hover:bg-[#0a1628] active:scale-[0.98]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.03] transition-colors group-hover:bg-cyan-400/10">
                      {r.id === 'driver' && <Navigation size={20} className="text-slate-400 group-hover:text-cyan-300" />}
                      {r.id === 'dispatcher' && <Radio size={20} className="text-slate-400 group-hover:text-cyan-300" />}
                      {r.id === 'admin' && <ShieldCheck size={20} className="text-slate-400 group-hover:text-cyan-300" />}
                    </div>
                    <div className="text-center">
                      <div className="font-bold tracking-wide text-white">{r.label}</div>
                      <div className="mt-1 text-[10px] text-slate-500">{r.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              
              <button
                onClick={() => setCurrentStep('type')}
                className="mt-10 text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                ← Back to User Type
              </button>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 2: AUTH — Single coherent login surface
              ════════════════════════════════════════════════════════ */}
          {currentStep === 'auth' && (
            <motion.div
              key="auth"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full max-w-[420px]"
            >
              <div className="border border-white/[0.06] bg-[#0a1628]/95 shadow-2xl shadow-black/40">

                {/* Card Header */}
                <div className="border-b border-white/[0.06] px-6 py-5">
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="flex h-8 w-8 items-center justify-center border border-cyan-400/50 bg-cyan-400/10">
                      <Navigation size={16} className="text-cyan-300" />
                    </div>
                    <span className="text-base font-bold tracking-tight text-white">
                      Fleet<span className="text-cyan-300">OS</span>
                    </span>
                  </div>
                  <h2 className="text-lg font-semibold tracking-tight text-white">
                    {isSignUp && selectedRole !== 'admin' ? 'Create FleetOS account' : 'Sign in to FleetOS'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {authPhase === 'credentials'
                      ? isSignUp && selectedRole !== 'admin'
                        ? (selectedRole === 'client' ? 'Enter your details to register as a customer.' : 'Enter your details to register.') 
                        : (selectedRole === 'client' ? 'Enter your credentials to view your shipments.' : 'Enter your credentials to access your workspace.')
                      : 'A verification code has been sent to your email.'}
                  </p>
                </div>

                {/* Card Body */}
                <div className="px-6 py-5">
                  <AnimatePresence mode="wait">

                    {/* ── Phase 1: Email + Password ── */}
                    {authPhase === 'credentials' && (
                      <motion.form
                        key="credentials"
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.25 }}
                        onSubmit={handleCredentialsSubmit}
                        className="space-y-4"
                      >
                        {isSignUp && selectedRole !== 'admin' && (
                          <label className="block">
                            <span className="text-xs font-medium text-slate-300">Full Name</span>
                            <input
                              type="text"
                              value={name}
                              onChange={e => setName(e.target.value)}
                              placeholder="Jane Doe"
                              required
                              autoFocus
                              autoComplete="name"
                              className="mt-1.5 w-full border border-white/[0.08] bg-[#040d17] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-colors"
                            />
                          </label>
                        )}

                        <label className="block">
                          <span className="text-xs font-medium text-slate-300">Email</span>
                          <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="operator@company.com"
                            required
                            autoFocus={!isSignUp}
                            autoComplete="email"
                            className="mt-1.5 w-full border border-white/[0.08] bg-[#040d17] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-colors"
                          />
                        </label>

                        <label className="block">
                          <span className="text-xs font-medium text-slate-300">Password</span>
                          <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete={isSignUp ? "new-password" : "current-password"}
                            className="mt-1.5 w-full border border-white/[0.08] bg-[#040d17] px-3.5 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-colors"
                          />
                        </label>

                        {authError && (
                          <div className="flex items-start gap-2 rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                            <span>{authError}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={authLoading}
                          className="mt-1 flex w-full items-center justify-center gap-2 bg-cyan-400 py-2.5 text-sm font-bold uppercase tracking-wider text-[#03101a] transition-all hover:bg-cyan-300 disabled:opacity-50 active:scale-[0.98]"
                        >
                          {authLoading ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#03101a]/30 border-t-[#03101a]" />
                              Verifying...
                            </span>
                          ) : (
                            <>Continue<ArrowRight size={15} /></>
                          )}
                        </button>
                      </motion.form>
                    )}

                    {/* ── Phase 2: OTP Verification ── */}
                    {authPhase === 'otp' && (
                      <motion.form
                        key="otp"
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.25 }}
                        onSubmit={handleOtpSubmit}
                        className="space-y-4"
                      >
                        <div className="flex items-center gap-2 text-xs text-cyan-300">
                          <Mail size={14} />
                          <span className="mono uppercase tracking-wider">Email Verification</span>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">
                          We sent a 6-digit code to <strong className="text-slate-200">{email}</strong>.
                          Enter it below to complete sign-in.
                        </p>

                        <label className="block">
                          <span className="text-xs font-medium text-slate-300">Verification Code</span>
                          <input
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="000000"
                            maxLength={6}
                            autoFocus
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            className="mono mt-1.5 w-full border border-white/[0.08] bg-[#040d17] px-3.5 py-3 text-center text-lg font-bold tracking-[0.35em] text-cyan-300 placeholder:text-slate-700 placeholder:tracking-[0.35em] focus:border-cyan-400/60 focus:outline-none focus:ring-1 focus:ring-cyan-400/20 transition-colors"
                          />
                        </label>

                        {authError && (
                          <div className="flex items-start gap-2 rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                            <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                            <span>{authError}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={authLoading || otpCode.length < 6}
                          className="flex w-full items-center justify-center gap-2 bg-cyan-400 py-2.5 text-sm font-bold uppercase tracking-wider text-[#03101a] transition-all hover:bg-cyan-300 disabled:opacity-50 active:scale-[0.98]"
                        >
                          {authLoading ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#03101a]/30 border-t-[#03101a]" />
                              Verifying...
                            </span>
                          ) : (
                            <>Verify & Sign In<ArrowRight size={15} /></>
                          )}
                        </button>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={handleBackToCredentials}
                            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                          >
                            ← Back to sign in
                          </button>
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={otpCooldown > 0 || authLoading}
                            className="text-xs text-cyan-400/70 hover:text-cyan-300 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
                          >
                            {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
                          </button>
                        </div>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* ── Divider + Google OAuth ── */}
                  {authPhase === 'credentials' && (
                    <div className="mt-5">
                      <div className="flex items-center gap-3 my-4">
                        <div className="h-px flex-1 bg-white/[0.06]" />
                        <span className="text-[10px] uppercase tracking-widest text-slate-600">
                          Try another way
                        </span>
                        <div className="h-px flex-1 bg-white/[0.06]" />
                      </div>

                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={authLoading}
                        className="flex w-full items-center justify-center gap-2.5 border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-slate-300 transition-all hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-40 active:scale-[0.98]"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
                          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                          <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                        </svg>
                        Continue with Google
                      </button>

                      {/* Show Google auth errors here too */}
                      {authError && authPhase === 'credentials' && (
                        <div className="mt-3 flex items-start gap-2 rounded bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">
                          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                          <span>{authError}</span>
                        </div>
                      )}

                      {selectedRole !== 'admin' && (
                        <div className="mt-4 text-center">
                          <button
                            type="button"
                            onClick={toggleAuthMode}
                            className="text-xs text-slate-400 hover:text-cyan-300 transition-colors"
                          >
                            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="border-t border-white/[0.04] px-6 py-3">
                  <p className="mono text-center text-[9px] uppercase tracking-widest text-slate-600">
                    Encrypted session · RBAC enforced · v2.8
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════════════════════════════════════════════
              STEP 3: IMMERSION — Telemetry Init
              ════════════════════════════════════════════════════════ */}
          {currentStep === 'immersion' && (
            <motion.div
              key="immersion"
              variants={motionVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex w-full max-w-md flex-col items-center text-center"
            >
              <div className="mono mb-5 text-[10px] uppercase tracking-[0.28em] text-cyan-300">
                Initializing Operating Terminal
              </div>

              {/* Progress Bar */}
              <div className="mb-6 h-[2px] w-56 overflow-hidden bg-white/10">
                <div
                  className="h-full bg-cyan-400 transition-all duration-300 ease-out"
                  style={{ width: `${immersionProgress}%` }}
                />
              </div>

              {/* Telemetry checklist */}
              <div className="w-full space-y-2.5 border border-white/[0.06] bg-[#071524]/80 p-5">
                {telemetryItems.map((item, i) => {
                  const Icon = item.icon;
                  const isReady = immersionProgress >= item.threshold;
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between text-xs transition-opacity duration-300 ${
                        isReady ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon size={14} className={isReady ? 'text-cyan-300' : 'text-slate-600'} />
                        <span>{item.label}</span>
                      </div>
                      <span className={`mono text-[10px] ${isReady ? 'text-emerald-400' : 'text-slate-600'}`}>
                        {isReady ? '● SYNCED' : '○ PENDING'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {immersionProgress >= 100 && (
                <motion.button
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={onComplete}
                  className="mt-6 inline-flex items-center gap-2 bg-cyan-400 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#03101a] transition-all hover:bg-cyan-300"
                >
                  Launch Workspace
                  <ArrowRight size={14} />
                </motion.button>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
