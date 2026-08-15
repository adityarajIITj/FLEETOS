import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';

interface BootProps {
  onFinish: () => void;
}

export default function Boot({ onFinish }: BootProps) {
  const [filmDone, setFilmDone] = useState(false);

  // Fallback timer if video doesn't fire onEnded (e.g. autoplay policy)
  useEffect(() => {
    const t = window.setTimeout(() => setFilmDone(true), 8500);
    return () => window.clearTimeout(t);
  }, []);

  // ESC key to skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!filmDone) {
          setFilmDone(true);
        } else {
          onFinish();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filmDone, onFinish]);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[#030a12]" data-testid="screen-boot">
      {/* Cinematic Opening Video */}
      <video
        autoPlay
        muted
        playsInline
        onEnded={() => setFilmDone(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
          filmDone ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        src="/assets/fleetos-intro.mp4"
        aria-label="FleetOS opening film"
      />

      {/* Atmospheric dark backdrop overlay */}
      <div
        className={`absolute inset-0 bg-[#030a12] transition-opacity duration-1000 ${
          filmDone ? 'opacity-100' : 'opacity-25'
        }`}
      />

      {/* Logo & Welcome CTA revealed after video */}
      {filmDone && (
        <div className="boot-in relative z-10 flex min-h-[100dvh] flex-col items-center justify-center px-5 text-center">
          <div className="mb-8 w-full max-w-[420px] bg-white p-4 shadow-2xl shadow-cyan-950/40">
            <img src="/assets/fleetos-logo.png" alt="FleetOS official logo" className="h-auto w-full" />
          </div>
          <p className="mono mb-7 text-[10px] uppercase tracking-[.32em] text-slate-400">
            TRACK · OPTIMIZE · DELIVER
          </p>
          <button
            onClick={onFinish}
            data-testid="button-welcome"
            className="group inline-flex items-center gap-3 border border-cyan-400/60 bg-cyan-400 px-6 py-3 text-sm font-semibold text-[#03101a] transition hover:bg-cyan-300"
          >
            Welcome to FleetOS
            <ArrowRight size={16} className="transition group-hover:translate-x-1" />
          </button>
        </div>
      )}

      {/* Skip Button during film */}
      {!filmDone && (
        <button
          onClick={() => setFilmDone(true)}
          data-testid="button-skip-film"
          className="absolute bottom-7 right-7 z-20 border border-white/20 bg-black/40 px-4 py-2 text-xs text-white/80 backdrop-blur-sm transition hover:border-cyan-400 hover:text-white"
        >
          Skip opening sequence <span className="mono ml-2 text-[10px] text-cyan-300">ESC</span>
        </button>
      )}
    </main>
  );
}
