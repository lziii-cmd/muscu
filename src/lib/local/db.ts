"use client";

import Dexie, { type Table } from "dexie";

/*
 * Couche locale : IndexedDB via Dexie.
 *
 * Pourquoi elle existe
 * --------------------
 * La séance de salle est à 23h, au Sénégal, avec un réseau mobile qui peut
 * lâcher. Une saisie perdue parce que la 4G a coupé entre deux séries est
 * inacceptable : c'est le cas d'usage central de l'application.
 *
 * Comment ça marche
 * -----------------
 * Toute écriture va d'abord ici, puis dans une file d'attente (`outbox`) qui
 * est vidée vers le serveur dès que le réseau revient. Le serveur reste la
 * source de vérité : iOS peut purger le stockage d'une PWA après plusieurs
 * semaines sans ouverture, donc le local n'est qu'un tampon.
 *
 * Le référentiel (programme, exercices) est mis en cache ici pour que la séance
 * du jour s'affiche sans réseau.
 */

export interface CachedSession {
  /** `${date}:${slot}` */
  key: string;
  date: string;
  slot: "salle" | "matin" | "soir";
  payload: unknown;
  cachedAt: number;
}

export type MutationKind =
  | "session.upsert"
  | "session.miss"
  | "bodyweight.upsert"
  | "measurement.upsert"
  | "meal.upsert"
  | "oil.upsert"
  | "water.upsert"
  | "rice.upsert"
  | "sleep.upsert"
  | "pain.add"
  | "test.upsert"
  | "ladder.upsert";

export interface OutboxEntry {
  /** Identifiant généré côté client : rend le rejeu idempotent. */
  id: string;
  kind: MutationKind;
  payload: unknown;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

class MuscuDatabase extends Dexie {
  cachedSessions!: Table<CachedSession, string>;
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super("muscu");
    this.version(1).stores({
      cachedSessions: "key, date, slot",
      outbox: "id, createdAt, kind",
      meta: "key",
    });
  }
}

let instance: MuscuDatabase | null = null;

export function localDb(): MuscuDatabase {
  if (!instance) instance = new MuscuDatabase();
  return instance;
}

/** Identifiant de mutation : horodatage + aléa, trié naturellement. */
export function mutationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Met une mutation en file d'attente et tente de la pousser tout de suite.
 * L'appelant n'attend jamais le réseau : l'écriture locale suffit à considérer
 * la saisie comme acquise.
 */
export async function enqueue(kind: MutationKind, payload: unknown): Promise<string> {
  const id = mutationId();
  await localDb().outbox.put({ id, kind, payload, createdAt: Date.now(), attempts: 0 });
  void flushOutbox();
  return id;
}

let flushing = false;

/**
 * Vide la file d'attente vers le serveur.
 *
 * Les mutations partent dans l'ordre de création. Une mutation qui échoue
 * bloque la file plutôt que d'être sautée : l'ordre porte du sens (créer une
 * séance avant d'y ajouter des exercices).
 */
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  if (typeof navigator !== "undefined" && !navigator.onLine) return { sent: 0, failed: 0 };

  flushing = true;
  let sent = 0;
  let failed = 0;

  try {
    const pending = await localDb().outbox.orderBy("createdAt").toArray();

    for (const entry of pending) {
      try {
        const response = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id, kind: entry.kind, payload: entry.payload }),
        });

        if (response.ok) {
          await localDb().outbox.delete(entry.id);
          sent++;
          continue;
        }

        // Une requête rejetée pour cause de données invalides ne passera jamais :
        // la retirer évite de bloquer la file indéfiniment.
        if (response.status === 400 || response.status === 422) {
          await localDb().outbox.delete(entry.id);
          failed++;
          continue;
        }

        await localDb().outbox.update(entry.id, {
          attempts: entry.attempts + 1,
          lastError: `HTTP ${response.status}`,
        });
        failed++;
        break;
      } catch (error) {
        await localDb().outbox.update(entry.id, {
          attempts: entry.attempts + 1,
          lastError: error instanceof Error ? error.message : "réseau",
        });
        failed++;
        break;
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed };
}

export async function pendingCount(): Promise<number> {
  return localDb().outbox.count();
}

/** Met en cache une séance pour qu'elle reste consultable hors-ligne. */
export async function cacheSession(
  date: string,
  slot: CachedSession["slot"],
  payload: unknown,
): Promise<void> {
  await localDb().cachedSessions.put({
    key: `${date}:${slot}`,
    date,
    slot,
    payload,
    cachedAt: Date.now(),
  });
}

export async function readCachedSession(
  date: string,
  slot: CachedSession["slot"],
): Promise<unknown | null> {
  const row = await localDb().cachedSessions.get(`${date}:${slot}`);
  return row?.payload ?? null;
}
