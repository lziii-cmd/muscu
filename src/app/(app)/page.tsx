import { DayView } from "@/components/day-view";
import { today } from "@/lib/utils";

/**
 * Écran d'accueil : la séance du jour.
 *
 * La date est calculée au rendu, côté serveur, puis passée au client : cela
 * évite un décalage d'un jour si l'horloge du téléphone est mal réglée.
 */
export default function HomePage() {
  return <DayView date={today()} />;
}
