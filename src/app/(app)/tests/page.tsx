import { Badge, Card, CardTitle, PageHeader } from "@/components/ui";
import { TestMetricInput } from "@/components/entry-forms";
import {
  getCheckpoints,
  getMeasurements,
  getStrengthTests,
  getTargets,
  getTestMetrics,
} from "@/lib/queries";
import { cn, formatDate, today } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Tests de force et contrôles physiques.
 *
 * Les dates de contrôle viennent du programme du compte : elles ne sont pas
 * les mêmes d'une personne à l'autre.
 * Ce sont ces tableaux qui disent si tu gagnes en force — la sensation ment,
 * les chiffres non.
 */
export default async function TestsPage() {
  const [tests, checkpoints, measurements, metrics, targets] = await Promise.all([
    getStrengthTests(),
    getCheckpoints(),
    getMeasurements(),
    getTestMetrics(),
    getTargets(),
  ]);

  /*
   * Les dates viennent des contrôles importés pour le compte, pas d'une
   * constante : la précédente portait le calendrier du premier programme, et
   * aurait annoncé un contrôle le 19 septembre à un programme qui le prévoit
   * le 10 octobre.
   */
  const CHECKPOINT_DATES = checkpoints.map((checkpoint) => checkpoint.date);
  const date = today();
  // Sans contrôle prévu, la saisie d'un test se fait au jour même.
  const nextDate = CHECKPOINT_DATES.find((d) => d >= date) ?? CHECKPOINT_DATES.at(-1) ?? date;

  const valueFor = (testDate: string, metric: string) =>
    tests.find((test) => test.date === testDate && test.metric === metric)?.value ?? null;

  return (
    <>
      <PageHeader
        title="Tests & contrôles"
        subtitle="Le test remplace la séance du samedi. Échauffement complet, puis une seule tentative maximale par ligne."
      />

      <Card className="mb-4">
        <CardTitle
          hint="Les jalons du programme"
          action={
            CHECKPOINT_DATES.length > 0 ? (
              <Badge tone="accent">prochain : {formatDate(nextDate)}</Badge>
            ) : null
          }
        >
          Calendrier
        </CardTitle>
        <ul className="grid gap-2 sm:grid-cols-4">
          {CHECKPOINT_DATES.map((checkpointDate) => {
            const done = tests.some((test) => test.date === checkpointDate);
            const past = checkpointDate < date;
            return (
              <li
                key={checkpointDate}
                className={cn(
                  "rounded-xl border px-3 py-2 text-sm",
                  checkpointDate === nextDate
                    ? "border-accent/50 bg-accent/5"
                    : "border-border",
                )}
              >
                <div className="font-medium">{formatDate(checkpointDate)}</div>
                <div className="mt-0.5 text-xs">
                  {done ? (
                    <span className="text-success">relevé</span>
                  ) : past ? (
                    <span className="text-danger">non relevé</span>
                  ) : (
                    <span className="text-faint">à venir</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="mb-4">
        <CardTitle hint={`Saisie pour le ${formatDate(nextDate)}`}>Test de force</CardTitle>
        <div className="divide-y divide-border">
          {metrics.map((metric) => (
            <TestMetricInput
              key={metric.slug}
              date={nextDate}
              metric={metric.slug}
              label={metric.label}
              unit={metric.unit as "reps" | "seconds"}
              initial={valueFor(nextDate, metric.slug)}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          Objectifs au {formatDate(nextDate)} :{" "}
          {targets
            .filter((target) => target.date === nextDate && target.value !== null)
            .map((target) => `${target.movement} ${target.value}${target.unit === "seconds" ? " s" : ""}`)
            .join(" · ") || "—"}
        </p>
      </Card>

      <Card className="mb-4">
        <CardTitle hint="Une colonne par jalon. C'est ce tableau qui dit si tu progresses.">
          Comparaison des quatre tests
        </CardTitle>
        <div className="scroll-x">
          <table className="w-full min-w-[460px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="py-2 pr-3 font-medium">Métrique</th>
                {CHECKPOINT_DATES.map((checkpointDate) => (
                  <th key={checkpointDate} className="px-2 py-2 text-center font-medium">
                    {formatDate(checkpointDate, { short: true })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const values = CHECKPOINT_DATES.map((d) => valueFor(d, metric.slug));
                const best = Math.max(...values.filter((v): v is number => v !== null), 0);
                return (
                  <tr key={metric.slug} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-muted">{metric.label}</td>
                    {values.map((value, index) => (
                      <td
                        key={index}
                        className={cn(
                          "px-2 py-2 text-center tabular-nums",
                          value !== null && value === best && best > 0 ? "font-semibold text-success" : "text-muted",
                        )}
                      >
                        {value ?? "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle hint="Photos face / profil / dos, même lumière, même heure.">
          Contrôles physiques
        </CardTitle>
        <div className="scroll-x">
          <table className="w-full min-w-[460px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-faint">
                <th className="py-2 pr-3 font-medium">Mesure</th>
                {CHECKPOINT_DATES.map((checkpointDate) => (
                  <th key={checkpointDate} className="px-2 py-2 text-center font-medium">
                    {formatDate(checkpointDate, { short: true })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["taille", "bras", "cuisse", "poitrine"] as const).map((kind) => (
                <tr key={kind} className="border-b border-border/60">
                  <td className="py-2 pr-3 text-muted capitalize">{kind}</td>
                  {CHECKPOINT_DATES.map((checkpointDate) => {
                    const value = measurements.find(
                      (m) => m.date === checkpointDate && m.kind === kind,
                    )?.valueCm;
                    return (
                      <td key={checkpointDate} className="px-2 py-2 text-center tabular-nums text-muted">
                        {value ?? "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-faint">
          Les mensurations se saisissent depuis la page <strong className="text-muted">Corps</strong>,
          à la date du contrôle. Le poids seul ment en recomposition : c'est le croisement des trois
          qui compte.
        </p>
        {checkpoints.length > 0 ? (
          <p className="mt-2 text-xs text-faint">
            {checkpoints.filter((c) => c.completed).length}/{checkpoints.length} contrôles marqués faits.
          </p>
        ) : null}
      </Card>
    </>
  );
}
