"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

/**
 * Fiche de profil.
 *
 * Ce qui ne bouge pas d'un jour à l'autre — nom, stature, date de naissance,
 * poids visé, cibles de diète. Le poids du jour et les mensurations, eux,
 * restent dans le journal : ce sont justement les valeurs qu'on suit.
 *
 * Un seul bouton d'enregistrement pour toute la fiche : on ne vient pas ici
 * souvent, et une sauvegarde par champ multiplierait les allers-retours sans
 * rien apporter.
 */

export interface ProfileValues {
  displayName: string;
  heightCm: number | null;
  birthDate: string | null;
  targetWeightKg: number | null;
  proteinPerKgLow: number;
  proteinPerKgHigh: number;
  waterTargetLiters: number;
}

const FIELD =
  "tap mt-1 w-full rounded-xl border border-border bg-raised px-3 tabular-nums outline-none focus:border-accent";

/** Accepte la virgule décimale : c'est ce qu'on tape sur un clavier français. */
function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function display(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}

export function ProfileForm({ initial }: { initial: ProfileValues }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [heightCm, setHeightCm] = useState(display(initial.heightCm));
  const [birthDate, setBirthDate] = useState(initial.birthDate ?? "");
  const [targetWeight, setTargetWeight] = useState(display(initial.targetWeightKg));
  const [proteinLow, setProteinLow] = useState(display(initial.proteinPerKgLow));
  const [proteinHigh, setProteinHigh] = useState(display(initial.proteinPerKgHigh));
  const [water, setWater] = useState(display(initial.waterTargetLiters));

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const protein = { low: toNumber(proteinLow), high: toNumber(proteinHigh) };
    const litres = toNumber(water);
    if (protein.low === null || protein.high === null || litres === null) {
      setError("Protéines et eau doivent rester renseignées.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          heightCm: toNumber(heightCm),
          birthDate: birthDate === "" ? null : birthDate,
          targetWeightKg: toNumber(targetWeight),
          proteinPerKgLow: protein.low,
          proteinPerKgHigh: protein.high,
          waterTargetLiters: litres,
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? "Enregistrement refusé.");
        return;
      }

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } catch {
      setError("Serveur injoignable. Réessaie une fois connectée.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm">
        <span className="text-faint">Nom affiché</span>
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          className={FIELD}
          required
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-faint">Taille</span>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={heightCm}
              onChange={(event) => setHeightCm(event.target.value)}
              placeholder="175"
              className={FIELD}
            />
            <span className="mt-1 text-muted">cm</span>
          </div>
        </label>

        <label className="block text-sm">
          <span className="text-faint">Poids visé</span>
          <div className="flex items-center gap-2">
            <input
              inputMode="decimal"
              value={targetWeight}
              onChange={(event) => setTargetWeight(event.target.value)}
              placeholder="—"
              className={FIELD}
            />
            <span className="mt-1 text-muted">kg</span>
          </div>
        </label>

        <label className="block text-sm">
          <span className="text-faint">Naissance</span>
          <input
            type="date"
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            className={FIELD}
          />
        </label>
      </div>

      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-xs text-faint">Cibles quotidiennes</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-faint">Protéines mini</span>
            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={proteinLow}
                onChange={(event) => setProteinLow(event.target.value)}
                className={FIELD}
                required
              />
              <span className="mt-1 whitespace-nowrap text-muted">g/kg</span>
            </div>
          </label>

          <label className="block text-sm">
            <span className="text-faint">Protéines maxi</span>
            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={proteinHigh}
                onChange={(event) => setProteinHigh(event.target.value)}
                className={FIELD}
                required
              />
              <span className="mt-1 whitespace-nowrap text-muted">g/kg</span>
            </div>
          </label>

          <label className="block text-sm">
            <span className="text-faint">Eau</span>
            <div className="flex items-center gap-2">
              <input
                inputMode="decimal"
                value={water}
                onChange={(event) => setWater(event.target.value)}
                className={FIELD}
                required
              />
              <span className="mt-1 text-muted">L</span>
            </div>
          </label>
        </div>
        <p className="mt-2 text-xs text-faint">
          Les grammes de protéines par kilo servent à calculer la cible du jour à partir de ta
          dernière pesée.
        </p>
      </fieldset>

      {error ? (
        <p
          className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="tap rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
        >
          {pending ? "…" : "Enregistrer"}
        </button>
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-success" role="status">
            <Check size={13} aria-hidden />
            enregistré
          </span>
        ) : null}
      </div>
    </form>
  );
}
