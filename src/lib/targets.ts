/**
 * Dates structurantes du programme.
 *
 * Seules les dates vivent ici : elles encadrent le programme et servent au
 * calendrier. Les objectifs chiffrés et les métriques de test viennent de la
 * base — ils sont extraits du document et changent à chaque révision, les figer
 * dans le code les laisserait périmés.
 */

export const PROGRAM_START = "2026-08-24";
export const PROGRAM_END = "2026-12-20";

/** Les quatre samedis de test de force et de contrôle physique. */
export const CHECKPOINT_DATES = ["2026-09-19", "2026-10-17", "2026-11-14", "2026-12-19"] as const;

/** Mesures relevées lors des contrôles physiques. */
export const CHECKPOINT_LIFTS = [
  { slug: "couche", label: "Couché — meilleure série" },
  { slug: "squat", label: "Squat — meilleure série" },
  { slug: "sdt_roumain", label: "SDT roumain — meilleure série" },
] as const;
