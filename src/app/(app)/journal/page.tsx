import Link from "next/link";
import { Badge, Card, CardTitle, EmptyState, PageHeader, Stat } from "@/components/ui";
import { getPrescribedRange, getProgramBounds, getSessionRecords } from "@/lib/queries";
import {
  adherence,
  adherenceBySlot,
  lateLogging,
  missPatterns,
  streaks,
  MISSED_REASON_LABELS,
  type MissedReason,
  type SessionRecord,
} from "@/lib/domain/adherence";
import { cn, formatDate, today, weekdayName } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const shift = (iso: string, days: number) =>
  new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * DAY).toISOString().slice(0, 10);
/** Lundi de la semaine d'une date : le calendrier s'affiche en colonnes L → D. */
const mondayOf = (iso: string) => shift(iso, -((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7));

/**
 * Journal : calendrier du programme, assiduité, et lecture des absences.
 *
 * Le calendrier n'est pas décoratif : c'est par lui qu'on ouvre un jour passé
 * pour le saisir après coup.
 *
 * Ses bornes viennent du compte. Elles étaient écrites en dur (24 août →
 * 20 décembre) : un programme qui court jusqu'en janvier aurait vu ses cinq
 * dernières semaines absentes du calendrier et de l'assiduité, sans rien
 * d'anormal à l'écran. Le calendrier remonte aussi jusqu'à la première séance
 * enregistrée : l'historique d'un programme remplacé reste consultable.
 */
export default async function JournalPage() {
  const bounds = await getProgramBounds();
  const todayIso = today();
  const programStart = bounds?.startDate ?? todayIso;
  const programEnd = bounds?.endDate ?? todayIso;

  // Tout le journal jusqu'à la fin du programme, historique compris.
  const records = await getSessionRecords("2000-01-01", programEnd);
  const firstLogged = records[0]?.date;
  const calendarStart = mondayOf(firstLogged && firstLogged < programStart ? firstLogged : programStart);
  const programMonday = mondayOf(programStart);

  const prescribed = await getPrescribedRange(calendarStart, programEnd);

  const sessionRecords: SessionRecord[] = records.map((row) => ({
    date: row.date,
    slot: row.slot as SessionRecord["slot"],
    status: row.status as SessionRecord["status"],
    missedReason: row.missedReason as MissedReason | null,
    loggedAt: row.loggedAt?.toISOString() ?? null,
  }));

  const homeCount = records.filter((row) => row.location === "maison").length;

  const stats = adherence(sessionRecords);
  const bySlot = adherenceBySlot(sessionRecords);
  const patterns = missPatterns(sessionRecords);
  const streak = streaks(sessionRecords, today());

  // Une case par jour du programme, avec l'état de ses créneaux.
  const days = new Map<
    string,
    { planned: number; done: number; partial: number; missed: number; isRest: boolean; isTest: boolean }
  >();

  for (const row of prescribed) {
    const entry = days.get(row.date) ?? {
      planned: 0,
      done: 0,
      partial: 0,
      missed: 0,
      isRest: true,
      isTest: false,
    };
    if (!row.isRestDay) {
      entry.planned++;
      entry.isRest = false;
    }
    if (row.isTestDay) entry.isTest = true;
    days.set(row.date, entry);
  }

  for (const row of sessionRecords) {
    // Un jour vécu hors du programme actuel — historique d'un programme
    // remplacé, séance libre — reste affiché : ce qui a été fait ne disparaît
    // pas du calendrier parce que la prescription a changé.
    const entry = days.get(row.date) ?? {
      planned: 0,
      done: 0,
      partial: 0,
      missed: 0,
      isRest: false,
      isTest: false,
    };
    days.set(row.date, entry);
    if (row.status === "done") entry.done++;
    if (row.status === "partial") entry.partial++;
    if (row.status === "missed") entry.missed++;
  }

  const weeks: string[][] = [];
  let cursor = calendarStart;
  while (cursor <= programEnd) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = shift(cursor, 1);
    }
    weeks.push(week);
  }

  /** Numéro de semaine du programme ; rien pour l'historique qui le précède. */
  const weekLabel = (monday: string) => {
    const n = Math.round((Date.parse(monday) - Date.parse(programMonday)) / (7 * DAY)) + 1;
    return n >= 1 ? `S${n}` : "";
  };

  return (
    <>
      <PageHeader
        title="Journal"
        subtitle="Le programme jour par jour. Touche un jour passé pour l'enregistrer après coup."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <Stat label="Assiduité" value={stats.rate} unit="%" tone={stats.rate >= 80 ? "success" : "warning"} />
        </Card>
        <Card>
          <Stat label="Séances faites" value={stats.done + stats.partial} hint={`${stats.missed} manquées`} />
        </Card>
        <Card>
          <Stat label="Série en cours" value={streak.current} unit="j" hint={`record ${streak.best} j`} />
        </Card>
        <Card>
          <Stat
            label="Séances à la maison"
            value={homeCount}
            hint="comptent pour l'assiduité"
          />
        </Card>
      </div>

      <Card className="mb-4">
        <CardTitle hint="Vert : faite · orange : partielle · rouge : manquée · gris : à venir">
          Calendrier du programme
        </CardTitle>

        <div className="scroll-x -mx-1 px-1">
          <div className="min-w-[420px]">
            <div className="mb-1 grid grid-cols-8 gap-1 text-[10px] text-faint">
              <span />
              {["L", "M", "M", "J", "V", "S", "D"].map((letter, i) => (
                <span key={i} className="text-center">
                  {letter}
                </span>
              ))}
            </div>

            {weeks.map((week) => (
              <div key={week[0]} className="mb-1 grid grid-cols-8 items-center gap-1">
                <span className="text-[10px] text-faint tabular-nums">{weekLabel(week[0])}</span>
                {week.map((date) => {
                  const entry = days.get(date);
                  const isFuture = date > todayIso;
                  const isToday = date === todayIso;

                  let tone = "bg-raised";
                  if (!entry) tone = "bg-transparent";
                  else if (entry.isRest) tone = "bg-border/40";
                  else if (entry.missed > 0) tone = "bg-danger/70";
                  // Un jour vécu sans prescription (historique) n'a rien à
                  // compléter : fait, il est vert.
                  else if (entry.done + entry.partial > 0 && entry.done + entry.partial >= entry.planned)
                    tone = "bg-success/80";
                  else if (entry.done + entry.partial > 0) tone = "bg-warning/70";

                  return (
                    <Link
                      key={date}
                      href={`/seance/${date}`}
                      title={`${weekdayName(date)} ${formatDate(date)}`}
                      className={cn(
                        "grid aspect-square place-items-center rounded text-[10px] tabular-nums transition-transform hover:scale-110",
                        tone,
                        isFuture && "opacity-40",
                        isToday && "ring-2 ring-accent",
                        entry?.isTest && "ring-1 ring-soir",
                      )}
                    >
                      {new Date(`${date}T00:00:00Z`).getUTCDate()}
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle hint="Le programme dit : si tu dois en sauter un, saute le soir.">
            Assiduité par créneau
          </CardTitle>
          <ul className="space-y-3">
            {(["salle", "matin", "soir"] as const).map((slot) => {
              const slotStats = bySlot[slot];
              const label = slot === "salle" ? "Salle (22h)" : slot === "matin" ? "Matin (avant 7h)" : "Soir (maison)";
              return (
                <li key={slot}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-muted">{label}</span>
                    <span className="tabular-nums">
                      {slotStats.done + slotStats.partial}/{slotStats.done + slotStats.partial + slotStats.missed}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-raised">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        slot === "salle" ? "bg-salle" : slot === "matin" ? "bg-matin" : "bg-soir",
                      )}
                      style={{ width: `${slotStats.rate}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card>
          <CardTitle hint="Une absence expliquée est une information, pas un échec.">
            Séances manquées
          </CardTitle>

          {patterns.reasonCounts.length === 0 ? (
            <EmptyState title="Aucune séance manquée" detail="Rien à analyser pour l'instant." />
          ) : (
            <>
              {patterns.insight ? (
                <p className="mb-3 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning">
                  {patterns.insight}
                </p>
              ) : null}

              <ul className="space-y-2">
                {patterns.reasonCounts.map(({ reason, count, label }) => (
                  <li key={reason} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{label}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
              </ul>

              {patterns.weekdayCounts.length > 0 ? (
                <p className="mt-3 text-xs text-faint">
                  Jour le plus sauté : {patterns.weekdayCounts[0].weekday} ({patterns.weekdayCounts[0].count})
                </p>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardTitle hint="Les séances saisies après coup portent la date de leur saisie ; leurs charges comptent comme les autres.">
          Dernières séances enregistrées
        </CardTitle>

        {sessionRecords.length === 0 ? (
          <EmptyState title="Aucune séance enregistrée" detail="Commence par la séance du jour." />
        ) : (
          <ul className="divide-y divide-border">
            {[...sessionRecords]
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 12)
              .map((row) => {
                const late = lateLogging(row.date, row.loggedAt);
                return (
                  <li key={`${row.date}-${row.slot}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link href={`/seance/${row.date}`} className="font-medium hover:text-accent">
                      {formatDate(row.date, { withWeekday: true })}
                    </Link>
                    <Badge tone={row.slot}>{row.slot}</Badge>
                    <Badge
                      tone={
                        row.status === "done"
                          ? "success"
                          : row.status === "partial"
                            ? "warning"
                            : row.status === "missed"
                              ? "danger"
                              : "neutral"
                      }
                    >
                      {row.status === "done"
                        ? "faite"
                        : row.status === "partial"
                          ? "partielle"
                          : row.status === "missed"
                            ? `manquée${row.missedReason ? ` — ${MISSED_REASON_LABELS[row.missedReason]}` : ""}`
                            : "déplacée"}
                    </Badge>
                    {records.find((r) => r.date === row.date && r.slot === row.slot)?.location ===
                    "maison" ? (
                      <Badge tone="soir">maison</Badge>
                    ) : null}
                    {late.isLate ? <Badge>{late.label}</Badge> : null}
                  </li>
                );
              })}
          </ul>
        )}
      </Card>
    </>
  );
}
