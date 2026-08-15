import { Truck, Radio, ShieldCheck, ArrowRight, Navigation } from 'lucide-react';
import type { ReactNode } from 'react';

export type Role = 'Driver' | 'Dispatcher' | 'Admin';

interface RoleSelectProps {
  onRole: (role: Role) => void;
}

export default function RoleSelect({ onRole }: RoleSelectProps) {
  const roles: { role: Role; icon: ReactNode; note: string }[] = [
    { role: 'Driver', icon: <Truck size={22} />, note: 'Your route, vehicle, and next stop.' },
    { role: 'Dispatcher', icon: <Radio size={22} />, note: 'Live fleet coordination and flow.' },
    { role: 'Admin', icon: <ShieldCheck size={22} />, note: 'Platform health and operations.' },
  ];

  return (
    <main className="relative flex min-h-[100dvh] items-center overflow-hidden bg-[#061321] px-5 py-12">
      <img
        src="/assets/frame-aerial.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-[.16]"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,#061321_0%,transparent_65%,#061321_100%)]" />

      <div className="boot-in relative mx-auto w-full max-w-5xl">
        {/* Header */}
        <div className="mb-12 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center border border-cyan-400/70 bg-cyan-400/10 p-1.5">
            <Navigation size={18} className="text-cyan-300" />
          </div>
          <span className="text-lg font-bold tracking-tight">
            Fleet<span className="text-cyan-300">OS</span>
          </span>
          <span className="mono ml-3 border-l border-white/10 pl-3 text-[10px] uppercase tracking-[.2em] text-slate-500">
            secure access
          </span>
        </div>

        {/* Title */}
        <div className="max-w-2xl">
          <p className="mono mb-4 text-[10px] uppercase tracking-[.32em] text-cyan-300">
            COMMAND NETWORK / 01
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            Where do you<br />
            <span className="text-slate-400">operate from?</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-6 text-slate-400">
            FleetOS connects every movement to one operational view. Select your workspace to continue.
          </p>
        </div>

        {/* Role Cards */}
        <div className="mt-12 grid max-w-3xl gap-3 md:grid-cols-3">
          {roles.map(({ role, icon, note }) => (
            <button
              key={role}
              onClick={() => onRole(role)}
              className="group flex min-h-[150px] flex-col justify-between border border-white/10 bg-[#0a1b2b]/75 p-5 text-left transition hover:-translate-y-1 hover:border-cyan-400/70 hover:bg-[#0d2438]"
            >
              <div className="flex items-center justify-between">
                <span className="text-cyan-300">{icon}</span>
                <ArrowRight
                  size={16}
                  className="text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-300"
                />
              </div>
              <div>
                <div className="text-base font-semibold text-white">{role}</div>
                <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div>
              </div>
            </button>
          ))}
        </div>

        <p className="mono mt-12 text-[10px] uppercase tracking-[.18em] text-slate-600">
          FleetOS network · encrypted session · v2.8.14
        </p>
      </div>
    </main>
  );
}
