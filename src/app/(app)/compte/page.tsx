import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PasswordForm } from "@/components/account/password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { LogoutButton } from "@/components/account/logout-button";
import { WeightForm } from "@/components/entry-forms";
import { Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth/current-user";
import { getBodyweightEntries, getMeasurements, getProgramBounds } from "@/lib/queries";
import { ageOn, bmi, waistToHeight } from "@/lib/domain/body";
import { formatDate, today } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Profil" };

/**
 * Profil.
 *
 * Rassemble ce qui décrit la personne plutôt que sa journée : identité,
 * stature, poids visé, cibles de diète, mot de passe, déconnexion. Les
 * repères affichés en haut (IMC, rapport tour de taille / stature) sont
 * calculés, jamais stockés — ils changent dès qu'une pesée arrive.
 */
export default async function ProfilPage() {
  const user = await requireUser();
  const [weights, measurements, bounds] = await Promise.all([
    getBodyweightEntries(),
    getMeasurements(),
    getProgramBounds(),
  ]);

  const todayIso = today();
  const lastWeight = weights.at(-1) ?? null;
  const todayWeight = weights.find((entry) => entry.date === todayIso)?.weightKg ?? null;

  const waistEntries = measurements.filter((row) => row.kind === "taille");
  const lastWaist = waistEntries.at(-1) ?? null;

  const indice = lastWeight && user.heightCm ? bmi(lastWeight.weightKg, user.heightCm) : null;
  const ratio = lastWaist && user.heightCm ? waistToHeight(lastWaist.valueCm, user.heightCm) : null;
  const age = user.birthDate ? ageOn(user.birthDate, todayIso) : null;

  const toGo =
    lastWeight && user.targetWeightKg !== null
      ? Math.round((user.targetWeightKg - lastWeight.weightKg) * 10) / 10
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={user.displayName}
        subtitle={`${user.username}${user.role === "admin" ? " · administrateur" : ""}`}
      />

      {user.usesDefaultPassword ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          Ce compte utilise encore son mot de passe d&apos;origine. L&apos;application est
          accessible depuis Internet : change-le plus bas.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <Stat
            label="Poids"
            value={lastWeight ? lastWeight.weightKg.toFixed(1).replace(".", ",") : "—"}
            unit="kg"
            hint={lastWeight ? formatDate(lastWeight.date) : "aucune pesée"}
          />
        </Card>
        <Card>
          <Stat
            label="Taille"
            value={user.heightCm ?? "—"}
            unit={user.heightCm ? "cm" : undefined}
            hint={age !== null ? `${age} ans` : "à renseigner"}
          />
        </Card>
        <Card>
          <Stat
            label="IMC"
            value={indice === null ? "—" : String(indice).replace(".", ",")}
            hint={indice === null ? "taille et pesée requises" : "muscle et gras confondus"}
          />
        </Card>
        <Card>
          <Stat
            label={toGo === null ? "Tour de taille" : "Reste à faire"}
            value={
              toGo !== null
                ? `${toGo > 0 ? "+" : ""}${String(toGo).replace(".", ",")}`
                : lastWaist
                  ? lastWaist.valueCm
                  : "—"
            }
            unit={toGo !== null || lastWaist ? "kg" : undefined}
            hint={
              toGo !== null
                ? `objectif ${String(user.targetWeightKg).replace(".", ",")} kg`
                : ratio !== null
                  ? `rapport ${String(ratio).replace(".", ",")} · repère < 0,5`
                  : "aucune mensuration"
            }
          />
        </Card>
      </div>

      <Card>
        <CardTitle hint="La pesée du jour part dans le journal, pas dans le profil : c'est une mesure, pas une caractéristique.">
          Pesée du jour
        </CardTitle>
        <WeightForm date={todayIso} initial={todayWeight} />
      </Card>

      <Card>
        <CardTitle>Fiche</CardTitle>
        <ProfileForm
          initial={{
            displayName: user.displayName,
            heightCm: user.heightCm,
            birthDate: user.birthDate,
            targetWeightKg: user.targetWeightKg,
            proteinPerKgLow: user.proteinPerKgLow,
            proteinPerKgHigh: user.proteinPerKgHigh,
            waterTargetLiters: user.waterTargetLiters,
          }}
        />
      </Card>

      <Card>
        <CardTitle>Programme</CardTitle>
        {bounds ? (
          <p className="text-sm text-muted">
            {formatDate(bounds.startDate)} → {formatDate(bounds.endDate)} ·{" "}
            <span className="text-text">{bounds.weeks} semaines</span>
          </p>
        ) : (
          <p className="text-sm text-muted">
            Aucun programme importé pour ce compte. Le reste de l&apos;application fonctionne :
            diète, poids, sommeil, et les entraînements libres depuis l&apos;écran du jour.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle hint="8 caractères minimum. L'ancien est redemandé.">Mot de passe</CardTitle>
        <PasswordForm />
      </Card>

      {user.role === "admin" ? (
        <Link
          href="/admin"
          className="tap flex items-center justify-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-4 text-sm text-accent"
        >
          <ShieldCheck size={16} aria-hidden />
          Gérer les comptes
        </Link>
      ) : null}

      <LogoutButton />
    </div>
  );
}
