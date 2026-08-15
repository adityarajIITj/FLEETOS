import { useState, useEffect } from 'react';
import { ArrowRight, Truck, MapPin, Package, Radio } from 'lucide-react';

interface ImmersionProps {
  onEnter: () => void;
}

export default function Immersion({ onEnter }: ImmersionProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const steps = [
      { delay: 200, value: 15 },
      { delay: 600, value: 35 },
      { delay: 1000, value: 55 },
      { delay: 1500, value: 75 },
      { delay: 2000, value: 90 },
      { delay: 2500, value: 100 },
    ];
    const timers = steps.map(s => setTimeout(() => setProgress(s.value), s.delay));
    const enter = setTimeout(onEnter, 3200);
    return () => { timers.forEach(clearTimeout); clearTimeout(enter); };
  }, [onEnter]);

  const items = [
    { icon: <MapPin size={16} />, label: 'Geographic intelligence', delay: '0.3s' },
    { icon: <Truck size={16} />, label: 'Live vehicle positions', delay: '0.6s' },
    { icon: <Package size={16} />, label: 'Cargo tracking', delay: '0.9s' },
    { icon: <Radio size={16} />, label: 'Real-time telemetry', delay: '1.2s' },
  ];

  return (
    <main className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#040c16]">
      {/* Background */}
      <img
        src="/assets/frame-fleet.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-[.08] transition-opacity duration-[2s]"
        style={{ opacity: progress > 50 ? 0.12 : 0.06 }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_60%,rgba(0,171,227,.1),transparent_45%)]" />

      <div className="relative z-10 mx-auto max-w-lg px-6 text-center">
        <div className="mono mb-6 text-[10px] uppercase tracking-[.3em] text-cyan-300">
          Initializing command center
        </div>

        {/* Progress bar */}
        <div className="mx-auto mb-8 h-[2px] w-64 overflow-hidden bg-white/10">
          <div
            className="h-full bg-cyan-400 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Loading items */}
        <div className="space-y-3">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-center gap-3 text-sm transition-all duration-500"
              style={{
                opacity: progress > (i + 1) * 20 ? 1 : 0.2,
                transform: progress > (i + 1) * 20 ? 'translateY(0)' : 'translateY(6px)',
                transitionDelay: item.delay,
              }}
            >
              <span className="text-cyan-300">{item.icon}</span>
              <span className="text-slate-400">{item.label}</span>
              {progress > (i + 1) * 20 && (
                <span className="text-xs text-emerald-400">●</span>
              )}
            </div>
          ))}
        </div>

        {progress >= 100 && (
          <button
            onClick={onEnter}
            className="boot-in mt-10 inline-flex items-center gap-2 border border-cyan-400/60 bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-[#03101a] transition hover:bg-cyan-300"
          >
            Enter command center
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </main>
  );
}
