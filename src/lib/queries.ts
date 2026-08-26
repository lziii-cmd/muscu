import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import type { Slot } from "@/lib/utils";

/*
 * Accès aux données, côté serveur uniquement.
 *
 * Les pages analytiques lisent directement ici. L'écran de séance, lui, passe
 * par une route API : il doit rester consultable hors-ligne, donc le client le
 * met en cache dans IndexedDB.
 */

export interface PrescribedExercise {
  id: number;
  exerciseId: number;
  name: string;
  muscleGroup: string | null;
  equipment: string | null;
  unit: "reps" | "seconds";
  orderLabel: string;
  orderIndex: number;
  supersetGroup: string | null;
  sets: number | null;
  repsLow: number | null;
  repsHigh: number | null;
  /** Tenue isométrique, bornes basse et haute (égales si valeur unique). */
  holdSecondsLow: number | null;
  holdSecondsHigh: number | null;
  /** Répétitions déduites du max courant : max - `maxOffset`. */
  maxOffset: number | null;
  perSide: boolean;
  loadRaw: string | null;
  loadKg: number | null;
  dumbbellKg: number | null;
  restSeconds: number | null;
  cue: string | null;
  /** Équivalent maison fourni par le programme, pour déplacer la séance. */
  homeAlternative: string | null;
}

export interface LoggedExercise {
  id: number;
  programExerciseId: number | null;
  exerciseId: number;
  orderIndex: number;
  done: boolean;
  skipReason: string | null;
  weightKg: number | null;
  loadUnit: string | null;
  machineNote: string | null;
  setsDone: number | null;
  repsDone: number | null;
  holdSecondsDone: number | null;
  note: string | null;
}

export interface DaySession {
  slot: Slot;
  programSessionId: number | null;
  weekNumber: number | null;
  label: string;
  heading: string | null;
  isRestDay: boolean;
  isTestDay: boolean;
  prescribed: PrescribedExercise[];
  logged: {
    id: number;
    status: string;
    location: string;
    startedAt: string | null;
    endedAt: string | null;
    durationSeconds: number | null;
    rpe: number | null;
    note: string | null;
    missedReason: string | null;
    missedNote: string | null;
    loggedAt: string | null;
    exercises: LoggedExercise[];
  } | null;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const n = typeof value === "string" ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : null;
};

/** Toutes les séances prescrites et réalisées d'une journée, tous créneaux. */
export async function getDay(date: string): Promise<DaySession[]> {
  const db = getDb();

  const prescribedSessions = await db
    .select({
      id: schema.programSessions.id,
      slot: schema.programSessions.slot,
      weekNumber: schema.programSessions.weekNumber,
      label: schema.programSessions.label,
      heading: schema.programSessions.heading,
      isRestDay: schema.programSessions.isRestDay,
      isTestDay: schema.programSessions.isTestDay,
    })
    .from(schema.programSessions)
    .where(eq(schema.programSessions.date, date))
    .orderBy(asc(schema.programSessions.slot));

  const sessionIds = prescribedSessions.map((s) => s.id);

  const prescribedExercises = sessionIds.length
    ? await db
        .select({
          id: schema.programExercises.id,
          programSessionId: schema.programExercises.programSessionId,
          exerciseId: schema.programExercises.exerciseId,
          name: schema.exercises.name,
          muscleGroup: schema.exercises.muscleGroup,
          equipment: schema.exercises.equipment,
          unit: schema.exercises.unit,
          orderLabel: schema.programExercises.orderLabel,
          orderIndex: schema.programExercises.orderIndex,
          supersetGroup: schema.programExercises.supersetGroup,
          sets: schema.programExercises.sets,
          repsLow: schema.programExercises.repsLow,
          repsHigh: schema.programExercises.repsHigh,
          holdSecondsLow: schema.programExercises.holdSecondsLow,
          holdSecondsHigh: schema.programExercises.holdSecondsHigh,
          maxOffset: schema.programExercises.maxOffset,
          perSide: schema.programExercises.perSide,
          loadRaw: schema.programExercises.loadRaw,
          loadKg: schema.programExercises.loadKg,
          dumbbellKg: schema.programExercises.dumbbellKg,
          restSeconds: schema.programExercises.restSeconds,
          cue: schema.programExercises.cue,
          homeAlternative: schema.programExercises.homeAlternative,
        })
        .from(schema.programExercises)
        .innerJoin(schema.exercises, eq(schema.exercises.id, schema.programExercises.exerciseId))
        .where(inArray(schema.programExercises.programSessionId, sessionIds))
        .orderBy(asc(schema.programExercises.orderIndex))
    : [];

  const loggedSessions = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.date, date));

  const loggedIds = loggedSessions.map((s) => s.id);
  const loggedExercises = loggedIds.length
    ? await db
        .select()
        .from(schema.sessionExercises)
        .where(inArray(schema.sessionExercises.sessionId, loggedIds))
        .orderBy(asc(schema.sessionExercises.orderIndex))
    : [];

  return prescribedSessions.map((session) => {
    const logged = loggedSessions.find((l) => l.slot === session.slot) ?? null;

    return {
      slot: session.slot as Slot,
      programSessionId: session.id,
      weekNumber: session.weekNumber,
      label: session.label,
      heading: session.heading,
      isRestDay: session.isRestDay,
      isTestDay: session.isTestDay,
      prescribed: prescribedExercises
        .filter((e) => e.programSessionId === session.id)
        .map((e) => ({
          ...e,
          loadKg: toNumber(e.loadKg),
          dumbbellKg: toNumber(e.dumbbellKg),
          unit: e.unit as "reps" | "seconds",
        })),
      logged: logged
        ? {
            id: logged.id,
            status: logged.status,
            location: logged.location,
            startedAt: logged.startedAt?.toISOString() ?? null,
            endedAt: logged.endedAt?.toISOString() ?? null,
            durationSeconds: logged.durationSeconds,
            rpe: logged.rpe,
            note: logged.note,
            missedReason: logged.missedReason,
            missedNote: logged.missedNote,
            loggedAt: logged.loggedAt?.toISOString() ?? null,
            exercises: loggedExercises
              .filter((e) => e.sessionId === logged.id)
              .map((e) => ({
                id: e.id,
                programExerciseId: e.programExerciseId,
                exerciseId: e.exerciseId,
                orderIndex: e.orderIndex,
                done: e.done,
                skipReason: e.skipReason,
                weightKg: toNumber(e.weightKg),
                loadUnit: e.loadUnit,
                machineNote: e.machineNote,
                setsDone: e.setsDone,
                repsDone: e.repsDone,
                holdSecondsDone: e.holdSecondsDone,
                note: e.note,
              })),
          }
        : null,
    };
  });
}

/** Semaine de programme contenant une date, pour afficher bloc et consigne. */
export async function getWeekFor(date: string) {
  const db = getDb();
  const rows = await db
    .select({
      weekNumber: schema.programWeeks.weekNumber,
      blockName: schema.programWeeks.blockName,
      startDate: schema.programWeeks.startDate,
      endDate: schema.programWeeks.endDate,
      instruction: schema.programWeeks.instruction,
      programCode: schema.programs.code,
    })
    .from(schema.programWeeks)
    .innerJoin(schema.programs, eq(schema.programs.id, schema.programWeeks.programId))
    .where(
      and(lte(schema.programWeeks.startDate, date), gte(schema.programWeeks.endDate, date)),
    );

  return rows;
}

/** Journal des séances sur une période, pour le calendrier et l'assiduité. */
export async function getSessionRecords(from: string, to: string) {
  const db = getDb();
  return db
    .select({
      date: schema.sessions.date,
      slot: schema.sessions.slot,
      status: schema.sessions.status,
      location: schema.sessions.location,
      missedReason: schema.sessions.missedReason,
      loggedAt: schema.sessions.loggedAt,
      durationSeconds: schema.sessions.durationSeconds,
      rpe: schema.sessions.rpe,
    })
    .from(schema.sessions)
    .where(and(gte(schema.sessions.date, from), lte(schema.sessions.date, to)))
    .orderBy(asc(schema.sessions.date));
}

/** Toutes les séances prescrites d'une période, pour le calendrier. */
export async function getPrescribedRange(from: string, to: string) {
  const db = getDb();
  return db
    .select({
      date: schema.programSessions.date,
      slot: schema.programSessions.slot,
      label: schema.programSessions.label,
      weekNumber: schema.programSessions.weekNumber,
      isRestDay: schema.programSessions.isRestDay,
      isTestDay: schema.programSessions.isTestDay,
    })
    .from(schema.programSessions)
    .where(and(gte(schema.programSessions.date, from), lte(schema.programSessions.date, to)))
    .orderBy(asc(schema.programSessions.date));
}

/** Historique d'un exercice, agrégé par séance : base des courbes et des records. */
export async function getExerciseHistory(exerciseId: number) {
  const db = getDb();
  const rows = await db
    .select({
      date: schema.sessions.date,
      weightKg: schema.sessionExercises.weightKg,
      setsDone: schema.sessionExercises.setsDone,
      repsDone: schema.sessionExercises.repsDone,
      holdSecondsDone: schema.sessionExercises.holdSecondsDone,
      done: schema.sessionExercises.done,
      location: schema.sessions.location,
    })
    .from(schema.sessionExercises)
    .innerJoin(schema.sessions, eq(schema.sessions.id, schema.sessionExercises.sessionId))
    .where(and(eq(schema.sessionExercises.exerciseId, exerciseId), eq(schema.sessionExercises.done, true)))
    .orderBy(asc(schema.sessions.date));

  return rows.map((row) => ({
    date: row.date,
    weightKg: toNumber(row.weightKg),
    sets: row.setsDone,
    reps: row.repsDone,
    holdSeconds: row.holdSecondsDone,
    location: row.location as "salle" | "maison",
  }));
}

/** Exercices déjà travaillés, avec leur dernière charge : base de la progression. */
export async function getTrackedExercises() {
  const db = getDb();
  return db
    .select({
      exerciseId: schema.exercises.id,
      name: schema.exercises.name,
      muscleGroup: schema.exercises.muscleGroup,
      unit: schema.exercises.unit,
      sessions: sql<number>`count(distinct ${schema.sessionExercises.sessionId})::int`,
      lastDate: sql<string>`max(${schema.sessions.date})`,
      bestWeight: sql<string>`max(${schema.sessionExercises.weightKg})`,
    })
    .from(schema.sessionExercises)
    .innerJoin(schema.exercises, eq(schema.exercises.id, schema.sessionExercises.exerciseId))
    .innerJoin(schema.sessions, eq(schema.sessions.id, schema.sessionExercises.sessionId))
    .where(and(eq(schema.sessionExercises.done, true), eq(schema.sessions.location, "salle")))
    .groupBy(schema.exercises.id, schema.exercises.name, schema.exercises.muscleGroup, schema.exercises.unit)
    .orderBy(desc(sql`max(${schema.sessions.date})`));
}

export async function getBodyweightEntries() {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.bodyweightEntries)
    .orderBy(asc(schema.bodyweightEntries.date));
  return rows.map((row) => ({ date: row.date, weightKg: Number(row.weightKg) }));
}

export async function getMeasurements() {
  const db = getDb();
  const rows = await db.select().from(schema.measurements).orderBy(asc(schema.measurements.date));
  return rows.map((row) => ({ date: row.date, kind: row.kind, valueCm: Number(row.valueCm) }));
}

export async function getSleepEntries(from?: string) {
  const db = getDb();
  const query = db.select().from(schema.sleepLogs).orderBy(asc(schema.sleepLogs.date));
  const rows = from ? await query.where(gte(schema.sleepLogs.date, from)) : await query;
  return rows.map((row) => ({
    date: row.date,
    durationMinutes: row.durationMinutes,
    quality: row.quality,
    restingHr: row.restingHr,
    bedtime: row.bedtime,
    wakeTime: row.wakeTime,
  }));
}

export async function getPainEntries(from?: string) {
  const db = getDb();
  const query = db.select().from(schema.painLogs).orderBy(asc(schema.painLogs.date));
  const rows = from ? await query.where(gte(schema.painLogs.date, from)) : await query;
  return rows.map((row) => ({
    date: row.date,
    area: row.area,
    intensity: row.intensity,
    isJoint: row.isJoint,
  }));
}

export async function getFoods() {
  const db = getDb();
  const rows = await db.select().from(schema.foods).orderBy(asc(schema.foods.id));
  return rows.map((row) => ({
    ...row,
    proteinG: Number(row.proteinG),
  }));
}

export async function getDayNutrition(date: string) {
  const db = getDb();

  const [meals, items, oil, water, rice] = await Promise.all([
    db.select().from(schema.mealLogs).where(eq(schema.mealLogs.date, date)),
    db
      .select({
        mealLogId: schema.mealItems.mealLogId,
        foodId: schema.mealItems.foodId,
        portions: schema.mealItems.portions,
        proteinG: schema.foods.proteinG,
        name: schema.foods.name,
        kcal: schema.foods.kcal,
      })
      .from(schema.mealItems)
      .innerJoin(schema.foods, eq(schema.foods.id, schema.mealItems.foodId))
      .innerJoin(schema.mealLogs, eq(schema.mealLogs.id, schema.mealItems.mealLogId))
      .where(eq(schema.mealLogs.date, date)),
    db.select().from(schema.oilLogs).where(eq(schema.oilLogs.date, date)),
    db.select().from(schema.waterLogs).where(eq(schema.waterLogs.date, date)),
    db.select().from(schema.riceLogs).where(eq(schema.riceLogs.date, date)),
  ]);

  const proteinG = items.reduce(
    (total, item) => total + Number(item.proteinG) * Number(item.portions),
    0,
  );

  return {
    meals: meals.map((meal) => ({
      id: meal.id,
      slot: meal.slot,
      note: meal.note,
      items: items
        .filter((item) => item.mealLogId === meal.id)
        .map((item) => ({
          foodId: item.foodId,
          name: item.name,
          portions: Number(item.portions),
          proteinG: Number(item.proteinG) * Number(item.portions),
          kcal: item.kcal ? item.kcal * Number(item.portions) : null,
        })),
    })),
    proteinG: Math.round(proteinG),
    oilTablespoons: oil[0] ? Number(oil[0].tablespoons) : 0,
    waterLiters: water[0] ? Number(water[0].liters) : 0,
    riceFists: rice[0] ? Number(rice[0].fists) : 0,
  };
}

export async function getLadders() {
  const db = getDb();
  const [ladders, levels, progress] = await Promise.all([
    db.select().from(schema.ladders).orderBy(asc(schema.ladders.id)),
    db.select().from(schema.ladderLevels).orderBy(asc(schema.ladderLevels.level)),
    db.select().from(schema.ladderProgress),
  ]);

  return ladders.map((ladder) => ({
    ...ladder,
    levels: levels.filter((level) => level.ladderId === ladder.id),
    currentLevel: progress.find((p) => p.ladderId === ladder.id)?.currentLevel ?? ladder.startLevel,
    cleanStreak: progress.find((p) => p.ladderId === ladder.id)?.cleanStreak ?? 0,
  }));
}

export async function getStrengthTests() {
  const db = getDb();
  const rows = await db.select().from(schema.strengthTests).orderBy(asc(schema.strengthTests.date));
  return rows.map((row) => ({
    date: row.date,
    metric: row.metric,
    value: toNumber(row.value),
    level: row.level,
  }));
}

export async function getCheckpoints() {
  const db = getDb();
  return db.select().from(schema.checkpoints).orderBy(asc(schema.checkpoints.date));
}

/**
 * Max de tractions courant, qui pilote le format des séances de tirage.
 *
 * Vient du dernier test enregistré, sinon du max de départ déclaré dans le
 * programme. Le « max en forçant » ne compte pas : seul le test propre fait foi.
 */
export async function getPullupMax(fallback = 3): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ value: schema.strengthTests.value, date: schema.strengthTests.date })
    .from(schema.strengthTests)
    .where(eq(schema.strengthTests.metric, "tractions-strictes"))
    .orderBy(desc(schema.strengthTests.date))
    .limit(1);

  const latest = toNumber(rows[0]?.value);
  return latest === null || latest <= 0 ? fallback : Math.round(latest);
}

export async function getTargets() {
  const db = getDb();
  const rows = await db.select().from(schema.targets).orderBy(asc(schema.targets.date));
  return rows.map((row) => ({
    slug: row.slug,
    movement: row.movement,
    unit: row.unit as "reps" | "seconds",
    date: row.date,
    value: row.value,
    startLabel: row.startLabel,
  }));
}

export async function getTestMetrics() {
  const db = getDb();
  return db.select().from(schema.testMetrics).orderBy(asc(schema.testMetrics.orderIndex));
}

export async function getSettings() {
  const db = getDb();
  const rows = await db.select().from(schema.settings).where(eq(schema.settings.id, 1));
  return rows[0] ?? null;
}
