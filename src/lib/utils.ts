import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/**
 * Toutes les dates de l'application sont des chaînes ISO `YYYY-MM-DD` traitées
 * en UTC. Le programme est daté au jour près et l'utilisateur est au Sénégal
 * (UTC+0) : passer par le fuseau local ferait glisser les séances d'un jour
 * selon l'appareil.
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseIso(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function weekdayName(date: string): string {
  return WEEKDAYS[parseIso(date).getUTCDay()];
}

export function formatDate(date: string, options?: { withWeekday?: boolean; short?: boolean }) {
  const d = parseIso(date);
  const day = d.getUTCDate();
  const month = MONTHS[d.getUTCMonth()];
  const base = options?.short ? `${day} ${month.slice(0, 4)}.` : `${day} ${month}`;
  return options?.withWeekday ? `${weekdayName(date)} ${base}` : base;
}

export function addDays(date: string, days: number): string {
  return new Date(parseIso(date).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

/** Lundi de la semaine contenant `date`. */
export function startOfWeek(date: string): string {
  const d = parseIso(date);
  const day = d.getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function formatSeconds(seconds: number): string {
  if (seconds === 0) return "enchaîner";
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Affiche une charge sans décimale inutile : 32,5 kg mais 30 kg. */
export function formatKg(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "--";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "--";
  return `${n % 1 === 0 ? n : n.toFixed(1).replace(".", ",")} kg`;
}

export function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

export const SLOT_LABELS = {
  salle: "Salle",
  matin: "Matin",
  soir: "Soir",
} as const;

export type Slot = keyof typeof SLOT_LABELS;
