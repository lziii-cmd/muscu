import Link from "next/link";
import { asc } from "drizzle-orm";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { getDb, schema } from "@/lib/db/client";
import { getTrackedExercises } from "@/lib/queries";
import { formatDate, formatKg } from "@/lib/utils";

export const dynamic = "force-dynamic";

const GROUP_LABELS: Record<string, string> = {
  push: "Poussée",
  pull: "Tirage",
  legs: "Jambes",
  core: "Gainage",
  mobilite: "Mobilité",
  bras_tendus: "Bras tendus",
  autre: "Autre",
};

/**
 * Bibliothèque d'exercices.
 *
 * Chaque exercice rencontré dans les deux programmes, avec ton historique
 * personnel dessus. C'est le point d'entrée quand on se demande « qu'est-ce que
 * j'avais mis la dernière fois ».
 */
export default async function ExercicesPage() {
  const db = getDb();
  const [all, tracked] = await Promise.all([
    db.select().from(schema.exercises).orderBy(asc(schema.exercises.name)),
    getTrackedExercises(),
  ]);

  const trackedById = new Map(tracked.map((entry) => [entry.exerciseId, entry]));

  const groups = new Map<string, typeof all>();
  for (const exercise of all) {
    const key = exercise.muscleGroup ?? "autre";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(exercise);
  }

  const order = ["push", "pull", "legs", "core", "bras_tendus", "mobilite", "autre"];

  return (
    <>
      <PageHeader
        title="Exercices"
        subtitle={`${all.length} exercices dans les deux programmes, ${tracked.length} déjà travaillés.`}
      />

      <div className="space-y-4">
        {order
          .filter((key) => groups.has(key))
          .map((key) => (
            <Card key={key}>
              <CardTitle>{GROUP_LABELS[key] ?? key}</CardTitle>
              <ul className="divide-y divide-border">
                {groups.get(key)!.map((exercise) => {
                  const history = trackedById.get(exercise.id);
                  return (
                    <li key={exercise.id}>
                      <Link
                        href={`/exercices/${exercise.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{exercise.name}</span>
                          <span className="block text-xs text-faint">
                            {exercise.equipment?.replace(/_/g, " ")}
                            {exercise.unit === "seconds" ? " · tenue" : ""}
                          </span>
                        </span>

                        {history ? (
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-xs tabular-nums text-faint">
                              {formatDate(history.lastDate, { short: true })}
                            </span>
                            <Badge tone="accent">{formatKg(history.bestWeight)}</Badge>
                          </span>
                        ) : (
                          <Badge>jamais fait</Badge>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
      </div>
    </>
  );
}
