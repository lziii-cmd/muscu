"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { enqueue } from "@/lib/local/db";

/*
 * Repas de la journée type.
 *
 * Les six créneaux du document sont pré-remplis avec leur contenu et leurs
 * aliments. Valider un repas prend un tap : la saisie alimentaire échoue
 * toujours par la friction, jamais par le manque de précision.
 */

const TEMPLATE = [
  {
    slot: "petit_dejeuner" as const,
    time: "07h00",
    title: "Petit-déjeuner",
    content: "3 œufs + 1/4 de tapalapa + café ou thé sans sucre",
    proteinG: 22,
    items: [
      { slug: "oeuf", portions: 3 },
      { slug: "tapalapa", portions: 1 },
    ],
  },
  {
    slot: "collation_matin" as const,
    time: "11h00",
    title: "Collation",
    content: "250 ml de lait caillé nature + 1 fruit",
    proteinG: 9,
    items: [{ slug: "lait-caille", portions: 1 }],
  },
  {
    slot: "dejeuner" as const,
    time: "14h00",
    title: "Déjeuner",
    content: "1 poing de riz, double portion de poisson, légumes à volonté, huile réduite",
    proteinG: 35,
    items: [
      { slug: "yaboy", portions: 1.5 },
      { slug: "riz-cuit", portions: 1 },
    ],
  },
  {
    slot: "collation_apres_midi" as const,
    time: "17h30",
    title: "Collation",
    content: "2 œufs durs, ou une poignée d'arachides (30 g), ou 1 boîte de thon",
    proteinG: 15,
    items: [{ slug: "oeuf", portions: 2 }],
  },
  {
    slot: "diner" as const,
    time: "20h00",
    title: "Dîner",
    content: "Poisson ou poulet + thiéré ou patate douce + légumes",
    proteinG: 35,
    items: [
      { slug: "maquereau", portions: 1.5 },
      { slug: "thiere", portions: 1 },
    ],
    emphasis: "Complet, glucides inclus, 2 à 3 h avant la séance. Le sauter, c'est perdre sa force.",
  },
  {
    slot: "post_seance" as const,
    time: "00h15",
    title: "Post-séance",
    content: "Léger et protéiné : lait caillé + 2 œufs, ou 1 boîte de thon, ou un shaker",
    proteinG: 25,
    items: [
      { slug: "lait-caille", portions: 1 },
      { slug: "oeuf", portions: 2 },
    ],
    emphasis: "Léger. Un gros repas à cette heure dégrade le sommeil.",
  },
];

interface Food {
  id: number;
  slug: string;
  name: string;
  proteinG: number;
}

interface LoggedMeal {
  slot: string;
  items: { name: string; portions: number; proteinG: number }[];
}

export function MealTemplate({
  date,
  foods,
  logged,
}: {
  date: string;
  foods: Food[];
  logged: LoggedMeal[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const bySlug = new Map(foods.map((food) => [food.slug, food]));

  const validate = async (entry: (typeof TEMPLATE)[number]) => {
    setPending(entry.slot);
    try {
      const items = entry.items
        .map((item) => {
          const food = bySlug.get(item.slug);
          return food ? { foodId: food.id, portions: item.portions } : null;
        })
        .filter((item): item is { foodId: number; portions: number } => item !== null);

      await enqueue("meal.upsert", { date, slot: entry.slot, note: null, items });
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  const clear = async (slot: string) => {
    setPending(slot);
    try {
      await enqueue("meal.upsert", { date, slot, note: null, items: [] });
      router.refresh();
    } finally {
      setPending(null);
    }
  };

  return (
    <ul className="divide-y divide-border">
      {TEMPLATE.map((entry) => {
        const done = logged.find((meal) => meal.slot === entry.slot);
        const doneProtein = done?.items.reduce((sum, item) => sum + item.proteinG, 0) ?? 0;
        const isDone = (done?.items.length ?? 0) > 0;

        return (
          <li key={entry.slot} className="flex items-start gap-3 py-3">
            <button
              type="button"
              onClick={() => (isDone ? clear(entry.slot) : validate(entry))}
              disabled={pending === entry.slot}
              aria-pressed={isDone}
              aria-label={`${entry.title} : ${isDone ? "validé" : "à valider"}`}
              className={cn(
                "tap mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl border-2 transition-colors disabled:opacity-50",
                isDone ? "border-success bg-success/20 text-success" : "border-border-strong text-faint",
              )}
            >
              {isDone ? <Check size={20} /> : <Plus size={18} />}
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs tabular-nums text-faint">{entry.time}</span>
                <span className="font-medium">{entry.title}</span>
                <span className="text-xs tabular-nums text-muted">
                  ~{isDone ? Math.round(doneProtein) : entry.proteinG} g
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted">{entry.content}</p>
              {entry.emphasis ? (
                <p className="mt-1 text-xs text-warning">{entry.emphasis}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
