"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { enqueue, type MutationKind } from "@/lib/local/db";

/*
 * Formulaires de saisie.
 *
 * Tous suivent la même règle : l'écriture part dans la file d'attente locale et
 * l'interface confirme immédiatement. On n'attend jamais le réseau — c'est ce
 * qui rend l'application utilisable en salle et hors connexion.
 */

function useEnqueue() {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const send = async (kind: MutationKind, payload: unknown) => {
    setPending(true);
    try {
      await enqueue(kind, payload);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return { send, saved, pending };
}

function SavedMark({ saved }: { saved: boolean }) {
  if (!saved) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-success" role="status">
      <Check size={13} aria-hidden />
      enregistré
    </span>
  );
}

/**
 * Compteur à pas fixe, pour les valeurs qu'on incrémente sans clavier :
 * cuillères d'huile, litres d'eau, poings de riz.
 */
export function StepCounter({
  kind,
  date,
  initial,
  step,
  unit,
  label,
  max = 20,
  tone = "accent",
}: {
  kind: MutationKind;
  date: string;
  initial: number;
  step: number;
  unit: string;
  label: string;
  max?: number;
  tone?: "accent" | "warning";
}) {
  const [value, setValue] = useState(initial);
  const { send, saved } = useEnqueue();

  const change = (delta: number) => {
    const next = Math.max(0, Math.min(max, Math.round((value + delta) * 10) / 10));
    setValue(next);
    void send(kind, { date, value: next });
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <SavedMark saved={saved} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => change(-step)}
          className="tap grid place-items-center rounded-xl border border-border text-muted"
          aria-label={`Retirer ${step} ${unit}`}
        >
          <Minus size={18} />
        </button>
        <output
          className={cn(
            "flex-1 text-center text-2xl font-semibold tabular-nums",
            tone === "warning" && "text-warning",
          )}
        >
          {value}
          <span className="ml-1 text-base font-normal text-muted">{unit}</span>
        </output>
        <button
          type="button"
          onClick={() => change(step)}
          className="tap grid place-items-center rounded-xl border border-border text-muted"
          aria-label={`Ajouter ${step} ${unit}`}
        >
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}

/** Saisie d'une pesée à jeun. */
export function WeightForm({ date, initial }: { date: string; initial: number | null }) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const { send, saved, pending } = useEnqueue();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const weight = Number(value.replace(",", "."));
        if (!Number.isFinite(weight) || weight < 20 || weight > 300) return;
        void send("bodyweight.upsert", { date, weightKg: weight, fasted: true });
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex-1 text-sm">
        <span className="text-faint">Pesée à jeun</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="75,4"
            className="tap w-full rounded-xl border border-border bg-raised px-3 text-lg tabular-nums outline-none focus:border-accent"
          />
          <span className="text-muted">kg</span>
        </div>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="tap rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
      >
        Noter
      </button>
      <SavedMark saved={saved} />
    </form>
  );
}

/** Mensurations : taille, bras, cuisse, poitrine. */
export function MeasurementForm({
  date,
  initial,
}: {
  date: string;
  initial: Partial<Record<"taille" | "bras" | "cuisse" | "poitrine", number>>;
}) {
  const kinds = [
    { key: "taille", label: "Tour de taille" },
    { key: "bras", label: "Bras" },
    { key: "cuisse", label: "Cuisse" },
    { key: "poitrine", label: "Poitrine" },
  ] as const;

  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(kinds.map((k) => [k.key, initial[k.key] ? String(initial[k.key]) : ""])),
  );
  const { send, saved } = useEnqueue();

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <SavedMark saved={saved} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {kinds.map(({ key, label }) => (
          <label key={key} className="text-sm">
            <span className="text-faint">{label}</span>
            <div className="mt-1 flex items-center gap-1">
              <input
                inputMode="decimal"
                value={values[key]}
                onChange={(event) => setValues((v) => ({ ...v, [key]: event.target.value }))}
                onBlur={() => {
                  const raw = Number(values[key].replace(",", "."));
                  if (!Number.isFinite(raw) || raw <= 0) return;
                  void send("measurement.upsert", { date, kind: key, valueCm: raw });
                }}
                className="tap w-full rounded-xl border border-border bg-raised px-3 tabular-nums outline-none focus:border-accent"
              />
              <span className="text-xs text-muted">cm</span>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Nuit : heures, qualité, fréquence cardiaque au réveil. */
export function SleepForm({
  date,
  initial,
}: {
  date: string;
  initial: {
    bedtime: string | null;
    wakeTime: string | null;
    durationMinutes: number | null;
    quality: number | null;
    restingHr: number | null;
  } | null;
}) {
  const [bedtime, setBedtime] = useState(initial?.bedtime ?? "");
  const [wakeTime, setWakeTime] = useState(initial?.wakeTime ?? "");
  const [quality, setQuality] = useState<number | null>(initial?.quality ?? null);
  const [restingHr, setRestingHr] = useState(initial?.restingHr ? String(initial.restingHr) : "");
  const { send, saved, pending } = useEnqueue();

  /** Une nuit franchit minuit : le coucher est avant le lever, jamais après. */
  const durationMinutes = (() => {
    if (!bedtime || !wakeTime) return null;
    const [bh, bm] = bedtime.split(":").map(Number);
    const [wh, wm] = wakeTime.split(":").map(Number);
    if ([bh, bm, wh, wm].some((n) => !Number.isFinite(n))) return null;
    let minutes = wh * 60 + wm - (bh * 60 + bm);
    if (minutes <= 0) minutes += 24 * 60;
    return minutes;
  })();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send("sleep.upsert", {
          date,
          bedtime: bedtime || null,
          wakeTime: wakeTime || null,
          durationMinutes,
          quality,
          restingHr: restingHr === "" ? null : Number(restingHr),
        });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="text-faint">Coucher</span>
          <input
            type="time"
            value={bedtime}
            onChange={(event) => setBedtime(event.target.value)}
            className="tap mt-1 w-full rounded-xl border border-border bg-raised px-3 tabular-nums outline-none focus:border-accent"
          />
        </label>
        <label className="text-sm">
          <span className="text-faint">Lever</span>
          <input
            type="time"
            value={wakeTime}
            onChange={(event) => setWakeTime(event.target.value)}
            className="tap mt-1 w-full rounded-xl border border-border bg-raised px-3 tabular-nums outline-none focus:border-accent"
          />
        </label>
      </div>

      {durationMinutes !== null ? (
        <p
          className={cn(
            "text-sm tabular-nums",
            durationMinutes < 390 ? "text-warning" : "text-muted",
          )}
        >
          {Math.floor(durationMinutes / 60)} h {String(durationMinutes % 60).padStart(2, "0")}
          {durationMinutes < 390 ? " — sous les 7 h visées par le programme" : ""}
        </p>
      ) : null}

      <fieldset>
        <legend className="mb-1 text-sm text-faint">Qualité</legend>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setQuality(value)}
              aria-pressed={quality === value}
              className={cn(
                "tap flex-1 rounded-lg border text-sm tabular-nums",
                quality === value ? "border-accent bg-accent/15 text-accent" : "border-border text-muted",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block text-sm">
        <span className="text-faint">Fréquence cardiaque au réveil</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            inputMode="numeric"
            value={restingHr}
            onChange={(event) => setRestingHr(event.target.value)}
            placeholder="55"
            className="tap w-24 rounded-xl border border-border bg-raised px-3 tabular-nums outline-none focus:border-accent"
          />
          <span className="text-muted">bpm</span>
        </div>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="tap rounded-xl bg-accent px-4 font-medium text-accent-contrast disabled:opacity-60"
        >
          Enregistrer la nuit
        </button>
        <SavedMark saved={saved} />
      </div>
    </form>
  );
}

/** Déclaration d'une douleur, pour alimenter le signal d'alerte à 48 h. */
export function PainForm({ date }: { date: string }) {
  const [area, setArea] = useState("");
  const [intensity, setIntensity] = useState(2);
  const [isJoint, setIsJoint] = useState(true);
  const { send, saved, pending } = useEnqueue();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (area.trim() === "") return;
        void send("pain.add", { date, area: area.trim(), intensity, isJoint, note: null });
        setArea("");
      }}
      className="space-y-3"
    >
      <label className="block text-sm">
        <span className="text-faint">Zone</span>
        <input
          value={area}
          onChange={(event) => setArea(event.target.value)}
          placeholder="épaule droite, coude, genou…"
          className="tap mt-1 w-full rounded-xl border border-border bg-raised px-3 outline-none focus:border-accent"
        />
      </label>

      <fieldset>
        <legend className="mb-1 text-sm text-faint">Intensité</legend>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setIntensity(value)}
              aria-pressed={intensity === value}
              className={cn(
                "tap flex-1 rounded-lg border text-sm tabular-nums",
                intensity === value ? "border-danger bg-danger/15 text-danger" : "border-border text-muted",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isJoint}
          onChange={(event) => setIsJoint(event.target.checked)}
          className="size-4"
        />
        <span className="text-muted">
          Douleur articulaire (à distinguer d'une courbature — c'est elle qui déclenche l'alerte à 48 h)
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="tap rounded-xl border border-border px-4 text-sm text-muted disabled:opacity-60"
        >
          Signaler
        </button>
        <SavedMark saved={saved} />
      </div>
    </form>
  );
}

/** Saisie d'une métrique de test (reps ou secondes selon la métrique). */
export function TestMetricInput({
  date,
  metric,
  label,
  unit,
  initial,
}: {
  date: string;
  metric: string;
  label: string;
  unit: "reps" | "seconds";
  initial: number | null;
}) {
  const [value, setValue] = useState(initial === null ? "" : String(initial));
  const { send, saved } = useEnqueue();

  return (
    <label className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="min-w-0 flex-1 text-muted">{label}</span>
      <SavedMark saved={saved} />
      <span className="flex items-center gap-1">
        <input
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            const parsed = Number(value.replace(",", "."));
            if (!Number.isFinite(parsed)) return;
            void send("test.upsert", { date, metric, value: parsed, level: null });
          }}
          className="tap w-20 rounded-lg border border-border bg-raised px-2 text-center tabular-nums outline-none focus:border-accent"
        />
        <span className="w-6 text-xs text-faint">{unit === "reps" ? "rep" : "s"}</span>
      </span>
    </label>
  );
}

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3">{children}</div>;
}
