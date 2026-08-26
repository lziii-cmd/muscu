import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { getDb, schema } from "@/lib/db/client";
import { getExerciseGuide, getExerciseHistory } from "@/lib/queries";
import {
  advanceDoubleProgression,
  bodyPartOf,
  detectPersonalRecords,
  detectStagnation,
  estimatedOneRepMax,
  type ExerciseHistoryPoint,
} from "@/lib/domain/progression";
import { formatDate, formatKg } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Fiche d'un exercice : historique, records, et la charge conseillée pour la
 * prochaine fois — c'est-à-dire la double progression appliquée.
 */
export default async function ExerciceDetailPage(props: PageProps<"/exercices/[id]">) {
  const { id } = await props.params;
  const exerciseId = Number(id);
  if (!Number.isInteger(exerciseId)) notFound();

  const db = getDb();
  const [exercise] = await db
    .select()
    .from(schema.exercises)
    .where(eq(schema.exercises.id, exerciseId));

  if (!exercise) notFound();

  const [allHistory, guide, prescriptions] = await Promise.all([
    getExerciseHistory(exerciseId),
    getExerciseGuide(exerciseId),
    db
      .select({
        repsLow: schema.programExercises.repsLow,
        repsHigh: schema.programExercises.repsHigh,
        sets: schema.programExercises.sets,
        restSeconds: schema.programExercises.restSeconds,
        loadRaw: schema.programExercises.loadRaw,
      })
      .from(schema.programExercises)
      .where(eq(schema.programExercises.exerciseId, exerciseId))
      .limit(1),
  ]);

  // La progression en charge ne se mesure que sur les séances de salle.
  const history = allHistory.filter((entry) => entry.location === "salle");
  const homeSessions = allHistory.filter((entry) => entry.location === "maison");

  const points: ExerciseHistoryPoint[] = history.map((entry) => ({
    date: entry.date,
    bestWeightKg: entry.weightKg,
    bestReps: entry.reps ?? 0,
    estimatedOneRepMax:
      entry.weightKg && entry.reps ? estimatedOneRepMax(entry.weightKg, entry.reps) : null,
    tonnage: (entry.weightKg ?? 0) * (entry.reps ?? 0) * (entry.sets ?? 1),
  }));

  const records = detectPersonalRecords(points);
  const stagnation = detectStagnation(points);
  const prescription = prescriptions[0];

  const last = history[history.length - 1];
  const advice =
    last && prescription?.repsLow && prescription?.repsHigh && last.reps
      ? advanceDoubleProgression(
          Array.from({ length: last.sets ?? prescription.sets ?? 1 }, () => ({
            reps: last.reps!,
            weightKg: last.weightKg,
          })),
          { low: prescription.repsLow, high: prescription.repsHigh },
          bodyPartOf(exercise.muscleGroup),
        )
      : null;

  return (
    <>
      <Link
        href="/exercices"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-accent"
      >
        <ArrowLeft size={15} aria-hidden />
        Tous les exercices
      </Link>

      <PageHeader
        title={exercise.name}
        subtitle={
          prescription
            ? `Prescrit : ${prescription.sets ?? "?"} × ${prescription.repsLow ?? "?"}${
                prescription.repsHigh && prescription.repsHigh !== prescription.repsLow
                  ? `-${prescription.repsHigh}`
                  : ""
              }${prescription.loadRaw && prescription.loadRaw !== "--" ? ` · ${prescription.loadRaw}` : ""}`
            : undefined
        }
        action={
          <div className="flex gap-2">
            {exercise.equipment ? <Badge>{exercise.equipment.replace(/_/g, " ")}</Badge> : null}
            {exercise.unit === "seconds" ? <Badge tone="accent">tenue</Badge> : null}
          </div>
        }
      />

      {guide ? (
        <Card className="mb-4">
          <CardTitle hint="Fiche de ton programme">Comment le faire</CardTitle>
          <dl className="space-y-1 text-sm">
            {guide.position ? (
              <div>
                <dt className="inline text-faint">Position — </dt>
                <dd className="inline text-muted">{guide.position}</dd>
              </div>
            ) : null}
            {guide.execution ? (
              <div>
                <dt className="inline text-faint">Exécution — </dt>
                <dd className="inline text-muted">{guide.execution}</dd>
              </div>
            ) : null}
            {guide.commonMistake ? (
              <div>
                <dt className="inline text-danger/80">À éviter — </dt>
                <dd className="inline text-muted">{guide.commonMistake}</dd>
              </div>
            ) : null}
            {guide.note ? (
              <div>
                <dt className="inline text-accent/80">Repère — </dt>
                <dd className="inline text-muted">{guide.note}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
      ) : null}

      {history.length === 0 ? (
        <EmptyState
          title={homeSessions.length > 0 ? "Aucune séance de salle" : "Jamais travaillé"}
          detail={
            homeSessions.length > 0
              ? `${homeSessions.length} séance(s) faite(s) à la maison. Elles comptent pour l'assiduité, mais la progression en charge se mesure en salle.`
              : "Cet exercice apparaît dans le programme mais n'a pas encore été enregistré."
          }
        />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card>
              <Stat label="Séances" value={history.length} />
            </Card>
            <Card>
              <Stat
                label="Meilleure charge"
                value={formatKg(Math.max(...history.map((h) => h.weightKg ?? 0)) || null)}
              />
            </Card>
            <Card>
              <Stat
                label="1RM estimé"
                value={
                  Math.max(...points.map((p) => p.estimatedOneRepMax ?? 0)) || "—"
                }
                unit={points.some((p) => p.estimatedOneRepMax) ? "kg" : undefined}
              />
            </Card>
            <Card>
              <Stat
                label="Dernière fois"
                value={formatDate(history[history.length - 1].date, { short: true })}
              />
            </Card>
          </div>

          {advice && advice.action === "augmenter_charge" ? (
            <Card className="mb-4">
              <CardTitle hint="Double progression appliquée à ta dernière séance.">
                Pour la prochaine fois
              </CardTitle>
              <p className="text-sm text-success">{advice.message}</p>
            </Card>
          ) : advice ? (
            <Card className="mb-4">
              <CardTitle>Pour la prochaine fois</CardTitle>
              <p className="text-sm text-muted">{advice.message}</p>
            </Card>
          ) : null}

          {stagnation.stagnant ? (
            <Card className="mb-4">
              <p className="text-sm text-warning">{stagnation.message}</p>
            </Card>
          ) : null}

          {records.length > 0 ? (
            <Card className="mb-4">
              <CardTitle>Records battus à la dernière séance</CardTitle>
              <ul className="flex flex-wrap gap-2">
                {records.map((record) => (
                  <li key={record.kind}>
                    <Badge tone="success">
                      {record.kind === "charge"
                        ? `Charge ${record.value} kg`
                        : record.kind === "reps"
                          ? `${record.value} reps`
                          : record.kind === "1rm_estime"
                            ? `1RM estimé ${record.value} kg`
                            : `Tonnage ${Math.round(record.value)} kg`}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="mb-4">
            <CardTitle hint="1RM estimé — il compte une répétition de plus comme un progrès.">
              Évolution
            </CardTitle>
            <LineChart
              series={points
                .filter((p) => p.estimatedOneRepMax !== null)
                .map((p) => ({
                  label: formatDate(p.date, { short: true }),
                  value: p.estimatedOneRepMax!,
                }))}
              unit="kg (1RM estimé)"
            />
          </Card>

          <Card>
            <CardTitle>Historique</CardTitle>
            <div className="scroll-x">
              <table className="w-full min-w-[380px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-faint">
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="px-2 py-2 text-center font-medium">Charge</th>
                    <th className="px-2 py-2 text-center font-medium">Séries</th>
                    <th className="px-2 py-2 text-center font-medium">
                      {exercise.unit === "seconds" ? "Tenue" : "Reps"}
                    </th>
                    <th className="py-2 pl-2 text-right font-medium">1RM est.</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history].reverse().map((entry, index) => {
                    const point = points[points.length - 1 - index];
                    return (
                      <tr key={`${entry.date}-${index}`} className="border-b border-border/60">
                        <td className="py-2 pr-3 text-muted">{formatDate(entry.date)}</td>
                        <td className="px-2 py-2 text-center tabular-nums">
                          {formatKg(entry.weightKg)}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums text-muted">
                          {entry.sets ?? "—"}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums text-muted">
                          {exercise.unit === "seconds"
                            ? entry.holdSeconds
                              ? `${entry.holdSeconds} s`
                              : "—"
                            : (entry.reps ?? "—")}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums text-muted">
                          {point?.estimatedOneRepMax ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
