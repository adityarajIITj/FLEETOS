import { useState } from 'react';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import type { Role } from './RoleSelect';

interface LoginProps {
  role: Role;
  onEnter: () => void;
}

export default function Login({ role, onEnter }: LoginProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.includes('@') || password.length < 1) {
      setError('Enter a valid email and password.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, selectedRole: role }),
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        login(data.data.token, data.data.user);
        onEnter();
      } else {
        throw new Error(data.error?.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (qEmail: string) => {
    const qPass = qEmail === 'admin@fleetos.io' ? '123' : 'password123';
    setEmail(qEmail);
    setPassword(qPass);
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: qEmail, password: qPass, selectedRole: role }),
      });
      const data = await res.json();
      if (data.success && data.data?.token) {
        login(data.data.token, data.data.user);
        onEnter();
      } else {
        throw new Error(data.error?.message || 'Login failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLogins = [
    { label: 'Admin', email: 'admin@fleetos.io', icon: '👑' },
    { label: 'Dispatcher', email: 'rajesh@fleetos.io', icon: '📋' },
    { label: 'Driver', email: 'arun@fleetos.io', icon: '🚛' },
  ];

  return (
    <main className="relative flex min-h-[100dvh] items-center overflow-hidden bg-[#050e19] px-5 py-10">
      <img
        src="/assets/frame-approach.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center opacity-[.12]"
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_40%,rgba(0,171,227,.13),transparent_42%)]" />

      <div className="relative mx-auto grid w-full max-w-5xl items-center gap-14 lg:grid-cols-[1fr_400px]">
        {/* Left side — Hero text */}
        <div className="hidden lg:block">
          <div className="mono mb-5 text-[10px] uppercase tracking-[.28em] text-cyan-300">
            IDENTITY VERIFIED / {role.toUpperCase()}
          </div>
          <h1 className="text-6xl font-semibold tracking-tight text-white">
            The network<br />
            <span className="text-slate-500">is waiting.</span>
          </h1>
          <p className="mt-6 max-w-sm text-sm leading-6 text-slate-400">
            Step into a live operational view built around your role. Your environment is pre-loaded with active fleet and cargo data.
          </p>
          <div className="mt-10 flex items-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" /> Network nominal
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400" /> Live fleet active
            </span>
          </div>
        </div>

        {/* Right side — Auth form */}
        <form
          onSubmit={submit}
          className="border border-white/10 bg-[#091827]/90 p-6 shadow-2xl shadow-black/30 sm:p-8"
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="mono text-[10px] uppercase tracking-[.25em] text-cyan-300">
                {role} workspace
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">
                Sign in
              </h2>
            </div>
          </div>



          <label className="mb-4 block text-xs text-slate-400">
            Work email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="operator@company.com"
              className="mt-2 w-full border border-white/10 bg-[#06111e] px-3 py-3 text-sm text-white placeholder:text-slate-700"
            />
          </label>

          <label className="mb-2 block text-xs text-slate-400">
            Password
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
              className="mt-2 w-full border border-white/10 bg-[#06111e] px-3 py-3 text-sm text-white placeholder:text-slate-700"
            />
          </label>

          {error && (
            <div className="mt-3 flex gap-2 text-xs leading-5 text-red-300">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />{error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-6 flex w-full items-center justify-center gap-2 bg-cyan-400 py-3 text-sm font-semibold text-[#03101a] hover:bg-cyan-300 disabled:opacity-60"
          >
            {loading ? 'Connecting...' : 'Continue'}
            {!loading && <ArrowRight size={16} />}
          </button>

          {/* Quick demo logins */}
          <div className="mt-6 border-t border-white/10 pt-6">
            <p className="mono mb-3 text-center text-[9px] uppercase tracking-[.2em] text-slate-600">
              Quick demo access
            </p>
            <div className="grid grid-cols-3 gap-2">
              {quickLogins.map(q => (
                <button
                  key={q.email}
                  type="button"
                  onClick={() => quickLogin(q.email)}
                  disabled={loading}
                  className="flex flex-col items-center gap-1 border border-white/10 bg-[#06111e] p-3 text-center transition hover:border-cyan-400/50 hover:bg-[#0d2438] disabled:opacity-50"
                >
                  <span className="text-lg">{q.icon}</span>
                  <span className="text-[10px] font-semibold text-white">{q.label}</span>
                  <span className="text-[8px] text-slate-600">{q.email}</span>
                </button>
              ))}
            </div>
          </div>

          <p className="mt-5 text-center text-[10px] leading-4 text-slate-600">
            Connected to FleetOS API · demo credentials: admin@fleetos.io (pass: 123)
          </p>
        </form>
      </div>
    </main>
  );
}
