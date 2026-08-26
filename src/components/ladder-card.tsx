"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { Badge, Card, CardTitle } from "@/components/ui";
import { cn } from "@/lib/utils";
import { enqueue } from "@/lib/local/db";

/**
 * Une échelle de progression.
 *
 * Le critère de passage est le même partout : réussir proprement deux séances
 * de suite. Le compteur de séances propres est donc rendu visible, et c'est
 * l'application qui propose le passage — pas l'utilisateur qui décide au feeling,
 * ce que le document désigne comme l'erreur n°1.
 */

interface Ladder {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  currentLevel: number;
  cleanStreak: number;
  levels: { level: number; movement: string; criterion: string }[];
}

export function LadderCard({ ladder }: { ladder: Ladder }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState(ladder.currentLevel);
  const [streak, setStreak] = useState(ladder.cleanStreak);
  const [pending, setPending] = useState(false);

  const current = ladder.levels.find((entry) => entry.level === level);
  const canLevelUp = streak >= 2 && level < ladder.levels.length;

  const save = async (nextLevel: number, nextStreak: number) => {
    setPending(true);
    setLevel(nextLevel);
    setStreak(nextStreak);
    try {
      await enqueue("ladder.upsert", {
        ladderId: ladder.id,
        currentLevel: nextLevel,
        cleanStreak: nextStreak,
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardTitle
        hint={current ? current.criterion : undefined}
        action={
          <Badge tone={canLevelUp ? "success" : "neutral"}>
            niveau {level}/{ladder.levels.length}
          </Badge>
        }
      >
        {ladder.name}
      </CardTitle>

      <p className="font-medium">{current?.movement ?? "—"}</p>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-faint">
          <span>Séances propres consécutives</span>
          <span className="tabular-nums">{streak}/2</span>
        </div>
        <div className="flex gap-1.5">
          {[0, 1].map((index) => (
            <span
              key={index}
              className={cn(
                "h-2 flex-1 rounded-full",
                streak > index ? "bg-success" : "bg-raised",
              )}
            />
          ))}
        </div>
      </div>

      {canLevelUp ? (
        <button
          type="button"
          onClick={() => save(level + 1, 0)}
          disabled={pending}
          className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-success/15 px-3 text-sm font-medium text-success disabled:opacity-60"
        >
          <Check size={16} aria-hidden />
          Passer au niveau {level + 1}
        </button>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => save(level, Math.min(2, streak + 1))}
            disabled={pending}
            className="tap flex-1 rounded-xl border border-border px-3 text-sm text-muted disabled:opacity-60"
          >
            Séance propre
          </button>
          <button
            type="button"
            onClick={() => save(level, 0)}
            disabled={pending}
            className="tap rounded-xl border border-border px-3 text-sm text-faint disabled:opacity-60"
            title="Forme dégradée : le compteur repart à zéro"
          >
            Ratée
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="tap mt-2 flex w-full items-center justify-center gap-1 text-xs text-faint"
      >
        Voir l'échelle
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <ol className="mt-2 space-y-1 text-sm">
          {ladder.levels.map((entry) => (
            <li
              key={entry.level}
              className={cn(
                "flex items-baseline justify-between gap-2 rounded-lg px-2 py-1",
                entry.level === level && "bg-accent/10 text-accent",
                entry.level < level && "text-faint",
              )}
            >
              <span className="min-w-0 truncate">
                <span className="tabular-nums">{entry.level}.</span> {entry.movement}
              </span>
              <span className="shrink-0 text-xs tabular-nums opacity-70">{entry.criterion}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {ladder.description ? (
        <p className="mt-3 text-xs text-faint">{ladder.description}</p>
      ) : null}
    </Card>
  );
}
