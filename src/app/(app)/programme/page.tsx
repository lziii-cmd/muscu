import Link from "next/link";
import { Badge, Card, CardTitle, PageHeader, Stat } from "@/components/ui";
import { getProgramOverview } from "@/lib/queries";
import { cn, formatDate, today } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Le programme entier, semaine par semaine et jour par jour.
 *
 * L'écran d'accueil ouvre sur aujourd'hui, ce qui donne l'impression que le
 * programme commence là. Cette page montre les 17 semaines d'un coup, avec ce
 * qui est prévu, ce qui est fait, et ce qui reste à saisir — chaque jour étant
 * cliquable pour l'enregistrer, même a posteriori.
 */
export default async function ProgrammePage() {
  const { weeks, sessions, logged } = await getProgramOverview();
  const todayIso = today();

  // Une clé par jour et par créneau, pour retrouver l'état de saisie.
  const loggedByKey = new Map(logged.map((row) => [`${row.date}:${row.slot}`, row]));

  const weekNumbers = [...new Set(sessions.map((s) => s.weekNumber))].sort((a, b) => a - b);

  const byDate = new Map<string, typeof sessions>();
  for (const session of sessions) {
    if (!byDate.has(session.date)) byDate.set(session.date, []);
    byDate.get(session.date)!.push(session);
  }

  const prescribed = sessions.filter((s) => !s.isRestDay);
  const done = prescribed.filter((s) => {
    const entry = loggedByKey.get(`${s.date}:${s.slot}`);
    return entry?.status === "done" || entry?.status === "partial";
  });
  const missedPast = prescribed.filter((s) => {
    if (s.date >= todayIso) return false;
    return !loggedByKey.has(`${s.date}:${s.slot}`);
  });

  return (
    <>
      <PageHeader
        title="Programme"
        subtitle="Les 17 semaines, jour par jour. Touche n'importe quel jour pour l'enregistrer, même passé."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <Stat label="Séances prévues" value={prescribed.length} />
        </Card>
        <Card>
          <Stat label="Enregistrées" value={done.length} tone="success" />
        </Card>
        <Card>
          <Stat
            label="Passées non saisies"
            value={missedPast.length}
            tone={missedPast.length > 0 ? "warning" : "neutral"}
          />
        </Card>
        <Card>
          <Stat label="Semaines" value={weekNumbers.length} hint="24 août → 20 décembre" />
        </Card>
      </div>

      {missedPast.length > 0 ? (
        <Card className="mb-4">
          <CardTitle hint="Elles restent saisissables : la séance portera un badge « enregistré avec du retard ».">
            À rattraper
          </CardTitle>
          <ul className="flex flex-wrap gap-2">
            {missedPast.slice(0, 12).map((session) => (
              <li key={`${session.date}-${session.slot}`}>
                <Link
                  href={`/seance/${session.date}`}
                  className="tap flex items-center gap-2 rounded-full border border-warning/40 bg-warning/5 px-3 text-sm text-warning"
                >
                  {formatDate(session.date, { withWeekday: true })}
                  <span className="text-xs opacity-80">{session.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          {missedPast.length > 12 ? (
            <p className="mt-2 text-xs text-faint">
              et {missedPast.length - 12} autres, accessibles depuis le calendrier ci-dessous.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="space-y-4">
        {weekNumbers.map((weekNumber) => {
          const weekInfo = weeks.filter((w) => w.weekNumber === weekNumber);
          const gym = weekInfo.find((w) => w.programCode === "ppl");
          const cali = weekInfo.find((w) => w.programCode === "calisthenie");

          const dates = [
            ...new Set(sessions.filter((s) => s.weekNumber === weekNumber).map((s) => s.date)),
          ].sort();

          const isCurrent = dates.some((d) => d === todayIso);

          return (
            <Card key={weekNumber} className={cn(isCurrent && "border-accent/50")}>
              <CardTitle
                hint={gym?.startDate ? `${formatDate(gym.startDate)} → ${formatDate(gym.endDate!)}` : undefined}
                action={isCurrent ? <Badge tone="accent">semaine en cours</Badge> : undefined}
              >
                Semaine {weekNumber} — {gym?.blockName ?? cali?.blockName}
              </CardTitle>

              {gym?.instruction ? (
                <p className="mb-3 border-l-2 border-accent/50 pl-3 text-sm text-muted">
                  {gym.instruction}
                </p>
              ) : null}

              <ul className="divide-y divide-border">
                {dates.map((date) => {
                  const daySessions = byDate.get(date) ?? [];
                  const isToday = date === todayIso;
                  const isFuture = date > todayIso;

                  return (
                    <li key={date}>
                      <Link
                        href={`/seance/${date}`}
                        className={cn(
                          "flex flex-wrap items-center gap-2 py-2.5 text-sm hover:text-accent",
                          isFuture && "opacity-60",
                        )}
                      >
                        <span
                          className={cn(
                            "w-36 shrink-0 font-medium",
                            isToday && "text-accent",
                          )}
                        >
                          {formatDate(date, { withWeekday: true })}
                        </span>

                        {daySessions.map((session) => {
                          const entry = loggedByKey.get(`${session.date}:${session.slot}`);
                          const tone =
                            entry?.status === "done"
                              ? "success"
                              : entry?.status === "partial"
                                ? "warning"
                                : entry?.status === "missed"
                                  ? "danger"
                                  : session.isRestDay
                                    ? "neutral"
                                    : session.slot;

                          return (
                            <Badge
                              key={`${session.slot}-${session.programCode}`}
                              tone={tone as "success" | "warning" | "danger" | "neutral" | "salle" | "matin" | "soir"}
                            >
                              {session.isRestDay
                                ? "repos"
                                : `${session.label}${session.exerciseCount > 0 ? ` · ${session.exerciseCount}` : ""}`}
                              {entry?.location === "maison" ? " · maison" : ""}
                            </Badge>
                          );
                        })}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}
