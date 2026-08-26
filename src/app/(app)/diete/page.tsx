import { Alert, Badge, Card, CardTitle, PageHeader, ProgressBar, Stat } from "@/components/ui";
import { StepCounter } from "@/components/entry-forms";
import { MealTemplate } from "@/components/meal-template";
import {
  getBodyweightEntries,
  getDayNutrition,
  getFoods,
  getSettings,
} from "@/lib/queries";
import { movingAverage } from "@/lib/domain/body";
import { deficitTarget, oilStatus, proteinProgress, proteinTarget, waterStatus } from "@/lib/domain/nutrition";
import { today } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Diète.
 *
 * L'ordre des blocs suit la hiérarchie du document : protéines d'abord, huile
 * ensuite, riz enfin. L'huile a son compteur dédié parce qu'elle est décrite
 * comme « la source n°1 de calories invisibles ».
 */
export default async function DietePage() {
  const date = today();

  const [nutrition, weights, foods, settings] = await Promise.all([
    getDayNutrition(date),
    getBodyweightEntries(),
    getFoods(),
    getSettings(),
  ]);

  const averages = movingAverage(weights);
  const bodyweight = averages[averages.length - 1]?.weightKg ?? null;

  const target = proteinTarget(
    bodyweight ?? 75,
    settings ? Number(settings.proteinPerKgLow) : 1.8,
    settings ? Number(settings.proteinPerKgHigh) : 2.2,
  );
  const protein = proteinProgress(nutrition.proteinG, target);
  const oil = oilStatus(nutrition.oilTablespoons);
  const water = waterStatus(
    nutrition.waterLiters,
    settings ? Number(settings.waterTargetLiters) : 3.5,
  );
  const deficit = deficitTarget();

  return (
    <>
      <PageHeader
        title="Diète"
        subtitle={
          bodyweight
            ? `Objectifs calculés sur ${bodyweight.toFixed(1)} kg (moyenne 7 jours).`
            : "Note une pesée pour calibrer les objectifs sur ton poids réel."
        }
      />

      <Card className="mb-4">
        <CardTitle hint="Levier n°1 — le seul chiffre à ne jamais négliger.">Protéines</CardTitle>

        <div className="mb-3 flex items-end justify-between gap-4">
          <Stat
            label="Aujourd'hui"
            value={nutrition.proteinG}
            unit="g"
            tone={protein.status === "atteint" ? "success" : protein.status === "proche" ? "warning" : "danger"}
          />
          <div className="text-right text-sm text-muted">
            <div className="tabular-nums">
              {target.lowG} – {target.highG} g
            </div>
            <div className="text-xs text-faint">{target.intakes} prises d'environ {target.perIntakeG} g</div>
          </div>
        </div>

        <ProgressBar
          value={nutrition.proteinG}
          max={target.lowG}
          tone={protein.status === "atteint" ? "success" : "accent"}
        />

        <p className="mt-2 text-sm text-muted">{protein.message}</p>
      </Card>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle hint="1 c.à.s = 15 ml = 135 kcal">Huile</CardTitle>
          <StepCounter
            kind="oil.upsert"
            date={date}
            initial={nutrition.oilTablespoons}
            step={0.5}
            unit="c.à.s"
            label="Cuillères aujourd'hui"
            tone={oil.overBudget ? "warning" : "accent"}
          />
          <p className="mt-2 text-xs text-faint">{oil.message}</p>
        </Card>

        <Card>
          <CardTitle hint="Un poing fermé = 150–200 g cuit">Riz</CardTitle>
          <StepCounter
            kind="rice.upsert"
            date={date}
            initial={nutrition.riceFists}
            step={0.5}
            unit="poings"
            label="Portions aujourd'hui"
          />
          <p className="mt-2 text-xs text-faint">
            Le riz n'est pas le problème. La montagne de riz l'est.
          </p>
        </Card>

        <Card>
          <CardTitle hint="3 à 4 L par jour, plus par forte chaleur">Eau</CardTitle>
          <StepCounter
            kind="water.upsert"
            date={date}
            initial={nutrition.waterLiters}
            step={0.25}
            unit="L"
            label="Bu aujourd'hui"
            max={10}
          />
          <p className="mt-2 text-xs text-faint">{water.message}</p>
        </Card>
      </div>

      <Card className="mb-4">
        <CardTitle hint="Journée type d'un jour de salle. Un tap valide un repas complet, à ajuster ensuite.">
          Repas de la journée
        </CardTitle>
        <MealTemplate date={date} foods={foods} logged={nutrition.meals} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle>Règles qui tiennent tout</CardTitle>
          <ul className="space-y-2 text-sm text-muted">
            <li>
              <strong className="text-text">Déficit léger.</strong> {deficit.message}
            </li>
            <li>
              <strong className="text-text">Le repas de 20h est obligatoire.</strong> Complet, glucides
              inclus, 2 à 3 h avant la séance de 23h. Arriver à jeun ne fonctionne pas.
            </li>
            <li>
              <strong className="text-text">La règle de minuit.</strong> Après la séance : léger et
              protéiné. Un gros repas à cette heure dégrade le sommeil.
            </li>
            <li>
              <strong className="text-text">Aucun stimulant après 19h.</strong> La caféine a 5 à 6 h de
              demi-vie et ta séance est à 23h.
            </li>
          </ul>
        </Card>

        <Card>
          <CardTitle hint="Classement par rapport qualité/prix au marché local.">
            Meilleures protéines par franc
          </CardTitle>
          <ul className="divide-y divide-border text-sm">
            {foods
              .filter((food) => food.priceFcfa !== null)
              .sort((a, b) => b.proteinG / (b.priceFcfa || 1) - a.proteinG / (a.priceFcfa || 1))
              .slice(0, 8)
              .map((food) => (
                <li key={food.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{food.name}</div>
                    <div className="text-xs text-faint">{food.portionLabel}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="success">{food.proteinG} g</Badge>
                    <span className="text-xs tabular-nums text-faint">~{food.priceFcfa} F</span>
                  </div>
                </li>
              ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <Alert tone="info" title="À éviter ou limiter fortement">
          Sodas et jus sucrés (bissap et bouye industriels), pain blanc en grande quantité, fataya et
          beignets frits, café Touba très sucré. Boire ses calories est l'erreur la plus rentable à
          corriger : un litre de jus, c'est 400 kcal sans aucune satiété.
        </Alert>
      </Card>
    </>
  );
}
