import {
  boolean,
  date,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/*
 * Conventions
 * -----------
 * - Tables et colonnes en snake_case.
 * - Charges en kg (numeric 6,2), tenues et repos en secondes, poids en kg.
 * - Le référentiel (programme, exercices, échelles) est semé et lu seul ;
 *   le journal est écrit par l'application.
 * - Chaque table du journal porte un `user_id` : deux personnes utilisent
 *   l'application, avec chacune son programme et ses données.
 */

// ---------------------------------------------------------------------------
// Énumérations
// ---------------------------------------------------------------------------

/** Créneau d'une séance dans la journée. */
export const slotEnum = pgEnum("slot", ["salle", "matin", "soir", "libre"]);

/** Unité de mesure d'un exercice : répétitions ou tenue isométrique. */
export const exerciseUnitEnum = pgEnum("exercise_unit", ["reps", "seconds"]);

export const sessionStatusEnum = pgEnum("session_status", [
  "planned",
  "in_progress",
  "done",
  "partial",
  "missed",
  "moved",
]);

/**
 * Motifs d'absence. Liste fermée pour rendre les statistiques exploitables ;
 * un commentaire libre reste possible à côté.
 */
export const missedReasonEnum = pgEnum("missed_reason", [
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
]);

/** Pourquoi un exercice précis n'a pas été fait dans une séance réalisée. */
export const skipReasonEnum = pgEnum("skip_reason", [
  "machine_occupee",
  "douleur",
  "manque_de_temps",
  "remplace",
  "autre",
]);

/**
 * Où la séance a eu lieu.
 *
 * Le programme fournit une alternative maison pour chaque exercice, afin de
 * déplacer une séance plutôt que de la rater. Mais il précise aussi que les deux
 * ne se comparent pas : « ta progression en charge se mesure sur les séances de
 * salle uniquement ». D'où ce champ, qui sert à exclure les séances maison des
 * analyses de charge.
 */
export const sessionLocationEnum = pgEnum("session_location", ["salle", "maison"]);

/** Une charge n'a pas le même sens selon qu'elle est sur barre ou par haltère. */
export const loadUnitEnum = pgEnum("load_unit", ["barre_machine", "kg_par_haltere", "poids_du_corps"]);

export const mealSlotEnum = pgEnum("meal_slot", [
  "petit_dejeuner",
  "collation_matin",
  "dejeuner",
  "collation_apres_midi",
  "diner",
  "post_seance",
]);

export const measurementKindEnum = pgEnum("measurement_kind", [
  "taille",
  "bras",
  "cuisse",
  "poitrine",
]);

export const photoAngleEnum = pgEnum("photo_angle", ["face", "profil", "dos"]);

// ---------------------------------------------------------------------------
// Comptes
// ---------------------------------------------------------------------------

/** Rôle du compte : un administrateur gère les comptes, il ne s'entraîne pas forcément. */
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

/**
 * Comptes de l'application.
 *
 * Chaque personne a son propre programme et son propre journal : rien n'est
 * partagé entre comptes, hormis le catalogue d'exercices et la table des
 * aliments, qui sont des référentiels neutres.
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    displayName: text("display_name").notNull(),
    role: userRoleEnum("role").default("user").notNull(),
    /**
     * Vrai tant que le mot de passe est celui posé à la création du compte.
     * Sert à afficher un rappel : un mot de passe initial connu de plusieurs
     * personnes n'en est plus un.
     */
    usesDefaultPassword: boolean("uses_default_password").default(true).notNull(),
    /**
     * Stature, en centimètres. À ne pas confondre avec la mensuration
     * « tour de taille » : celle-ci change avec l'entraînement, celle-là non.
     * Sert à l'IMC et au rapport tour de taille / stature, plus parlant que le
     * poids seul en recomposition.
     */
    heightCm: numeric("height_cm", { precision: 4, scale: 1 }),
    /** Date de naissance, pour l'âge. Facultative. */
    birthDate: date("birth_date"),
    /** Poids visé, s'il y en a un. Affiché en repère sur la courbe de poids. */
    targetWeightKg: numeric("target_weight_kg", { precision: 5, scale: 2 }),
    /** Objectif protéines, en grammes par kg de poids de corps. */
    proteinPerKgLow: numeric("protein_per_kg_low", { precision: 3, scale: 1 }).default("1.8").notNull(),
    proteinPerKgHigh: numeric("protein_per_kg_high", { precision: 3, scale: 1 })
      .default("2.2")
      .notNull(),
    waterTargetLiters: numeric("water_target_liters", { precision: 3, scale: 1 })
      .default("3.5")
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("users_username_key").on(table.username)],
);

// ---------------------------------------------------------------------------
// Référentiel des exercices
// ---------------------------------------------------------------------------

export const exercises = pgTable(
  "exercises",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** "push" | "pull" | "legs" | "core" | "mobilite" ... */
    muscleGroup: text("muscle_group"),
    /** "barre" | "machine" | "haltere" | "poulie" | "poids_du_corps" */
    equipment: text("equipment"),
    unit: exerciseUnitEnum("unit").default("reps").notNull(),
    isBodyweight: boolean("is_bodyweight").default(false).notNull(),
    /**
     * Libellé de l'unité mesurée : « reps », « sauts », « mètres », « minutes ».
     * Permet de suivre une corde à sauter ou une course sans forcer le vocabulaire
     * de la musculation.
     */
    measureLabel: text("measure_label").default("reps").notNull(),
    /** Créé par l'utilisateur, hors programme. */
    isCustom: boolean("is_custom").default(false).notNull(),
  },
  (table) => [uniqueIndex("exercises_slug_key").on(table.slug)],
);

/**
 * Fiche d'exécution d'un exercice, pour un compte.
 *
 * Elle est portée par le compte et non par le catalogue partagé, parce qu'un
 * même mouvement ne s'explique pas de la même façon selon le matériel : le hip
 * thrust se fait dos à un banc en salle et dos au canapé à la maison. Écrire la
 * fiche sur l'exercice ferait gagner la dernière personne importée, et donnerait
 * à l'autre des consignes pour du matériel qu'elle n'a pas.
 */
export const exerciseGuides = pgTable(
  "exercise_guides",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    /** Placement de départ : appuis, prise, orientation. */
    position: text("position"),
    /** Le mouvement lui-même, descente comprise. */
    execution: text("execution"),
    /** Ce qui rend l'exercice inutile ou dangereux. */
    commonMistake: text("common_mistake"),
    /** Sensation attendue, repère de réussite, variante plus facile. */
    note: text("note"),
    /** Vrai quand la fiche vient du document du compte plutôt que du fonds commun. */
    fromProgram: boolean("from_program").default(false).notNull(),
  },
  (table) => [uniqueIndex("exercise_guides_unique").on(table.userId, table.exerciseId)],
);

// ---------------------------------------------------------------------------
// Échelles de progression (calisthénie)
// ---------------------------------------------------------------------------

export const ladders = pgTable(
  "ladders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** Niveau de départ, signalé en gras dans le document source. */
    startLevel: integer("start_level").default(1).notNull(),
  },
  (table) => [uniqueIndex("ladders_slug_key").on(table.userId, table.slug)],
);

export const ladderLevels = pgTable(
  "ladder_levels",
  {
    id: serial("id").primaryKey(),
    ladderId: integer("ladder_id")
      .notNull()
      .references(() => ladders.id, { onDelete: "cascade" }),
    level: integer("level").notNull(),
    movement: text("movement").notNull(),
    /** Critère chiffré de validation, ex. « 3 × 12 » ou « 4 × 15 s ». */
    criterion: text("criterion").notNull(),
  },
  (table) => [uniqueIndex("ladder_levels_unique").on(table.ladderId, table.level)],
);

/**
 * Niveau courant sur chaque échelle.
 *
 * Le critère de passage du programme est « réussir proprement deux séances de
 * suite » : `cleanStreak` compte ces séances propres consécutives, et le
 * passage est proposé quand il atteint 2.
 */
export const ladderProgress = pgTable("ladder_progress", {
  ladderId: integer("ladder_id")
    .primaryKey()
    .references(() => ladders.id, { onDelete: "cascade" }),
  currentLevel: integer("current_level").default(1).notNull(),
  cleanStreak: integer("clean_streak").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Programme (référentiel semé)
// ---------------------------------------------------------------------------

export const programs = pgTable(
  "programs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Identifiant court, propre au compte : « ppl », « calisthenie », « maison ». */
    code: text("code").notNull(),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
  },
  (table) => [uniqueIndex("programs_code_key").on(table.userId, table.code)],
);

export const programWeeks = pgTable(
  "program_weeks",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    blockName: text("block_name").notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    instruction: text("instruction"),
  },
  (table) => [uniqueIndex("program_weeks_unique").on(table.programId, table.weekNumber)],
);

/**
 * Une séance prescrite.
 *
 * Le programme de salle produit une séance par jour (créneau « salle ») ;
 * la calisthénie en produit deux (« matin » et « soir »).
 */
export const programSessions = pgTable(
  "program_sessions",
  {
    id: serial("id").primaryKey(),
    programId: integer("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    date: date("date").notNull(),
    slot: slotEnum("slot").notNull(),
    /** "PUSH A", "LEGS B", "TIRAGE -- force", ... */
    label: text("label").notNull(),
    heading: text("heading"),
    isRestDay: boolean("is_rest_day").default(false).notNull(),
    isTestDay: boolean("is_test_day").default(false).notNull(),
  },
  (table) => [
    uniqueIndex("program_sessions_unique").on(table.programId, table.date, table.slot),
    index("program_sessions_date_idx").on(table.date),
  ],
);

export const programExercises = pgTable(
  "program_exercises",
  {
    id: serial("id").primaryKey(),
    programSessionId: integer("program_session_id")
      .notNull()
      .references(() => programSessions.id, { onDelete: "cascade" }),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    /** "1", "2", "4a", "4b" — le libellé du document. */
    orderLabel: text("order_label").notNull(),
    orderIndex: integer("order_index").notNull(),
    /** "4" pour les lignes 4a et 4b : elles s'enchaînent sans repos. */
    supersetGroup: text("superset_group"),
    sets: integer("sets"),
    repsLow: integer("reps_low"),
    repsHigh: integer("reps_high"),
    /**
     * Tenue isométrique, bornes basse et haute. Une fourchette « 20-30 s » n'est
     * pas une tenue de 30 s : n'en garder que la borne haute durcit la consigne.
     */
    holdSecondsLow: integer("hold_seconds_low"),
    holdSecondsHigh: integer("hold_seconds_high"),
    /**
     * Répétitions déduites du max courant : max - `maxOffset`.
     * Le décalage vaut 1 les jours de force et 2 le jeudi, journée de volume
     * volontairement plus légère. Le confondre donne deux journées lourdes.
     */
    maxOffset: integer("max_offset"),
    perSide: boolean("per_side").default(false).notNull(),
    /** Texte du document : « 30 kg », « Poids du corps », « Barre à vide (20 kg) ». */
    loadRaw: text("load_raw"),
    loadKg: numeric("load_kg", { precision: 6, scale: 2 }),
    dumbbellRaw: text("dumbbell_raw"),
    dumbbellKg: numeric("dumbbell_kg", { precision: 6, scale: 2 }),
    restSeconds: integer("rest_seconds"),
    cue: text("cue"),
    /** Équivalent réalisable à la maison, fourni par le programme. */
    homeAlternative: text("home_alternative"),
  },
  (table) => [index("program_exercises_session_idx").on(table.programSessionId)],
);

// ---------------------------------------------------------------------------
// Journal réel
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programSessionId: integer("program_session_id").references(() => programSessions.id),
    /** Date à laquelle la séance a eu lieu. */
    date: date("date").notNull(),
    slot: slotEnum("slot").notNull(),
    /** Titre libre, pour une séance hors programme. */
    title: text("title"),
    status: sessionStatusEnum("status").default("planned").notNull(),
    location: sessionLocationEnum("location").default("salle").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationSeconds: integer("duration_seconds"),
    /** Ressenti global 1-10. */
    rpe: integer("rpe"),
    note: text("note"),
    missedReason: missedReasonEnum("missed_reason"),
    missedNote: text("missed_note"),
    /** Date de déplacement si la séance a été reportée plutôt que manquée. */
    movedToDate: date("moved_to_date"),
    /**
     * Date de SAISIE, distincte de la date de séance. L'écart entre les deux
     * fait qu'une séance est marquée « enregistrée avec du retard » : une
     * saisie tardive est moins fiable et certaines analyses l'excluent.
     */
    loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("sessions_date_slot_key").on(table.userId, table.date, table.slot),
    index("sessions_status_idx").on(table.status),
  ],
);

/**
 * Un exercice au sein d'une séance réalisée.
 *
 * C'est ce niveau qui porte la case « fait / pas fait » et la charge utilisée,
 * le détail série par série restant facultatif.
 */
export const sessionExercises = pgTable(
  "session_exercises",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    programExerciseId: integer("program_exercise_id").references(() => programExercises.id),
    exerciseId: integer("exercise_id")
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer("order_index").notNull(),
    orderLabel: text("order_label"),
    /** La case à cocher : l'exercice a-t-il été fait ? */
    done: boolean("done").default(false).notNull(),
    /**
     * Ajouté en plus du programme. Ces lignes comptent dans le journal et le
     * tonnage, mais ne sont pas comparées à une prescription qui n'existe pas.
     */
    isExtra: boolean("is_extra").default(false).notNull(),
    skipReason: skipReasonEnum("skip_reason"),
    /** Charge de l'exercice — mode rapide, une valeur pour toutes les séries. */
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
    loadUnit: loadUnitEnum("load_unit"),
    /** Les kilos d'une machine ne sont comparables qu'à eux-mêmes. */
    machineNote: text("machine_note"),
    setsDone: integer("sets_done"),
    repsDone: integer("reps_done"),
    holdSecondsDone: integer("hold_seconds_done"),
    note: text("note"),
  },
  (table) => [index("session_exercises_session_idx").on(table.sessionId)],
);

/** Détail série par série. Facultatif : renseigné seulement si les séries diffèrent. */
export const sessionSets = pgTable(
  "session_sets",
  {
    id: serial("id").primaryKey(),
    sessionExerciseId: integer("session_exercise_id")
      .notNull()
      .references(() => sessionExercises.id, { onDelete: "cascade" }),
    setIndex: integer("set_index").notNull(),
    reps: integer("reps"),
    holdSeconds: integer("hold_seconds"),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }),
    /** Répétitions en réserve. */
    rir: integer("rir"),
    /** La forme s'est dégradée : compte pour le critère « série propre ». */
    technicalFailure: boolean("technical_failure").default(false).notNull(),
    note: text("note"),
  },
  (table) => [uniqueIndex("session_sets_unique").on(table.sessionExerciseId, table.setIndex)],
);

// ---------------------------------------------------------------------------
// Suivi corporel
// ---------------------------------------------------------------------------

export const bodyweightEntries = pgTable(
  "bodyweight_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    weightKg: numeric("weight_kg", { precision: 5, scale: 2 }).notNull(),
    fasted: boolean("fasted").default(true).notNull(),
    note: text("note"),
  },
  (table) => [uniqueIndex("bodyweight_date_key").on(table.userId, table.date)],
);

export const measurements = pgTable(
  "measurements",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    kind: measurementKindEnum("kind").notNull(),
    valueCm: numeric("value_cm", { precision: 5, scale: 1 }).notNull(),
  },
  (table) => [uniqueIndex("measurements_unique").on(table.userId, table.date, table.kind)],
);

export const progressPhotos = pgTable("progress_photos", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  angle: photoAngleEnum("angle").notNull(),
  url: text("url").notNull(),
});

/** Contrôles physiques jalonnés par le programme du compte. */
export const checkpoints = pgTable(
  "checkpoints",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    label: text("label").notNull(),
    completed: boolean("completed").default(false).notNull(),
    note: text("note"),
  },
  (table) => [uniqueIndex("checkpoints_date_key").on(table.userId, table.date)],
);

/** Les 4 tests de force calisthénie. */
export const strengthTests = pgTable(
  "strength_tests",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** "tractions" | "dips" | "pompes" | "hspu" | "atr" | "front_lever" | "pistol" | "l_sit" | "dead_hang" */
    metric: text("metric").notNull(),
    /** Reps ou secondes selon la métrique. */
    value: numeric("value", { precision: 6, scale: 1 }),
    /** Niveau atteint, pour les métriques à échelle (front lever). */
    level: integer("level"),
    note: text("note"),
  },
  (table) => [uniqueIndex("strength_tests_unique").on(table.userId, table.date, table.metric)],
);

/**
 * Métriques relevées lors des 4 tests de force, extraites du document.
 * Elles changent d'une révision du programme à l'autre : les stocker évite de
 * les figer dans le code.
 */
export const testMetrics = pgTable(
  "test_metrics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    unit: exerciseUnitEnum("unit").notNull(),
    orderIndex: integer("order_index").notNull(),
  },
  (table) => [uniqueIndex("test_metrics_slug_key").on(table.userId, table.slug)],
);

/**
 * Objectifs jalonnés, extraits du tableau « Objectifs réalistes » du programme.
 * Une ligne par mouvement et par date de contrôle.
 */
export const targets = pgTable(
  "targets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    movement: text("movement").notNull(),
    unit: exerciseUnitEnum("unit").notNull(),
    date: date("date").notNull(),
    /** Null quand le document ne fixe pas encore d'objectif à cette date. */
    value: integer("value"),
    /** Valeur de départ déclarée dans le document. */
    startLabel: text("start_label"),
  },
  (table) => [uniqueIndex("targets_unique").on(table.userId, table.slug, table.date)],
);

// ---------------------------------------------------------------------------
// Diète
// ---------------------------------------------------------------------------

export const foods = pgTable(
  "foods",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Unité de référence de la portion : « 100 g », « 1 œuf », « 250 ml ». */
    portionLabel: text("portion_label").notNull(),
    proteinG: numeric("protein_g", { precision: 5, scale: 1 }).notNull(),
    kcal: integer("kcal"),
    /** Prix indicatif en FCFA pour la portion de référence. */
    priceFcfa: integer("price_fcfa"),
    isLocal: boolean("is_local").default(true).notNull(),
    note: text("note"),
  },
  (table) => [uniqueIndex("foods_slug_key").on(table.slug)],
);

export const mealLogs = pgTable(
  "meal_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    slot: mealSlotEnum("slot").notNull(),
    note: text("note"),
  },
  (table) => [uniqueIndex("meal_logs_unique").on(table.userId, table.date, table.slot)],
);

export const mealItems = pgTable("meal_items", {
  id: serial("id").primaryKey(),
  mealLogId: integer("meal_log_id")
    .notNull()
    .references(() => mealLogs.id, { onDelete: "cascade" }),
  foodId: integer("food_id")
    .notNull()
    .references(() => foods.id),
  /** Nombre de portions de référence. */
  portions: numeric("portions", { precision: 5, scale: 2 }).default("1").notNull(),
});

/**
 * Compteur d'huile, en cuillères à soupe.
 *
 * L'huile est le deuxième levier de la diète : une cuillère à soupe vaut 15 ml
 * et 135 kcal. Elle a son compteur dédié plutôt que d'être noyée dans les macros.
 */
export const oilLogs = pgTable(
  "oil_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    tablespoons: numeric("tablespoons", { precision: 4, scale: 1 }).default("0").notNull(),
  },
  (table) => [uniqueIndex("oil_logs_date_key").on(table.userId, table.date)],
);

export const waterLogs = pgTable(
  "water_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    liters: numeric("liters", { precision: 3, scale: 1 }).default("0").notNull(),
  },
  (table) => [uniqueIndex("water_logs_date_key").on(table.userId, table.date)],
);

/** Portions de riz, comptées en « poings ». */
export const riceLogs = pgTable(
  "rice_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    fists: numeric("fists", { precision: 3, scale: 1 }).default("0").notNull(),
  },
  (table) => [uniqueIndex("rice_logs_date_key").on(table.userId, table.date)],
);

// ---------------------------------------------------------------------------
// Sommeil et signaux d'alerte
// ---------------------------------------------------------------------------

export const sleepLogs = pgTable(
  "sleep_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Date du RÉVEIL. */
    date: date("date").notNull(),
    bedtime: text("bedtime"),
    wakeTime: text("wake_time"),
    durationMinutes: integer("duration_minutes"),
    /** Qualité ressentie, 1 à 5. */
    quality: integer("quality"),
    /** Fréquence cardiaque au repos au réveil. */
    restingHr: integer("resting_hr"),
    note: text("note"),
  },
  (table) => [uniqueIndex("sleep_logs_date_key").on(table.userId, table.date)],
);

/**
 * Les quatre signaux d'alerte du programme, levés automatiquement.
 * La consigne associée est de couper une séance de volume, jamais une nuit.
 */
export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  /** "douleur_articulaire" | "baisse_performance" | "sommeil_degrade" | "fc_repos_haute" */
  kind: text("kind").notNull(),
  severity: text("severity").default("warning").notNull(),
  message: text("message").notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
});

/** Douleurs déclarées, pour détecter celles qui dépassent 48 h. */
export const painLogs = pgTable("pain_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  area: text("area").notNull(),
  /** 1 à 5. */
  intensity: integer("intensity").notNull(),
  isJoint: boolean("is_joint").default(false).notNull(),
  note: text("note"),
});

// ---------------------------------------------------------------------------
// Synchronisation hors-ligne
// ---------------------------------------------------------------------------

/**
 * Journal des mutations reçues du client, pour rendre la synchronisation
 * idempotente : le client peut rejouer une mutation sans créer de doublon.
 */
export const syncMutations = pgTable(
  "sync_mutations",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("sync_mutations_applied_idx").on(table.appliedAt)],
);

export const schemaTables = {
  users,
  exercises,
  ladders,
  ladderLevels,
  ladderProgress,
  exerciseGuides,
  programs,
  programWeeks,
  programSessions,
  programExercises,
  sessions,
  sessionExercises,
  sessionSets,
  bodyweightEntries,
  measurements,
  progressPhotos,
  checkpoints,
  strengthTests,
  targets,
  testMetrics,
  foods,
  mealLogs,
  mealItems,
  oilLogs,
  waterLogs,
  riceLogs,
  sleepLogs,
  alerts,
  painLogs,
  syncMutations,
};
