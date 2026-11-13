import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Star, Volume2, VolumeX } from "lucide-react";
import { RainbowEngine } from "@/game/engine";
import type { Mode, RunStats } from "@/game/types";

export function RainbowRun() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const bestRef = useRef<HTMLSpanElement>(null);
  const starsRef = useRef<HTMLSpanElement>(null);
  const engineRef = useRef<RainbowEngine | null>(null);
  const [mode, setMode] = useState<Mode>("menu");
  const [stats, setStats] = useState<RunStats | null>(null);
  const [muted, setMuted] = useState(false);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const score = scoreRef.current;
    const best = bestRef.current;
    const stars = starsRef.current;
    if (!canvas || !stage || !score || !best || !stars) return;
    const engine = new RainbowEngine(
      canvas,
      { score, best, stars, stage },
      (event) => {
        if (event.type === "mode") setMode(event.mode);
        else if (event.type === "start") setRun((n) => n + 1);
        else if (event.type === "over") setStats(event.stats);
        else setMuted(event.muted);
      },
    );
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div ref={stageRef} className="stage">
      <canvas ref={canvasRef} aria-hidden="true" />
      <div className="safe-pad pointer-events-none absolute inset-0 flex flex-col">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-accent">SCORE</p>
            <div ref={scoreRef} className="score-num font-display text-4xl leading-none tabular-nums">
              0
            </div>
            <p className="mt-1 flex items-center gap-3 text-sm text-muted">
              <span>
                Best <span ref={bestRef} className="font-semibold text-fg tabular-nums">0</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Star className="size-4 text-accent" aria-hidden="true" />
                <span ref={starsRef} className="font-semibold text-fg tabular-nums">0</span>
              </span>
            </p>
          </div>
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              data-ui=""
              className="flex size-11 items-center justify-center rounded-full border border-border bg-surface/80 text-fg backdrop-blur-md"
              onClick={() => engineRef.current?.toggleMute()}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
            </button>
            {mode === "play" || mode === "pause" ? (
              <button
                type="button"
                data-ui=""
                className="flex size-11 items-center justify-center rounded-full border border-border bg-surface/80 text-fg backdrop-blur-md"
                onClick={() => engineRef.current?.togglePause()}
                aria-label={mode === "pause" ? "Resume" : "Pause"}
              >
                {mode === "pause" ? <Play className="size-5" /> : <Pause className="size-5" />}
              </button>
            ) : null}
          </div>
        </header>

        {mode === "play" ? (
          <p
            key={run}
            className="hint-fade pointer-events-none mt-auto mb-4 text-center text-sm font-medium text-muted"
          >
            Tap or hold to jump higher
          </p>
        ) : null}
      </div>

      {mode === "menu" ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center safe-pad">
          <div className="card-in pointer-events-auto mt-16 w-full max-w-sm rounded-2xl border border-border bg-surface/90 p-5 text-center shadow-2xl backdrop-blur-md">
            <p className="text-xs font-semibold tracking-widest text-accent">ENDLESS SPACE HOP</p>
            <h1 className="logo-text font-display mt-2 text-4xl leading-none sm:text-5xl">Rainbow Worm</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Hop the space junk. A tap is a short hop. Hold for a high one.
            </p>
            <button
              type="button"
              data-ui=""
              className="mt-5 h-12 w-full rounded-full bg-accent text-base font-semibold text-accent-ink"
              onClick={() => engineRef.current?.start(false)}
            >
              Play
            </button>
            <p className="mt-3 text-xs text-muted">Space, tap, or ↑ · M mute · Esc pause</p>
          </div>
        </div>
      ) : null}

      {mode === "pause" ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center safe-pad">
          <div className="card-in pointer-events-auto mt-20 w-full max-w-sm rounded-2xl border border-border bg-surface/90 p-6 text-center backdrop-blur-md">
            <h2 className="font-display text-3xl">Paused</h2>
            <p className="mt-2 text-sm text-muted">The current keeps moving when you do.</p>
            <button
              type="button"
              data-ui=""
              className="mt-5 h-12 w-full rounded-full bg-accent text-base font-semibold text-accent-ink"
              onClick={() => engineRef.current?.togglePause()}
            >
              Resume
            </button>
          </div>
        </div>
      ) : null}

      {mode === "dead" && stats ? (
        <div className="pointer-events-none absolute inset-0 flex items-start justify-center safe-pad">
          <div className="card-in pointer-events-auto mt-20 w-full max-w-sm rounded-2xl border border-border bg-surface/90 p-6 text-center backdrop-blur-md">
            <p className="text-xs font-semibold tracking-widest text-accent">
              {stats.isNewBest ? "NEW BEST" : "SPLAT"}
            </p>
            <h2 className="font-display mt-1 text-5xl tabular-nums leading-none">{stats.score}</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div className="rounded-xl border border-border px-2 py-2">
                <dt className="text-muted">Distance</dt>
                <dd className="font-semibold tabular-nums">{stats.distance}</dd>
              </div>
              <div className="rounded-xl border border-border px-2 py-2">
                <dt className="text-muted">Stars</dt>
                <dd className="font-semibold tabular-nums">{stats.stars}</dd>
              </div>
              <div className="rounded-xl border border-border px-2 py-2">
                <dt className="text-muted">Close</dt>
                <dd className="font-semibold tabular-nums">{stats.near}</dd>
              </div>
            </dl>
            <button
              type="button"
              data-ui=""
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent text-base font-semibold text-accent-ink"
              onClick={() => engineRef.current?.restart()}
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Retry
            </button>
            <button
              type="button"
              data-ui=""
              className="mt-2 h-11 w-full rounded-full border border-border text-sm font-semibold text-fg"
              onClick={() => engineRef.current?.toMenu()}
            >
              Menu
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
