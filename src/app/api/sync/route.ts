import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db/client";
import { isAuthenticated } from "@/lib/auth/session";

/**
 * Point d'entrée unique des écritures.
 *
 * Le client écrit d'abord dans IndexedDB puis pousse ici. Chaque mutation porte
 * un identifiant généré côté client, enregistré dans `sync_mutations` : rejouer
 * une mutation déjà appliquée ne crée pas de doublon. C'est ce qui rend la
 * synchronisation sûre après une coupure réseau en pleine séance.
 */

export const runtime = "nodejs";

const slot = z.enum(["salle", "matin", "soir"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ");

const sessionUpsert = z.object({
  date: isoDate,
  slot,
  programSessionId: z.number().int().nullable().optional(),
  status: z.enum(["in_progress", "done", "partial", "missed", "moved"]),
  /** Salle ou maison : les charges des deux ne se comparent pas. */
  location: z.enum(["salle", "maison"]).default("salle"),
  startedAt: z.string().datetime().nullable().optional(),
  endedAt: z.string().datetime().nullable().optional(),
  durationSeconds: z.number().int().min(0).max(86_400).nullable().optional(),
  rpe: z.number().int().min(1).max(10).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  /** Horodatage de saisie fourni par le client : c'est lui qui fait foi pour le retard. */
  loggedAt: z.string().datetime().optional(),
  exercises: z
    .array(
      z.object({
        programExerciseId: z.number().int().nullable().optional(),
        exerciseId: z.number().int(),
        orderIndex: z.number().int().min(0),
        orderLabel: z.string().max(10).nullable().optional(),
        done: z.boolean(),
        skipReason: z
          .enum(["machine_occupee", "douleur", "manque_de_temps", "remplace", "autre"])
          .nullable()
          .optional(),
        weightKg: z.number().min(0).max(999).nullable().optional(),
        loadUnit: z.enum(["barre_machine", "kg_par_haltere", "poids_du_corps"]).nullable().optional(),
        machineNote: z.string().max(200).nullable().optional(),
        setsDone: z.number().int().min(0).max(50).nullable().optional(),
        repsDone: z.number().int().min(0).max(500).nullable().optional(),
        holdSecondsDone: z.number().int().min(0).max(3600).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      }),
    )
    .default([]),
});

const sessionMiss = z.object({
  date: isoDate,
  slot,
  programSessionId: z.number().int().nullable().optional(),
  status: z.enum(["missed", "moved"]).default("missed"),
  missedReason: z.enum([
    "fatigue",
    "sommeil",
    "travail",
    "blessure",
    "maladie",
    "voyage",
    "salle_indisponible",
    "motivation",
    "repos_volontaire",
    "autre",
  ]),
  missedNote: z.string().max(500).nullable().optional(),
  movedToDate: isoDate.nullable().optional(),
  loggedAt: z.string().datetime().optional(),
});

const dailyNumber = z.object({ date: isoDate, value: z.number().min(0).max(100) });

const mutation = z.discriminatedUnion("kind", [
  z.object({ id: z.string().min(1).max(64), kind: z.literal("session.upsert"), payload: sessionUpsert }),
  z.object({ id: z.string().min(1).max(64), kind: z.literal("session.miss"), payload: sessionMiss }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("bodyweight.upsert"),
    payload: z.object({ date: isoDate, weightKg: z.number().min(20).max(300), fasted: z.boolean().default(true) }),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("measurement.upsert"),
    payload: z.object({
      date: isoDate,
      kind: z.enum(["taille", "bras", "cuisse", "poitrine"]),
      valueCm: z.number().min(10).max(300),
    }),
  }),
  z.object({ id: z.string().min(1).max(64), kind: z.literal("oil.upsert"), payload: dailyNumber }),
  z.object({ id: z.string().min(1).max(64), kind: z.literal("water.upsert"), payload: dailyNumber }),
  z.object({ id: z.string().min(1).max(64), kind: z.literal("rice.upsert"), payload: dailyNumber }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("sleep.upsert"),
    payload: z.object({
      date: isoDate,
      bedtime: z.string().max(5).nullable().optional(),
      wakeTime: z.string().max(5).nullable().optional(),
      durationMinutes: z.number().int().min(0).max(1440).nullable().optional(),
      quality: z.number().int().min(1).max(5).nullable().optional(),
      restingHr: z.number().int().min(30).max(140).nullable().optional(),
    }),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("pain.add"),
    payload: z.object({
      date: isoDate,
      area: z.string().min(1).max(60),
      intensity: z.number().int().min(1).max(5),
      isJoint: z.boolean(),
      note: z.string().max(300).nullable().optional(),
    }),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("test.upsert"),
    payload: z.object({
      date: isoDate,
      metric: z.string().min(1).max(40),
      value: z.number().min(0).max(9999).nullable().optional(),
      level: z.number().int().min(1).max(10).nullable().optional(),
    }),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("ladder.upsert"),
    payload: z.object({
      ladderId: z.number().int(),
      currentLevel: z.number().int().min(1).max(20),
      cleanStreak: z.number().int().min(0).max(10),
    }),
  }),
  z.object({
    id: z.string().min(1).max(64),
    kind: z.literal("meal.upsert"),
    payload: z.object({
      date: isoDate,
      slot: z.enum([
        "petit_dejeuner",
        "collation_matin",
        "dejeuner",
        "collation_apres_midi",
        "diner",
        "post_seance",
      ]),
      note: z.string().max(500).nullable().optional(),
      items: z
        .array(z.object({ foodId: z.number().int(), portions: z.number().min(0).max(20) }))
        .default([]),
    }),
  }),
]);

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corps de requête illisible" }, { status: 400 });
  }

  const parsed = mutation.safeParse(body);
  if (!parsed.success) {
    // 422 : le client retire la mutation de sa file, elle ne passera jamais.
    return NextResponse.json(
      { error: "mutation invalide", details: parsed.error.issues.slice(0, 5) },
      { status: 422 },
    );
  }

  const db = getDb();
  const { id, kind, payload } = parsed.data;

  // Idempotence : une mutation déjà appliquée est acquittée sans être rejouée.
  const seen = await db
    .select({ id: schema.syncMutations.id })
    .from(schema.syncMutations)
    .where(eq(schema.syncMutations.id, id));

  if (seen.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await applyMutation(db, kind, payload);
    await db.insert(schema.syncMutations).values({ id, kind }).onConflictDoNothing();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("sync: échec d'application", kind, error);
    return NextResponse.json({ error: "échec d'application" }, { status: 500 });
  }
}

type Db = ReturnType<typeof getDb>;

async function applyMutation(db: Db, kind: string, payload: unknown): Promise<void> {
  switch (kind) {
    case "session.upsert":
      return applySessionUpsert(db, payload as z.infer<typeof sessionUpsert>);
    case "session.miss":
      return applySessionMiss(db, payload as z.infer<typeof sessionMiss>);

    case "bodyweight.upsert": {
      const p = payload as { date: string; weightKg: number; fasted: boolean };
      await db
        .insert(schema.bodyweightEntries)
        .values({ date: p.date, weightKg: String(p.weightKg), fasted: p.fasted })
        .onConflictDoUpdate({
          target: schema.bodyweightEntries.date,
          set: { weightKg: String(p.weightKg), fasted: p.fasted },
        });
      return;
    }

    case "measurement.upsert": {
      const p = payload as { date: string; kind: "taille" | "bras" | "cuisse" | "poitrine"; valueCm: number };
      await db
        .insert(schema.measurements)
        .values({ date: p.date, kind: p.kind, valueCm: String(p.valueCm) })
        .onConflictDoUpdate({
          target: [schema.measurements.date, schema.measurements.kind],
          set: { valueCm: String(p.valueCm) },
        });
      return;
    }

    case "oil.upsert": {
      const p = payload as { date: string; value: number };
      await db
        .insert(schema.oilLogs)
        .values({ date: p.date, tablespoons: String(p.value) })
        .onConflictDoUpdate({ target: schema.oilLogs.date, set: { tablespoons: String(p.value) } });
      return;
    }

    case "water.upsert": {
      const p = payload as { date: string; value: number };
      await db
        .insert(schema.waterLogs)
        .values({ date: p.date, liters: String(p.value) })
        .onConflictDoUpdate({ target: schema.waterLogs.date, set: { liters: String(p.value) } });
      return;
    }

    case "rice.upsert": {
      const p = payload as { date: string; value: number };
      await db
        .insert(schema.riceLogs)
        .values({ date: p.date, fists: String(p.value) })
        .onConflictDoUpdate({ target: schema.riceLogs.date, set: { fists: String(p.value) } });
      return;
    }

    case "sleep.upsert": {
      const p = payload as {
        date: string;
        bedtime?: string | null;
        wakeTime?: string | null;
        durationMinutes?: number | null;
        quality?: number | null;
        restingHr?: number | null;
      };
      const values = {
        bedtime: p.bedtime ?? null,
        wakeTime: p.wakeTime ?? null,
        durationMinutes: p.durationMinutes ?? null,
        quality: p.quality ?? null,
        restingHr: p.restingHr ?? null,
      };
      await db
        .insert(schema.sleepLogs)
        .values({ date: p.date, ...values })
        .onConflictDoUpdate({ target: schema.sleepLogs.date, set: values });
      return;
    }

    case "pain.add": {
      const p = payload as {
        date: string;
        area: string;
        intensity: number;
        isJoint: boolean;
        note?: string | null;
      };
      await db.insert(schema.painLogs).values({
        date: p.date,
        area: p.area,
        intensity: p.intensity,
        isJoint: p.isJoint,
        note: p.note ?? null,
      });
      return;
    }

    case "test.upsert": {
      const p = payload as { date: string; metric: string; value?: number | null; level?: number | null };
      await db
        .insert(schema.strengthTests)
        .values({
          date: p.date,
          metric: p.metric,
          value: p.value === null || p.value === undefined ? null : String(p.value),
          level: p.level ?? null,
        })
        .onConflictDoUpdate({
          target: [schema.strengthTests.date, schema.strengthTests.metric],
          set: {
            value: p.value === null || p.value === undefined ? null : String(p.value),
            level: p.level ?? null,
          },
        });
      return;
    }

    case "ladder.upsert": {
      const p = payload as { ladderId: number; currentLevel: number; cleanStreak: number };
      await db
        .insert(schema.ladderProgress)
        .values({ ladderId: p.ladderId, currentLevel: p.currentLevel, cleanStreak: p.cleanStreak })
        .onConflictDoUpdate({
          target: schema.ladderProgress.ladderId,
          set: { currentLevel: p.currentLevel, cleanStreak: p.cleanStreak, updatedAt: new Date() },
        });
      return;
    }

    case "meal.upsert": {
      const p = payload as {
        date: string;
        slot:
          | "petit_dejeuner"
          | "collation_matin"
          | "dejeuner"
          | "collation_apres_midi"
          | "diner"
          | "post_seance";
        note?: string | null;
        items: { foodId: number; portions: number }[];
      };
      const [meal] = await db
        .insert(schema.mealLogs)
        .values({ date: p.date, slot: p.slot, note: p.note ?? null })
        .onConflictDoUpdate({
          target: [schema.mealLogs.date, schema.mealLogs.slot],
          set: { note: p.note ?? null },
        })
        .returning({ id: schema.mealLogs.id });

      await db.delete(schema.mealItems).where(eq(schema.mealItems.mealLogId, meal.id));
      if (p.items.length > 0) {
        await db.insert(schema.mealItems).values(
          p.items.map((item) => ({
            mealLogId: meal.id,
            foodId: item.foodId,
            portions: String(item.portions),
          })),
        );
      }
      return;
    }

    default:
      throw new Error(`mutation non gérée : ${kind}`);
  }
}

async function applySessionUpsert(db: Db, p: z.infer<typeof sessionUpsert>): Promise<void> {
  const loggedAt = p.loggedAt ? new Date(p.loggedAt) : new Date();

  const [session] = await db
    .insert(schema.sessions)
    .values({
      date: p.date,
      slot: p.slot,
      programSessionId: p.programSessionId ?? null,
      status: p.status,
      location: p.location,
      startedAt: p.startedAt ? new Date(p.startedAt) : null,
      endedAt: p.endedAt ? new Date(p.endedAt) : null,
      durationSeconds: p.durationSeconds ?? null,
      rpe: p.rpe ?? null,
      note: p.note ?? null,
      loggedAt,
    })
    .onConflictDoUpdate({
      target: [schema.sessions.date, schema.sessions.slot],
      set: {
        status: p.status,
        location: p.location,
        programSessionId: p.programSessionId ?? null,
        startedAt: p.startedAt ? new Date(p.startedAt) : null,
        endedAt: p.endedAt ? new Date(p.endedAt) : null,
        durationSeconds: p.durationSeconds ?? null,
        rpe: p.rpe ?? null,
        note: p.note ?? null,
        // La première saisie fait foi pour le retard : on ne la réécrit pas.
        updatedAt: new Date(),
      },
    })
    .returning({ id: schema.sessions.id });

  // Les exercices sont remplacés en bloc : l'écran de séance envoie toujours
  // l'état complet, ce qui évite les fusions partielles ambiguës.
  await db.delete(schema.sessionExercises).where(eq(schema.sessionExercises.sessionId, session.id));

  if (p.exercises.length > 0) {
    await db.insert(schema.sessionExercises).values(
      p.exercises.map((exercise) => ({
        sessionId: session.id,
        programExerciseId: exercise.programExerciseId ?? null,
        exerciseId: exercise.exerciseId,
        orderIndex: exercise.orderIndex,
        orderLabel: exercise.orderLabel ?? null,
        done: exercise.done,
        skipReason: exercise.skipReason ?? null,
        weightKg:
          exercise.weightKg === null || exercise.weightKg === undefined
            ? null
            : String(exercise.weightKg),
        loadUnit: exercise.loadUnit ?? null,
        machineNote: exercise.machineNote ?? null,
        setsDone: exercise.setsDone ?? null,
        repsDone: exercise.repsDone ?? null,
        holdSecondsDone: exercise.holdSecondsDone ?? null,
        note: exercise.note ?? null,
      })),
    );
  }
}

async function applySessionMiss(db: Db, p: z.infer<typeof sessionMiss>): Promise<void> {
  const values = {
    status: p.status,
    missedReason: p.missedReason,
    missedNote: p.missedNote ?? null,
    movedToDate: p.movedToDate ?? null,
    updatedAt: new Date(),
  };

  await db
    .insert(schema.sessions)
    .values({
      date: p.date,
      slot: p.slot,
      programSessionId: p.programSessionId ?? null,
      loggedAt: p.loggedAt ? new Date(p.loggedAt) : new Date(),
      ...values,
    })
    .onConflictDoUpdate({
      target: [schema.sessions.date, schema.sessions.slot],
      set: values,
    });

  // Une séance déclarée manquée ne conserve pas d'exercices réalisés.
  const [row] = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.date, p.date), eq(schema.sessions.slot, p.slot)));

  if (row) {
    await db.delete(schema.sessionExercises).where(eq(schema.sessionExercises.sessionId, row.id));
  }
}
