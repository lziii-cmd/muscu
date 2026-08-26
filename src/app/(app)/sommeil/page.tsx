import { Alert, Card, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";
import { LineChart } from "@/components/charts";
import { PainForm, SleepForm } from "@/components/entry-forms";
import { getExerciseHistory, getPainEntries, getSleepEntries, getTrackedExercises } from "@/lib/queries";
import { evaluateAlerts } from "@/lib/domain/alerts";
import { estimatedOneRepMax } from "@/lib/domain/progression";
import { addDays, formatDate, today } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Sommeil et récupération.
 *
 * Le programme le dit sans détour : « avec la calisthénie au réveil, le sommeil
 * est ton facteur limitant, pas le programme ». C'est donc ici que se lisent les
 * signaux d'alerte.
 */
export default async function SommeilPage() {
  const date = today();
  const since = addDays(date, -60);

  const [sleep, pains, tracked] = await Promise.all([
    getSleepEntries(since),
    getPainEntries(since),
    getTrackedExercises(),
  ]);

  // Performance récente sur l'exercice le plus travaillé, pour le signal
  // « baisse sur deux séances consécutives ».
  const mainExercise = tracked[0];
  const history = mainExercise ? await getExerciseHistory(mainExercise.exerciseId) : [];
  const performance = history.map((entry) => ({
    date: entry.date,
    estimatedOneRepMax:
      entry.weightKg && entry.reps ? estimatedOneRepMax(entry.weightKg, entry.reps) : null,
  }));

  const alerts = evaluateAlerts({ today: date, pains, sleep, performance });

  const withDuration = sleep.filter((entry) => entry.durationMinutes !== null);
  const averageHours =
    withDuration.length > 0
      ? withDuration.reduce((sum, entry) => sum + entry.durationMinutes!, 0) / withDuration.length / 60
      : null;

  const withHr = sleep.filter((entry) => entry.restingHr !== null);
  const todayEntry = sleep.find((entry) => entry.date === date) ?? null;

  return (
    <>
      <PageHeader
        title="Sommeil & récupération"
        subtitle="Le facteur limitant du programme. Si la semaine déborde, coupe une séance de volume — jamais une nuit."
      />

      {alerts.length > 0 ? (
        <div className="mb-4 space-y-3">
          {alerts.map((alert) => (
            <Alert
              key={alert.kind}
              tone={alert.severity === "danger" ? "danger" : "warning"}
              title={alert.title}
            >
              <p>{alert.message}</p>
              <p className="mt-1 font-medium text-text">{alert.action}</p>
            </Alert>
          ))}
        </div>
      ) : (
        <Card className="mb-4">
          <Alert tone="success" title="Aucun signal d'alerte">
            Douleurs, performance, sommeil et fréquence cardiaque au repos sont dans les clous.
          </Alert>
        </Card>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <Stat
            label="Moyenne"
            value={averageHours ? averageHours.toFixed(1) : "—"}
            unit="h"
            tone={averageHours && averageHours < 6.5 ? "warning" : "neutral"}
            hint="7 h visées"
          />
        </Card>
        <Card>
          <Stat label="Nuits notées" value={sleep.length} hint="60 derniers jours" />
        </Card>
        <Card>
          <Stat
            label="FC repos"
            value={withHr.length ? withHr[withHr.length - 1].restingHr : "—"}
            unit="bpm"
          />
        </Card>
        <Card>
          <Stat
            label="Douleurs signalées"
            value={pains.length}
            tone={pains.some((p) => p.isJoint) ? "warning" : "neutral"}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle hint={formatDate(date, { withWeekday: true })}>Nuit dernière</CardTitle>
          <SleepForm date={date} initial={todayEntry} />
        </Card>

        <Card>
          <CardTitle hint="Une douleur articulaire qui dure plus de 48 h déclenche une alerte.">
            Signaler une douleur
          </CardTitle>
          <PainForm date={date} />

          {pains.length > 0 ? (
            <ul className="mt-4 divide-y divide-border text-sm">
              {[...pains]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 5)
                .map((pain, index) => (
                  <li key={`${pain.date}-${index}`} className="flex justify-between py-2">
                    <span className="text-muted">
                      {pain.area}
                      {pain.isJoint ? " (articulaire)" : ""}
                    </span>
                    <span className="tabular-nums text-faint">{formatDate(pain.date, { short: true })}</span>
                  </li>
                ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle hint="Durée par nuit, en heures.">Évolution du sommeil</CardTitle>
        {withDuration.length < 2 ? (
          <EmptyState
            title="Pas encore assez de nuits notées"
            detail="Deux nuits suffisent à démarrer la courbe."
          />
        ) : (
          <LineChart
            series={withDuration.map((entry) => ({
              label: formatDate(entry.date, { short: true }),
              value: Math.round((entry.durationMinutes! / 60) * 10) / 10,
            }))}
            unit="heures par nuit"
            band={{ from: 7, to: 8, label: "cible 7–8 h" }}
          />
        )}
      </Card>
    </>
  );
}
