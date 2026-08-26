import { Badge, Card, CardTitle, EmptyState, PageHeader } from "@/components/ui";
import { getExerciseGuides } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Comment faire" };

const GROUP_LABELS: Record<string, string> = {
  push: "Poussée",
  pull: "Tirage",
  legs: "Jambes",
  core: "Gainage",
  mobilite: "Mobilité et souplesse",
  bras_tendus: "Bras tendus",
  prise: "Prise",
  autre: "Autre",
};

/*
 * L'ordre est celui d'une séance : on pousse, on tire, on travaille les jambes,
 * puis le gainage et la mobilité. Le tri alphabétique mettrait « ATR » avant
 * « Squat » sans que cela veuille rien dire.
 */
const GROUP_ORDER = ["push", "pull", "legs", "core", "bras_tendus", "prise", "mobilite", "autre"];

const EQUIPMENT_LABELS: Record<string, string> = {
  haltere: "haltère",
  poids_du_corps: "poids du corps",
  barre: "barre",
  machine: "machine",
  poulie: "poulie",
};

/**
 * Un étirement n'a pas de « repère de réussite » mais une sensation attendue.
 * Le document la formule ainsi, autant garder son mot.
 */
function noteLabel(note: string): { label: string; text: string } {
  const felt = note.match(/^À sentir\s*:\s*(.*)$/);
  return felt ? { label: "À sentir", text: felt[1] } : { label: "Repère", text: note };
}

/**
 * Comment faire chaque exercice.
 *
 * Les fiches sont propres au compte : elles ne listent que les mouvements de
 * son programme, et décrivent le matériel dont la personne dispose réellement.
 * Le même hip thrust se fait dos à un banc en salle et dos au canapé à la
 * maison — une fiche partagée serait fausse pour l'un des deux.
 */
export default async function GuidePage() {
  const guides = await getExerciseGuides();

  if (guides.length === 0) {
    return (
      <>
        <PageHeader title="Comment faire" subtitle="Les fiches d'exécution de ton programme." />
        <EmptyState
          title="Aucune fiche pour ce compte"
          detail="Les fiches arrivent avec le programme. Une fois celui-ci importé, chaque exercice est expliqué ici."
        />
      </>
    );
  }

  const groups = new Map<string, typeof guides>();
  for (const guide of guides) {
    const key = guide.muscleGroup ?? "autre";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(guide);
  }

  const ordered = GROUP_ORDER.filter((key) => groups.has(key)).concat(
    [...groups.keys()].filter((key) => !GROUP_ORDER.includes(key)),
  );

  return (
    <>
      <PageHeader
        title="Comment faire"
        subtitle={`Les ${guides.length} exercices de ton programme, un par un : placement, mouvement, et l'erreur qui rend l'exercice inutile.`}
      />

      <div className="space-y-4">
        {ordered.map((key) => {
          const list = groups.get(key)!;
          return (
            <Card key={key}>
              <CardTitle hint={`${list.length} exercice${list.length > 1 ? "s" : ""}`}>
                {GROUP_LABELS[key] ?? key}
              </CardTitle>

              <ul className="divide-y divide-border">
                {list.map((guide) => (
                  <li key={guide.exerciseId} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h3 className="font-medium">{guide.name}</h3>
                      {guide.equipment && EQUIPMENT_LABELS[guide.equipment] ? (
                        <Badge>{EQUIPMENT_LABELS[guide.equipment]}</Badge>
                      ) : null}
                    </div>

                    <dl className="mt-1.5 space-y-1 text-sm">
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

                      {guide.note
                        ? (() => {
                            const { label, text } = noteLabel(guide.note);
                            return (
                              <div>
                                <dt className="inline text-accent/80">{label} — </dt>
                                <dd className="inline text-muted">{text}</dd>
                              </div>
                            );
                          })()
                        : null}
                    </dl>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
