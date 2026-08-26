"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, X } from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";

/**
 * Chronomètre de repos.
 *
 * Le programme est formel : « chronomètre tes repos. Sans chrono, 2 min
 * deviennent 4. C'est la cause n°1 des séances qui débordent. » Le compteur
 * démarre donc tout seul à la validation d'une série, avec le repos prescrit.
 *
 * Il s'appuie sur une échéance absolue plutôt que sur un décompte : un
 * intervalle JavaScript est suspendu quand l'écran du téléphone s'éteint, ce
 * qui arrive systématiquement entre deux séries.
 *
 * Le parent monte ce composant avec une `key` distincte à chaque nouveau repos :
 * un remontage réinitialise l'état proprement, sans effet de réinitialisation.
 */
export function RestTimer({
  seconds,
  label,
  onDismiss,
}: {
  seconds: number;
  label: string;
  onDismiss: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);
  const [paused, setPaused] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (paused) return;

    // L'échéance est posée ici, jamais pendant le rendu : lire l'horloge est
    // un effet de bord.
    if (deadlineRef.current === null) {
      deadlineRef.current = Date.now() + seconds * 1000;
    }

    const tick = () => {
      const left = Math.round(((deadlineRef.current ?? Date.now()) - Date.now()) / 1000);
      setRemaining(left);

      if (left <= 0 && !notifiedRef.current) {
        notifiedRef.current = true;
        // Vibration courte : à 23h, le son n'est pas toujours souhaitable.
        if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
      }
    };

    const interval = window.setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [paused, seconds]);

  const restart = () => {
    deadlineRef.current = Date.now() + seconds * 1000;
    notifiedRef.current = false;
    setRemaining(seconds);
    setPaused(false);
  };

  const togglePause = () => {
    if (paused) {
      deadlineRef.current = Date.now() + remaining * 1000;
      setPaused(false);
    } else {
      setPaused(true);
    }
  };

  const done = remaining <= 0;
  const progress = Math.max(0, Math.min(1, remaining / seconds));
  const circumference = 2 * Math.PI * 17;

  return (
    <div
      className="fixed inset-x-0 bottom-16 z-50 mx-auto w-full max-w-md px-4 lg:bottom-6"
      role="timer"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-lg backdrop-blur",
          done ? "border-success/50 bg-success/15" : "border-border bg-surface/95",
        )}
      >
        <div className="relative grid size-12 shrink-0 place-items-center">
          <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="20" cy="20" r="17" fill="none" stroke="var(--border)" strokeWidth="4" />
            <circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              stroke={done ? "var(--success)" : "var(--accent)"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>
          <span className="text-xs font-semibold tabular-nums">
            {done ? "GO" : formatDuration(Math.max(0, remaining))}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{done ? "Repos terminé" : "Repos en cours"}</p>
          <p className="truncate text-xs text-faint">{label}</p>
        </div>

        <button
          type="button"
          onClick={restart}
          className="tap grid place-items-center rounded-lg text-muted hover:text-text"
          aria-label="Relancer le repos"
        >
          <RotateCcw size={18} />
        </button>

        <button
          type="button"
          onClick={togglePause}
          className="tap grid place-items-center rounded-lg text-muted hover:text-text"
          aria-label={paused ? "Reprendre" : "Mettre en pause"}
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="tap grid place-items-center rounded-lg text-muted hover:text-text"
          aria-label="Fermer le chronomètre"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
