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

/*
 * Diète version 2 (« sans thon en boîte ») : journée du mardi de la semaine A,
 * un jour de salle, repas pour repas — 187 g de protéines. Plus aucun produit
 * de la mer, hors thiof occasionnel ; horaires recalés sur la séance de 22h.
 */
const TEMPLATE = [
  {
    slot: "petit_dejeuner" as const,
    time: "07h00",
    title: "Petit-déjeuner",
    content: "Omelette 4 œufs + 2 tranches de pain complet",
    proteinG: 30,
    items: [
      { slug: "oeuf", portions: 4 },
      { slug: "pain-complet", portions: 1 },
    ],
  },
  {
    slot: "collation_matin" as const,
    time: "11h00",
    title: "Collation",
    content: "250 ml de lait caillé nature + 1 orange",
    proteinG: 9,
    items: [{ slug: "lait-caille", portions: 1 }],
  },
  {
    slot: "dejeuner" as const,
    time: "14h00",
    title: "Déjeuner",
    content: "Salade poulet-niébé : 150 g de poulet + 1 bol de niébé + crudités + citron",
    proteinG: 52,
    items: [
      { slug: "poulet", portions: 1.5 },
      { slug: "niebe", portions: 0.5 },
    ],
    emphasis: "La formule du midi : la protéine d'abord, crudités à volonté, 1 poing de féculent.",
  },
  {
    slot: "collation_apres_midi" as const,
    time: "17h30",
    title: "Collation",
    content: "2 œufs durs + 1 poignée d'arachides (30 g) — ou 3 œufs durs + 250 ml de lait caillé",
    proteinG: 19,
    items: [
      { slug: "oeuf", portions: 2 },
      { slug: "arachides", portions: 1 },
    ],
    emphasis: "Fais cuire tes œufs durs par lot de 6 à 8 la veille : c'est cette collation qui saute en premier.",
  },
  {
    slot: "diner" as const,
    time: "19h00",
    title: "Dîner",
    content: "Poulet grillé + thiéré (couscous de mil) + salade",
    proteinG: 45,
    items: [
      { slug: "poulet", portions: 1.5 },
      { slug: "thiere", portions: 1 },
    ],
    emphasis: "Repas complet, glucides compris : 3 h avant la séance de 22h.",
  },
  {
    slot: "post_seance" as const,
    time: "23h15",
    title: "Post-séance",
    content: "Shaker whey + lait caillé",
    proteinG: 32,
    items: [
      { slug: "whey", portions: 1 },
      { slug: "lait-caille", portions: 1 },
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
