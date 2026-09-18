import { Alert, Badge, Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { BarList } from "@/components/charts";
import {
  getBodyweightEntries,
  getDayNutrition,
  getExerciseHistory,
  getMeasurements,
  getSessionRecords,
  getSleepEntries,
  getTrackedExercises,
} from "@/lib/queries";
import {
  adherence,
  loggingQuality,
  missPatterns,
  MISSED_REASON_LABELS,
  type MissedReason,
  type SessionRecord,
} from "@/lib/domain/adherence";
import { movingAverage, recompositionVerdict, trendOf, weeklyChange } from "@/lib/domain/body";
import { detectStagnation, estimatedOneRepMax, type ExerciseHistoryPoint } from "@/lib/domain/progression";
import { addDays, formatDate, startOfWeek, today } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Bilan hebdomadaire.
 *
 * Un seul écran qui tranche : ça progresse, ça stagne, ou ça régresse — et où.
 * C'est la réponse à la question posée au départ, et elle ne doit pas demander
 * d'interpréter trois graphes.
 */
export default async function BilanPage() {
  const date = today();
  const weekStart = startOfWeek(date);
  const weekEnd = addDays(weekStart, 6);
  const previousStart = addDays(weekStart, -7);

  const [records, previousRecords, weights, measurements, sleep, tracked, nutrition] =
    await Promise.all([
      getSessionRecords(weekStart, weekEnd),
      getSessionRecords(previousStart, addDays(previousStart, 6)),
      getBodyweightEntries(),
      getMeasurements(),
      getSleepEntries(addDays(date, -14)),
      getTrackedExercises(),
      getDayNutrition(date),
    ]);

  const toRecord = (rows: typeof records): SessionRecord[] =>
    rows.map((row) => ({
      date: row.date,
      slot: row.slot as SessionRecord["slot"],
      status: row.status as SessionRecord["status"],
      missedReason: row.missedReason as MissedReason | null,
      loggedAt: row.loggedAt?.toISOString() ?? null,
    }));

  const week = toRecord(records);
  const previousWeek = toRecord(previousRecords);

  const stats = adherence(week);
  const previousStats = adherence(previousWeek);
  const patterns = missPatterns(week);
  const logging = loggingQuality(week);

  const averages = movingAverage(weights);
  const change = weeklyChange(averages);

  const waist = measurements.filter((m) => m.kind === "taille");
  const weightTrend = trendOf(averages.slice(-21).map((a) => a.weightKg), 0.8);
  const waistTrend = trendOf(waist.slice(-3).map((m) => m.valueCm), 0.8);
  const strengthTrend = trendOf(
    tracked.map((e) => Number(e.bestWeight)).filter(Number.isFinite).slice(-6),
    1,
  );
  const verdict = recompositionVerdict({ weightTrend, waistTrend, strengthTrend });

  // Progression et stagnation, exercice par exercice.
  const histories = await Promise.all(
    tracked.slice(0, 12).map(async (exercise) => {
      const raw = await getExerciseHistory(exercise.exerciseId);
      const points: ExerciseHistoryPoint[] = raw.map((entry) => ({
        date: entry.date,
        bestWeightKg: entry.weightKg,
        bestReps: entry.reps ?? 0,
        estimatedOneRepMax:
          entry.weightKg && entry.reps ? estimatedOneRepMax(entry.weightKg, entry.reps) : null,
        tonnage: (entry.weightKg ?? 0) * (entry.reps ?? 0) * (entry.sets ?? 1),
      }));
      return { exercise, points, stagnation: detectStagnation(points) };
    }),
  );

  const stagnating = histories.filter((h) => h.stagnation.stagnant);
  const progressing = histories.filter((h) => {
    const valid = h.points.filter((p) => p.estimatedOneRepMax !== null);
    if (valid.length < 2) return false;
    return valid[valid.length - 1].estimatedOneRepMax! > valid[0].estimatedOneRepMax!;
  });

  const weekTonnage = histories.reduce(
    (sum, h) =>
      sum + h.points.filter((p) => p.date >= weekStart && p.date <= weekEnd).reduce((s, p) => s + p.tonnage, 0),
    0,
  );
  const previousTonnage = histories.reduce(
    (sum, h) =>
      sum +
      h.points
        .filter((p) => p.date >= previousStart && p.date < weekStart)
        .reduce((s, p) => s + p.tonnage, 0),
    0,
  );

  const sleepAverage =
    sleep.filter((s) => s.durationMinutes !== null).length > 0
      ? sleep
          .filter((s) => s.durationMinutes !== null)
          .reduce((sum, s) => sum + s.durationMinutes!, 0) /
        sleep.filter((s) => s.durationMinutes !== null).length /
        60
      : null;

  // Conclusion générale, exprimée en une phrase.
  const conclusion = (() => {
    if (stats.rate === 0 && week.length === 0) {
      return { tone: "info" as const, title: "Semaine pas encore commencée", detail: "Aucune séance enregistrée cette semaine." };
    }
    if (verdict.verdict === "recomposition") {
      return { tone: "success" as const, title: "Ça progresse", detail: verdict.detail };
    }
    if (stagnating.length > progressing.length) {
      return {
        tone: "warning" as const,
        title: "Ça stagne",
        detail: `${stagnating.length} exercices sans progresser contre ${progressing.length} en hausse. ${verdict.detail}`,
      };
    }
    if (progressing.length > 0) {
      return {
        tone: "success" as const,
        title: "Ça progresse",
        detail: `${progressing.length} exercices en hausse. ${verdict.detail}`,
      };
    }
    return { tone: "info" as const, title: verdict.headline, detail: verdict.detail };
  })();

  return (
    <>
      <PageHeader
        title="Bilan de la semaine"
        subtitle={`${formatDate(weekStart)} → ${formatDate(weekEnd)}`}
      />

      <Card className="mb-4">
        <Alert tone={conclusion.tone} title={conclusion.title}>
          {conclusion.detail}
        </Alert>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <Stat
            label="Assiduité"
            value={stats.rate}
            unit="%"
            tone={stats.rate >= 80 ? "success" : stats.rate >= 60 ? "warning" : "danger"}
            hint={`${previousStats.rate} % la semaine passée`}
          />
        </Card>
        <Card>
          <Stat
            label="Tonnage"
            value={Math.round(weekTonnage / 100) / 10}
            unit="t"
            tone={weekTonnage >= previousTonnage ? "success" : "warning"}
            hint={
              previousTonnage > 0
                ? `${weekTonnage >= previousTonnage ? "+" : ""}${Math.round(((weekTonnage - previousTonnage) / previousTonnage) * 100)} %`
                : "première semaine"
            }
          />
        </Card>
        <Card>
          <Stat
            label="Poids"
            value={change ? `${change.deltaKg > 0 ? "+" : ""}${change.deltaKg.toFixed(1)}` : "—"}
            unit="kg"
            tone={change?.verdict === "dans_la_cible" ? "success" : change ? "warning" : "neutral"}
          />
        </Card>
        <Card>
          <Stat
            label="Sommeil"
            value={sleepAverage ? sleepAverage.toFixed(1) : "—"}
            unit="h"
            tone={sleepAverage && sleepAverage < 6.5 ? "warning" : "neutral"}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle hint="Sur les exercices déjà travaillés au moins deux fois.">
            Ce qui progresse
          </CardTitle>
          {progressing.length === 0 ? (
            <p className="text-sm text-faint">Pas encore assez d'historique pour conclure.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {progressing.slice(0, 6).map(({ exercise, points }) => {
                const valid = points.filter((p) => p.estimatedOneRepMax !== null);
                const gain =
                  valid[valid.length - 1].estimatedOneRepMax! - valid[0].estimatedOneRepMax!;
                return (
                  <li key={exercise.exerciseId} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate text-muted">{exercise.name}</span>
                    <span className="shrink-0 tabular-nums text-success">
                      +{gain.toFixed(1)} kg*
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint="Trois séances sans progresser déclenchent le signalement.">
            Ce qui stagne
          </CardTitle>
          {stagnating.length === 0 ? (
            <p className="text-sm text-success">Rien ne stagne.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {stagnating.map(({ exercise, stagnation }) => (
                <li key={exercise.exerciseId} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate text-muted">{exercise.name}</span>
                  <span className="shrink-0 tabular-nums text-warning">
                    {stagnation.sessionsWithoutProgress} séances
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle hint="Cette semaine">Séances</CardTitle>
          <BarList
            items={[
              { label: "Faites", value: stats.done, tone: "success" },
              { label: "Partielles", value: stats.partial, tone: "warning" },
              { label: "Manquées", value: stats.missed, tone: "danger" },
              { label: "Déplacées", value: stats.moved, tone: "accent" },
            ]}
          />
          {patterns.insight ? (
            <p className="mt-3 text-sm text-warning">{patterns.insight}</p>
          ) : null}
          {patterns.reasonCounts.length > 0 ? (
            <p className="mt-2 text-xs text-faint">
              Motif dominant : {MISSED_REASON_LABELS[patterns.reasonCounts[0].reason]}
            </p>
          ) : null}
        </Card>

        <Card>
          <CardTitle hint="Ce qu'il faut regarder avant de changer quoi que ce soit.">
            Points de vigilance
          </CardTitle>
          <ul className="space-y-2 text-sm text-muted">
            <li className="flex items-start gap-2">
              <Badge tone="neutral">saisie</Badge>
              <span>{logging.message}</span>
            </li>
            {change ? (
              <li className="flex items-start gap-2">
                <Badge tone={change.verdict === "dans_la_cible" ? "success" : "warning"}>poids</Badge>
                <span>{change.message}</span>
              </li>
            ) : null}
            <li className="flex items-start gap-2">
              <Badge tone={nutrition.oilTablespoons > 3 ? "warning" : "neutral"}>huile</Badge>
              <span>
                {nutrition.oilTablespoons} c.à.s aujourd'hui. C'est le levier le plus rentable de la diète.
              </span>
            </li>
            {sleepAverage && sleepAverage < 6.5 ? (
              <li className="flex items-start gap-2">
                <Badge tone="warning">sommeil</Badge>
                <span>
                  {sleepAverage.toFixed(1)} h de moyenne. Coupe une séance de volume avant de couper une nuit.
                </span>
              </li>
            ) : null}
          </ul>
          <p className="mt-3 text-xs text-faint">* 1RM estimé, pas une charge réellement soulevée.</p>
        </Card>
      </div>
    </>
  );
}
