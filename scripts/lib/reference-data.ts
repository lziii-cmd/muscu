/**
 * Données de référence transcrites du document de diète.
 *
 * Les échelles de progression, les objectifs jalonnés et les métriques de test
 * ne sont PLUS ici : ils sont extraits du document de calisthénie par
 * `scripts/lib/cali-reference.ts`. Les transcrire à la main les laissait
 * silencieusement périmés à chaque révision du programme.
 *
 * Source : 3-diete-senegal.pdf, « Les meilleures protéines par franc dépensé ».
 */

export interface FoodSeed {
  slug: string;
  name: string;
  portionLabel: string;
  proteinG: number;
  kcal: number | null;
  priceFcfa: number | null;
  note: string;
}

/**
 * Aliments du marché local, classés par rapport qualité/prix comme dans le
 * document de diète. Les prix sont indicatifs et varient selon le marché.
 */
export const FOODS: FoodSeed[] = [
  {
    slug: "yaboy",
    name: "Yaboy / sardinelle",
    portionLabel: "100 g",
    proteinG: 21,
    kcal: 208,
    priceFcfa: 125,
    note: "Le meilleur rapport du pays. Riche en oméga-3. À manger 4-5 fois par semaine.",
  },
  {
    slug: "oeuf",
    name: "Œuf",
    portionLabel: "1 œuf",
    proteinG: 6,
    kcal: 78,
    priceFcfa: 125,
    note: "Imbattable en praticité. 3-4 par jour sans problème.",
  },
  {
    slug: "niebe",
    name: "Niébé (haricot local)",
    portionLabel: "100 g sec",
    proteinG: 23,
    kcal: 336,
    priceFcfa: 100,
    note: "Très bon marché, rassasiant. À combiner avec du riz ou du mil.",
  },
  {
    slug: "maquereau",
    name: "Maquereau frais",
    portionLabel: "100 g",
    proteinG: 19,
    kcal: 205,
    priceFcfa: 175,
    note: "Excellent, gras utile.",
  },
  {
    slug: "lait-caille",
    name: "Lait caillé nature (soow)",
    portionLabel: "250 ml",
    proteinG: 8,
    kcal: 150,
    priceFcfa: 125,
    note: "Parfait en collation. Nature, sans sucre ajouté.",
  },
  {
    slug: "poulet",
    name: "Poulet (cuisses)",
    portionLabel: "100 g",
    proteinG: 27,
    kcal: 172,
    priceFcfa: 300,
    note: "Bon, mais plus cher. 2 fois par semaine.",
  },
  {
    slug: "thon-boite",
    name: "Thon en boîte (à l'eau)",
    portionLabel: "1 boîte",
    proteinG: 26,
    kcal: 120,
    priceFcfa: 850,
    note: "Le dépannage parfait après la séance de 23h.",
  },
  {
    slug: "lentilles",
    name: "Lentilles",
    portionLabel: "100 g sec",
    proteinG: 24,
    kcal: 353,
    priceFcfa: 120,
    note: "Bonne alternative au niébé.",
  },
  {
    slug: "arachides",
    name: "Arachides",
    portionLabel: "30 g",
    proteinG: 7.5,
    kcal: 171,
    priceFcfa: 50,
    note: "570 kcal / 100 g. Une poignée max (30 g), pas plus.",
  },
  {
    slug: "riz-cuit",
    name: "Riz cuit",
    portionLabel: "150 g (1 poing)",
    proteinG: 4,
    kcal: 195,
    priceFcfa: 100,
    note: "Le riz n'est pas le problème, la montagne de riz l'est.",
  },
  {
    slug: "thiere",
    name: "Thiéré (couscous de mil)",
    portionLabel: "150 g cuit",
    proteinG: 5,
    kcal: 180,
    priceFcfa: 100,
    note: "Bonne alternative au riz le soir.",
  },
  {
    slug: "tapalapa",
    name: "Tapalapa",
    portionLabel: "1/4 de pain",
    proteinG: 5,
    kcal: 160,
    priceFcfa: 50,
    note: "En quantité mesurée au petit-déjeuner.",
  },
  {
    slug: "patate-douce",
    name: "Patate douce",
    portionLabel: "150 g",
    proteinG: 2,
    kcal: 130,
    priceFcfa: 75,
    note: "Glucides du soir, rassasiants.",
  },
  {
    slug: "whey",
    name: "Whey protéine",
    portionLabel: "1 dose (30 g)",
    proteinG: 24,
    kcal: 100,
    priceFcfa: null,
    note: "Pratique pour le post-séance de minuit. Pas indispensable.",
  },
];

/** Journée type d'un jour de salle, du document de diète. */
export const MEAL_TEMPLATE: {
  slot: string;
  time: string;
  content: string;
  proteinG: number;
  foods: { slug: string; portions: number }[];
}[] = [
  {
    slot: "petit_dejeuner",
    time: "07h00",
    content: "3 œufs (durs ou omelette 1 c.à.s d'huile) + 1/4 de tapalapa + café/thé sans sucre",
    proteinG: 22,
    foods: [
      { slug: "oeuf", portions: 3 },
      { slug: "tapalapa", portions: 1 },
    ],
  },
  {
    slot: "collation_matin",
    time: "11h00",
    content: "250 ml de lait caillé nature + 1 fruit",
    proteinG: 9,
    foods: [{ slug: "lait-caille", portions: 1 }],
  },
  {
    slot: "dejeuner",
    time: "14h00",
    content:
      "Plat familial ajusté : 1 poing de riz, double portion de poisson, légumes à volonté, huile réduite",
    proteinG: 35,
    foods: [
      { slug: "yaboy", portions: 1.5 },
      { slug: "riz-cuit", portions: 1 },
    ],
  },
  {
    slot: "collation_apres_midi",
    time: "17h30",
    content: "2 œufs durs, ou 1 poignée d'arachides (30 g), ou 1 boîte de thon",
    proteinG: 15,
    foods: [{ slug: "oeuf", portions: 2 }],
  },
  {
    slot: "diner",
    time: "20h00",
    content: "Poisson ou poulet + thiéré ou patate douce + légumes",
    proteinG: 35,
    foods: [
      { slug: "maquereau", portions: 1.5 },
      { slug: "thiere", portions: 1 },
    ],
  },
  {
    slot: "post_seance",
    time: "00h15",
    content: "Léger et protéiné : lait caillé + 2 œufs, ou 1 boîte de thon, ou shaker de whey",
    proteinG: 25,
    foods: [
      { slug: "lait-caille", portions: 1 },
      { slug: "oeuf", portions: 2 },
    ],
  },
];
