import { Badge, Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { LadderCard } from "@/components/ladder-card";
import { getLadders, getStrengthTests, getTargets } from "@/lib/queries";
import { pullupTargetStatus, setFormatForMax, shouldRetestMax } from "@/lib/domain/calisthenics";

import { formatDate, today } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Calisthénie : les sept échelles, le format de travail du jour, et l'écart aux
 * objectifs jalonnés.
 *
 * En calisthénie la force vient de la difficulté du levier, pas de la charge :
 * la page est donc construite autour des niveaux, pas des kilos.
 */
export default async function CalisthéniePage() {
  const [ladders, tests, allTargets] = await Promise.all([
    getLadders(),
    getStrengthTests(),
    getTargets(),
  ]);

  // Le document fixe un objectif par mouvement et par jalon ; la traction est
  // celle qui pilote le programme.
  const pullupTargets = allTargets
    .filter((target) => target.slug.startsWith("tractions"))
    .filter((target) => target.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const date = today();

  const pullupTests = tests
    .filter((test) => test.metric === "tractions" && test.value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const currentMax = pullupTests.length > 0 ? Math.round(pullupTests[pullupTests.length - 1].value!) : 2;
  const lastTestDate = pullupTests.length > 0 ? pullupTests[pullupTests.length - 1].date : null;

  const format = setFormatForMax(currentMax);
  const retest = shouldRetestMax(lastTestDate, date);

  const nextTarget =
    pullupTargets.find((target) => target.date >= date) ?? pullupTargets[pullupTargets.length - 1];
  const targetStatus = pullupTargetStatus(currentMax, nextTarget?.value ?? 0);

  return (
    <>
      <PageHeader
        title="Calisthénie"
        subtitle="La force vient du levier, pas de la charge. Chaque échelle se gravit sur un critère : réussir proprement, deux séances de suite."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <Stat label="Max tractions" value={currentMax} hint={lastTestDate ? `testé le ${formatDate(lastTestDate)}` : "valeur de départ"} />
        </Card>
        <Card>
          <Stat label="Format du jour" value={`${format.sets} × ${format.repsPerSet}`} hint="règle du max − 1" />
        </Card>
        <Card>
          <Stat
            label={nextTarget ? `Objectif ${formatDate(nextTarget.date, { short: true })}` : "Objectif"}
            value={nextTarget?.value ?? "—"}
            tone={targetStatus.onTrack ? "success" : "warning"}
            hint={targetStatus.onTrack ? "atteint" : `${targetStatus.gap} d'écart`}
          />
        </Card>
        <Card>
          <Stat
            label="Retest du max"
            value={retest ? "Aujourd'hui" : "Pas maintenant"}
            tone={retest ? "accent" : "neutral"}
            hint="un lundi sur deux"
          />
        </Card>
      </div>

      <Card className="mb-4">
        <CardTitle hint="Ne fais jamais plus de (ton max − 1) reps par série.">
          Ce que tu fais aujourd'hui sur les tractions
        </CardTitle>
        <p className="text-sm text-muted">{format.message}</p>
        <p className="mt-2 text-sm text-faint">
          Une série à l'échec te laisse cuit pour la suivante : tu accumules des répétitions
          dégradées. Six séries de 1 rep parfaite te donnent 6 reps propres — et c'est la répétition
          du geste frais qui construit la force nerveuse.
        </p>
        {format.shouldAddWeight ? (
          <p className="mt-2">
            <Badge tone="success">Prêt pour le lest (+5 kg)</Badge>
          </p>
        ) : null}
      </Card>

      <Card className="mb-4">
        <CardTitle hint="Repères du programme">Objectifs jalonnés</CardTitle>
        <ul className="divide-y divide-border text-sm">
          {allTargets
            .filter((target) => target.slug.startsWith("tractions"))
            .map((target) => {
            const passed = target.date < date;
            const achieved = pullupTests.some(
              (test) => test.date === target.date && (test.value ?? 0) >= (target.value ?? 0),
            );
            return (
              <li key={target.date} className="flex items-center justify-between py-2">
                <span className="text-muted">{formatDate(target.date, { withWeekday: true })}</span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{target.value ?? "--"} tractions</span>
                  {passed ? (
                    <Badge tone={achieved ? "success" : "danger"}>{achieved ? "atteint" : "manqué"}</Badge>
                  ) : (
                    <Badge>à venir</Badge>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <h2 className="mb-3 text-sm font-semibold tracking-wide text-muted uppercase">
        Les sept échelles
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {ladders.map((ladder) => (
          <LadderCard key={ladder.id} ladder={ladder} />
        ))}
      </div>

      <Card className="mt-4">
        <CardTitle>Les cinq erreurs qui coûtent le plus cher</CardTitle>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>
            Passer un niveau trop tôt. Le critère, c'est <strong className="text-text">deux séances
            propres</strong>, pas « j'y arrive une fois en forçant ».
          </li>
          <li>Chercher la fatigue le matin. Objectif du matin : technique et force, pas sueur.</li>
          <li>Travailler le front lever bras pliés. Ça n'entraîne rien et ça abîme les coudes.</li>
          <li>
            Sauter l'échauffement des poignets. L'appui en ATR sur poignets froids est la première
            cause de blessure.
          </li>
          <li>Cambrer en ATR pour tenir plus longtemps. 20 s aligné valent mieux que 45 s en banane.</li>
        </ol>
        <p className="mt-3 text-sm text-faint">
          Réflexe à prendre : filme-toi de profil une fois par semaine. Sur l'ATR et le front lever,
          la sensation ment complètement.
        </p>
      </Card>
    </>
  );
}
