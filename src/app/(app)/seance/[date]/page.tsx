import { notFound } from "next/navigation";
import { DayView } from "@/components/day-view";

/**
 * Séance d'une date quelconque.
 *
 * C'est par ici que passe la saisie rétroactive : on ouvre un jour passé depuis
 * le calendrier et on l'enregistre. L'écart entre la date de séance et la date
 * de saisie produit le badge « enregistré avec du retard ».
 */
export default async function SessionPage(props: PageProps<"/seance/[date]">) {
  const { date } = await props.params;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  return <DayView date={date} />;
}
