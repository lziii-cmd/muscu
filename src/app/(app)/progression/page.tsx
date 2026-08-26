import Link from "next/link";
import { Card, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";
import { getExerciseHistory, getTrackedExercises } from "@/lib/queries";
import {
  bestEstimatedOneRepMax,
  detectPersonalRecords,
  detectStagnation,
  estimatedOneRepMax,
  type ExerciseHistoryPoint,
} from "@/lib/domain/progression";
import { formatDate, formatKg } from "@/lib/utils";
import { Sparkline } from "@/components/charts";

export const dynamic = "force-dynamic";

/** Les semaines où le programme demande de relever le tableau de charges. */
const LOAD_TABLE_WEEKS = [2, 4, 6, 9, 11, 13, 16];

/**
 * Progression : ce qui monte, ce qui stagne, et le tableau de charges rempli
 * tout seul — celui que le PDF laisse vide.
 */
export default async function ProgressionPage() {
  const tracked = await getTrackedExercises();

  if (tracked.length === 0) {
    return (
      <>
        <PageHeader title="Progression" subtitle="Courbes, records et stagnation par exercice." />
        <EmptyState
          title="Rien à analyser pour l'instant"
          detail="Enregistre quelques séances : les courbes apparaissent dès la deuxième."
        />
      </>
    );
  }

  const histories = await Promise.all(
    tracked.map(async (exercise) => {
      // Le programme est explicite : « ta progression en charge se mesure sur
      // les séances de salle uniquement ». Les séances maison sont donc
      // écartées ici — elles comptent pour l'assiduité, pas pour la charge.
      const raw = (await getExerciseHistory(exercise.exerciseId)).filter(
        (entry) => entry.location === "salle",
      );

      // Un point par séance : le 1RM estimé absorbe charge ET répétitions,
      // donc une répétition de plus à charge égale compte comme un progrès.
      const points: ExerciseHistoryPoint[] = raw.map((entry) => {
        const reps = entry.reps ?? 0;
        const weight = entry.weightKg ?? 0;
        const sets = entry.sets ?? 1;
        return {
          date: entry.date,
          bestWeightKg: entry.weightKg,
          bestReps: reps,
          estimatedOneRepMax: weight > 0 && reps > 0 ? estimatedOneRepMax(weight, reps) : null,
          tonnage: weight * reps * sets,
        };
      });

      return {
        exercise,
        points,
        records: detectPersonalRecords(points),
        stagnation: detectStagnation(points),
        best: bestEstimatedOneRepMax(
          raw.map((entry) => ({ reps: entry.reps ?? 0, weightKg: entry.weightKg })),
        ),
      };
    }),
  );

  const progressing = histories.filter((h) => h.records.length > 0);
  const stagnating = histories.filter((h) => h.stagnation.stagnant);

  return (
    <>
      <PageHeader
        title="Progression"
        subtitle="Le 1RM estimé sert de mesure : il compte une répétition de plus comme un progrès réel. Les séances faites à la maison sont exclues — les deux échelles ne se comparent pas."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card>
          <Stat label="Exercices suivis" value={tracked.length} />
        </Card>
        <Card>
          <Stat label="En progrès" value={progressing.length} tone="success" />
        </Card>
        <Card>
          <Stat label="En stagnation" value={stagnating.length} tone={stagnating.length ? "warning" : "neutral"} />
        </Card>
      </div>

      {stagnating.length > 0 ? (
        <Card className="mb-4">
          <CardTitle hint="Vérifie le sommeil et les calories avant de forcer la charge.">
            À surveiller
          </CardTitle>
          <ul className="space-y-2">
            {stagnating.map(({ exercise, stagnation }) => (
              <li key={exercise.exerciseId} className="text-sm">
                <span className="font-medium">{exercise.name}</span>
                <span className="text-muted"> — {stagnation.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-4">
        <CardTitle hint="Une ligne par exercice. Ce tableau remplace celui laissé vide dans le PDF.">
          Tableau de charges
        </CardTitle>

        <div className="scroll-x">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="py-2 pr-3 font-medium">Exercice</th>
                {LOAD_TABLE_WEEKS.map((week) => (
                  <th key={week} className="px-2 py-2 text-center font-medium tabular-nums">
                    S{week}
                  </th>
                ))}
                <th className="py-2 pl-2 text-right font-medium">Meilleure</th>
              </tr>
            </thead>
            <tbody>
              {histories.slice(0, 20).map(({ exercise, points, best }) => (
                <tr key={exercise.exerciseId} className="border-b border-border/60">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/exercices/${exercise.exerciseId}`}
                      className="font-medium hover:text-accent"
                    >
                      {exercise.name}
                    </Link>
                  </td>
                  {LOAD_TABLE_WEEKS.map((week) => {
                    // Chaque semaine du programme démarre un lundi ; on prend la
                    // meilleure charge enregistrée dans cette fenêtre.
                    const start = weekStartDate(week);
                    const end = weekStartDate(week + 1);
                    const inWeek = points.filter((p) => p.date >= start && p.date < end);
                    const weight = inWeek.reduce<number | null>(
                      (max, p) => (p.bestWeightKg !== null && (max === null || p.bestWeightKg > max) ? p.bestWeightKg : max),
                      null,
                    );
                    return (
                      <td key={week} className="px-2 py-2 text-center tabular-nums text-muted">
                        {weight === null ? "—" : weight}
                      </td>
                    );
                  })}
                  <td className="py-2 pl-2 text-right tabular-nums">
                    {best === null ? "—" : `${best} kg*`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-faint">* 1RM estimé (formule d'Epley), pas une charge réellement soulevée.</p>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {histories.slice(0, 8).map(({ exercise, points, records, best }) => (
          <Card key={exercise.exerciseId}>
            <CardTitle hint={`${exercise.sessions} séance${exercise.sessions > 1 ? "s" : ""} · dernière le ${formatDate(exercise.lastDate)}`}>
              {exercise.name}
            </CardTitle>

            <Sparkline
              values={points.map((p) => p.estimatedOneRepMax ?? 0)}
              labels={points.map((p) => formatDate(p.date, { short: true }))}
            />

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted">
                Meilleure charge{" "}
                <span className="font-medium text-text tabular-nums">
                  {formatKg(exercise.bestWeight)}
                </span>
              </span>
              {best !== null ? (
                <span className="text-muted">
                  1RM estimé <span className="font-medium text-text tabular-nums">{best} kg</span>
                </span>
              ) : null}
            </div>

            {records.length > 0 ? (
              <p className="mt-2 text-sm text-success">
                Record battu à la dernière séance :{" "}
                {records
                  .map((record) =>
                    record.kind === "charge"
                      ? `charge ${record.value} kg`
                      : record.kind === "reps"
                        ? `${record.value} reps`
                        : record.kind === "1rm_estime"
                          ? `1RM estimé ${record.value} kg`
                          : `tonnage ${Math.round(record.value)} kg`,
                  )
                  .join(", ")}
                .
              </p>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}

/** Lundi de la semaine N du programme (semaine 1 = 24 août 2026). */
function weekStartDate(week: number): string {
  const start = new Date("2026-08-24T00:00:00Z").getTime();
  return new Date(start + (week - 1) * 7 * 86_400_000).toISOString().slice(0, 10);
}
