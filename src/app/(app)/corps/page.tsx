import { Alert, Card, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { MeasurementForm, WeightForm } from "@/components/entry-forms";
import { getBodyweightEntries, getMeasurements, getTrackedExercises } from "@/lib/queries";
import { movingAverage, recompositionVerdict, trendOf, weeklyChange } from "@/lib/domain/body";
import { formatDate, today } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Suivi corporel.
 *
 * Le programme est explicite : « le poids seul ment en recomposition ». La page
 * met donc en avant la moyenne mobile et le verdict croisé, pas la pesée du jour.
 */
export default async function CorpsPage() {
  const [entries, measurements, tracked] = await Promise.all([
    getBodyweightEntries(),
    getMeasurements(),
    getTrackedExercises(),
  ]);

  const todayIso = today();
  const averages = movingAverage(entries);
  const change = weeklyChange(averages);
  const latestAverage = averages[averages.length - 1] ?? null;
  const todayEntry = entries.find((entry) => entry.date === todayIso) ?? null;

  const waistSeries = measurements.filter((m) => m.kind === "taille");
  const latestMeasurements = Object.fromEntries(
    (["taille", "bras", "cuisse", "poitrine"] as const).map((kind) => {
      const forKind = measurements.filter((m) => m.kind === kind);
      return [kind, forKind[forKind.length - 1]?.valueCm];
    }),
  );

  // Verdict croisé : poids lissé, tour de taille, et charges.
  const weightTrend = trendOf(averages.slice(-21).map((a) => a.weightKg), 0.8);
  const waistTrend = trendOf(waistSeries.slice(-3).map((m) => m.valueCm), 0.8);
  const strengthTrend = trendOf(
    tracked
      .map((exercise) => Number(exercise.bestWeight))
      .filter((value) => Number.isFinite(value))
      .slice(-6),
    1,
  );

  const verdict = recompositionVerdict({ weightTrend, waistTrend, strengthTrend });

  return (
    <>
      <PageHeader
        title="Corps"
        subtitle="Pèse-toi 3 fois par semaine à jeun. Seule la moyenne compte : le poids du jour varie de 1 à 2 kg."
      />

      <Card className="mb-4">
        <Alert
          tone={
            verdict.verdict === "recomposition"
              ? "success"
              : verdict.verdict === "sous_alimentation"
                ? "danger"
                : verdict.verdict === "donnees_insuffisantes"
                  ? "info"
                  : "warning"
          }
          title={verdict.headline}
        >
          {verdict.detail}
        </Alert>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <Stat
            label="Moyenne 7 j"
            value={latestAverage ? latestAverage.weightKg.toFixed(1) : "—"}
            unit="kg"
          />
        </Card>
        <Card>
          <Stat
            label="Variation / semaine"
            value={change ? `${change.deltaPercent > 0 ? "+" : ""}${change.deltaPercent.toFixed(2)}` : "—"}
            unit="%"
            tone={
              change?.verdict === "dans_la_cible"
                ? "success"
                : change?.verdict === "trop_rapide"
                  ? "danger"
                  : change
                    ? "warning"
                    : "neutral"
            }
          />
        </Card>
        <Card>
          <Stat label="Tour de taille" value={latestMeasurements.taille ?? "—"} unit="cm" />
        </Card>
        <Card>
          <Stat label="Pesées" value={entries.length} hint="depuis le début" />
        </Card>
      </div>

      {change ? (
        <Card className="mb-4">
          <p className="text-sm text-muted">{change.message}</p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle hint="Aujourd'hui">Pesée</CardTitle>
          <WeightForm date={todayIso} initial={todayEntry?.weightKg ?? null} />
        </Card>

        <Card>
          <CardTitle hint="À relever aux 4 contrôles : 19 sept, 17 oct, 14 nov, 19 déc">
            Mensurations
          </CardTitle>
          <MeasurementForm date={todayIso} initial={latestMeasurements} />
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle hint="Moyenne mobile sur 7 jours, pas les pesées brutes.">
          Évolution du poids
        </CardTitle>
        {averages.length < 2 ? (
          <EmptyState
            title="Pas encore assez de pesées"
            detail="Trois pesées à jeun par semaine suffisent à faire apparaître la tendance."
          />
        ) : (
          <LineChart
            series={averages.map((point) => ({
              label: formatDate(point.date, { short: true }),
              value: point.weightKg,
            }))}
            unit="kg — moyenne mobile 7 jours"
          />
        )}
      </Card>

      {waistSeries.length >= 2 ? (
        <Card className="mt-4">
          <CardTitle hint="En recomposition, c'est lui qui parle quand le poids se tait.">
            Tour de taille
          </CardTitle>
          <LineChart
            series={waistSeries.map((point) => ({
              label: formatDate(point.date, { short: true }),
              value: point.valueCm,
            }))}
            unit="cm"
          />
        </Card>
      ) : null}
    </>
  );
}
