# SPEC.md — Plateforme de suivi d'entraînement

Dernière mise à jour : 2026-08-26
Statut : **implémenté et vérifié en local**, sur les documents révisés du 26/08. Reste à pousser sur GitHub, brancher Neon et déployer.

---

## 1. Objectif du produit

Une PWA personnelle pour piloter un programme de 17 semaines
(24 août → 20 décembre 2026) combinant trois volets simultanés :

| Volet | Fréquence | Créneau | Source |
|-------|-----------|---------|--------|
| Musculation PPL | 6 séances/semaine, 60 min chrono | 23h | `1-musculation-ppl-soir.pdf` |
| Calisthénie | 6 jours/semaine, 20 min matin + 10 min soir | avant 7h / 17h–20h | `2-calisthenie.pdf` |
| Diète recomposition | quotidien | — | `3-diete-senegal.pdf` |

Soit **12 séances par semaine**.

**Ce que l'app doit répondre, en une phrase :** *« est-ce que ça progresse, où, et
si non pourquoi. »*

Les PDF contiennent trois tableaux volontairement laissés vides (tableau de charges,
tableau des 4 tests, tableau des contrôles). **L'app les remplace** — c'est son périmètre minimal,
et il est couvert.

---

## 2. Contraintes

- Hébergement **Vercel**, base **Neon** (imposé).
- Contexte **Sénégal** : réseau mobile instable, données coûteuses.
- Usage principal : téléphone, en salle, à 23h, souvent à une main.
- PWA installable sur **PC, tablette, iPhone et Android**.
- Le programme est **déjà commencé** (semaine 1 en cours au 26/08/2026).
- Mono-utilisateur.

---

## 3. Modèle de données

29 tables. Migration : `drizzle/0000_init.sql`.

### Référentiel (semé, lu seul)
`programs`, `program_weeks`, `program_sessions`, `program_exercises` (dont `home_alternative`),
`exercises`, `ladders`, `ladder_levels`, `targets`, `test_metrics`, `foods`, `checkpoints`.

Les échelles, objectifs et métriques de test sont **extraits du document**, pas transcrits : ils ont
changé entre deux révisions sans que rien ne le signale.

Une séance prescrite = `program_sessions` avec un créneau (`salle` / `matin` / `soir`) :
le programme de salle produit une séance par jour, la calisthénie deux.

### Journal réel
- `sessions` — date de séance, créneau, **lieu (salle/maison)**, statut, durée, ressenti, motif d'absence, **et `logged_at` distinct de `date`** : c'est cet écart qui produit le badge « enregistré avec du retard ».
- `session_exercises` — **le niveau qui porte la case « fait / pas fait » et la charge en kg**, avec l'unité (barre/machine, par haltère, poids du corps) et la machine utilisée.
- `session_sets` — détail série par série, **facultatif**.

### Suivi corporel, diète, récupération
`bodyweight_entries`, `measurements`, `progress_photos`, `strength_tests`,
`meal_logs`, `meal_items`, `oil_logs`, `water_logs`, `rice_logs`,
`sleep_logs`, `pain_logs`, `alerts`, `ladder_progress`.

### Synchronisation
`sync_mutations` — journal des mutations appliquées, pour rendre le rejeu idempotent.

### Calculé, jamais stocké
Tonnage, 1RM estimé (Epley), moyenne mobile 7 jours, taux d'assiduité, records,
stagnation, signaux d'alerte, verdict de recomposition.

---

## 4. Fonctionnalités

Statut : toutes **stables** sauf mention contraire.

### 4.1 Séance du jour — stable
Écran d'accueil. Séances prescrites du jour, tous créneaux, pré-remplies avec les charges du
programme ou de la dernière fois.

- **Case à cocher par exercice**, avec motif si non fait (machine occupée, douleur, manque de temps, remplacé).
- **Une charge en kg par exercice** — mode par défaut ; le détail série par série se déplie.
- Distinction charge barre/machine vs kg par haltère ; note de machine (« les kilos ne sont comparables qu'à eux-mêmes »).
- **Chronomètre de repos** démarrant seul à la validation, avec le repos prescrit ; échéance absolue pour survivre à l'extinction de l'écran ; vibration en fin de repos.
- **Chronomètre de séance**, avec signalement au-delà des 60 min visées.
- Supersets `4a`/`4b` identifiés : seul le second déclenche un repos.
- **Résumé de fin de séance** : exercices faits, charges, durée, records, ressenti, note, et **la charge conseillée pour la prochaine fois**.
- Statut déduit : tout coché = faite, une partie = partielle, rien = manquée avec motif.

### 4.2 Enregistrement rétroactif — stable
Depuis le calendrier, n'importe quel jour passé s'ouvre et s'enregistre. La séance porte alors un
badge **« Enregistré avec du retard · +N j »**, et ses durée et temps de repos sont exclus des
analyses : ils n'ont pas été mesurés. Un indicateur « saisies à chaud vs en retard » signale une
dérive avant que les séances elles-mêmes ne sautent.

### 4.3 Progression et feedback — stable
- **Double progression** appliquée automatiquement : haut de fourchette tenu sur toutes les séries → +2,5 kg (haut du corps) ou +5 kg (bas), retour au bas de la fourchette.
- **Règle de la série test** : ±2,5 à 5 kg selon le résultat de la première série.
- Courbes par exercice, **1RM estimé** (une répétition de plus à charge égale compte comme un progrès).
- **Records** détectés, **stagnation** signalée après 3 séances sans progrès.
- **Tableau de charges auto-rempli** (S2, S4, S6, S9, S11, S13, S16).

### 4.4 Journal et assiduité — stable
Calendrier des 17 semaines (une case par jour, cliquable), assiduité globale et **par créneau**
(le programme dit : si tu dois en sauter un, saute le soir), séries de jours consécutifs.

### 4.5 Séances manquées — stable
Motif obligatoire dans une liste fermée de 10 entrées. Distinction **manquée** vs **reportée**
(une séance déplacée sort du dénominateur). Analyses de schémas : créneau qui saute le plus,
motif dominant, jour de la semaine le plus sauté.

### 4.6 Calisthénie — stable
Les 8 échelles avec leurs niveaux et critères, extraites du document. Critère de passage **« deux séances propres
consécutives »** suivi par un compteur visible, et passage proposé par l'app. Règle du **(max − 1)**
appliquée au format du jour. Retest du max limité à un lundi sur deux. Objectifs jalonnés sur 8 mouvements (tractions, pompes, dips, dead hang, pike push-up, ATR, front lever, hollow body).

### 4.7 Suivi corporel — stable
Pesées à jeun, **moyenne mobile 7 jours mise en avant** (le poids du jour varie de 1 à 2 kg),
variation hebdomadaire vs cible −0,3 à −0,5 %, alerte au-delà de −0,7 %. Mensurations.
**Verdict de recomposition** explicite croisant poids, tour de taille et charges.

### 4.8 Tests et contrôles — stable
Les 4 samedis pré-datés, saisie des 11 métriques de force, tableau comparatif des 4 jalons,
tableau des mensurations de contrôle, écart aux objectifs du jalon.

### 4.9 Diète — stable
Objectif protéines calculé sur le poids lissé (1,8–2,2 g/kg) avec barre de progression et
traduction du manque en aliments concrets. **Compteur d'huile dédié** en cuillères à soupe
(levier n°2 du document). Compteur de riz en poings, hydratation. Journée type en 6 créneaux
validables en un tap. Classement des protéines par franc dépensé.

### 4.10 Sommeil et récupération — stable
Coucher, lever, durée, qualité, FC repos. Déclaration de douleurs (articulaire ou non).
**Les 4 signaux d'alerte** du programme sont surveillés : douleur articulaire > 48 h, baisse de
performance sur 2 séances, sommeil dégradé, FC repos anormalement haute — avec la conduite à
tenir (couper une séance de volume, jamais une nuit).

### 4.11 Bilan hebdomadaire — stable
Un écran qui tranche : **ça progresse / ça stagne / ça régresse, et où**. Assiduité vs semaine
précédente, tonnage, poids, sommeil, ce qui progresse, ce qui stagne, points de vigilance.

### 4.12 Bibliothèque d'exercices — stable *(fiches d'exécution à compléter)*
Les 114 exercices des deux programmes, groupés, avec l'historique personnel et une fiche par
exercice (courbe, records, conseil de progression, historique détaillé).
Les consignes position/exécution/erreur ne sont pas encore importées.

### 4.13 Hors-ligne et PWA — stable
Installable sur PC, tablette, iPhone et Android. Écriture toujours en file d'attente locale,
synchronisation idempotente au retour du réseau, séance du jour consultable depuis le cache.

### 4.14 Séances à la maison — stable
Le programme fournit un **équivalent maison pour chaque exercice de salle** (480 lignes), plus une
section sur le matériel improvisé (barre de traction, sac à dos chargé, bidons d'eau). L'écran de
séance propose une bascule **salle / maison** : en mode maison, chaque exercice affiche son
équivalent et la séance est enregistrée comme telle.

Conséquence, tirée du document : une séance maison **compte pour l'assiduité** — c'est tout son
intérêt, elle évite de rater l'entraînement — mais elle est **exclue de la progression en charge**,
le document précisant que les deux échelles ne se comparent pas.

### 4.15 Photos de progression — non implémenté
Stockage externe à trancher (Vercel Blob, seul poste potentiellement payant).

---

## 5. Stack technique

| Couche | Choix | Note |
|--------|-------|------|
| Framework | **Next.js 16.3.3** (App Router, Turbopack) + React 19.2 | Paramètres de route asynchrones, `middleware` renommé `proxy` |
| Base | **Neon** (`@neondatabase/serverless`) | PGlite en repli local si `DATABASE_URL` absente |
| ORM | **Drizzle 0.45.2** + drizzle-kit | 0.45.2 minimum : faille SQL en dessous |
| UI | **Tailwind v4** + composants maison | Thème sombre par défaut (séance à 23h) |
| Graphiques | **SVG pur** | Rendu serveur, aucun JS client — données mobiles coûteuses |
| Hors-ligne | **Dexie** (IndexedDB) + file d'attente | Service worker écrit à la main |
| Auth | **iron-session** + scrypt (`node:crypto`) | Mono-utilisateur, sans dépendance native |
| Validation | **Zod 4** | Partagée client/serveur sur l'API de synchronisation |
| Tests | **Vitest** (113 tests) + test de fumée | Domaine métier couvert systématiquement |

---

## 6. Conventions

- Fichiers en `kebab-case`, composants en `PascalCase`, variables en `camelCase`, SQL en `snake_case`.
- Toute règle métier vit dans `src/lib/domain/`, **pure et testée** : ni base, ni React.
- Aucune date de programme en dur : `program_weeks` ou `src/lib/targets.ts`.
- Unités en base : charges en kg (`numeric 6,2`), tenues et repos en secondes, poids en kg, volumes en ml.
- Dates manipulées en **UTC** partout (`YYYY-MM-DD`) : le programme est daté au jour près.
- Cibles tactiles ≥ 44 px, clavier numérique sur les champs de charge.
- Interface intégralement en français ; `react/no-unescaped-entities` désactivée en conséquence.

---

## 7. Variables d'environnement

| Variable | Rôle | Statut |
|----------|------|--------|
| `DATABASE_URL` | Neon, chaîne *pooled*, utilisée à l'exécution | requis en déploiement |
| `DATABASE_URL_UNPOOLED` | Connexion directe, migrations | requis pour migrer |
| `AUTH_SECRET` | Secret de session, 32 caractères minimum | requis |
| `PGLITE_DIR` | Dossier de la base locale | optionnel (tests) |

---

## 8. Dépendances

**Exécution** : `next`, `react`, `react-dom`, `@neondatabase/serverless`, `drizzle-orm`,
`dexie`, `iron-session`, `zod`, `date-fns`, `clsx`, `tailwind-merge`, `lucide-react`, `server-only`.

**Développement** : `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `drizzle-kit`,
`@electric-sql/pglite`, `vitest`, `eslint`, `eslint-config-next`, `prettier`, `tsx`, `dotenv`.

Retirées en cours de route : `recharts` (SVG maison), `@serwist/next` et `serwist`
(incompatibles avec Turbopack).

---

## 9. Score de santé

| Axe | Note | Justification |
|---|---|---|
| Architecture | 8/10 | Domaine métier isolé et testé, hors-ligne pensé dès le départ. Le couplage entre le seed et le format des PDF reste un point faible. |
| Qualité code | 8/10 | Typecheck et lint stricts, conventions homogènes, commentaires qui expliquent le pourquoi. Quelques pages longues. |
| Tests | 7/10 | 116 tests unitaires sur toutes les règles métier, test de fumée sur 11 pages et l'API. Aucun test de parcours (interaction, hors-ligne réel). |
| Sécurité | 8/10 | Faille haute corrigée, validation Zod sur toutes les écritures, scrypt, cookie chiffré, comparaison à temps constant. Reste un avertissement modéré sur un outil de développement. |
| Performance | 8/10 | Build en 12,6 s, graphiques sans JS client, pages dynamiques légères (25–140 Ko). |
| Maintenabilité | 8/10 | Règles métier lisibles et localisées, décisions documentées. Le parseur PDF demande de la vigilance à chaque révision des documents. |
| Infrastructure | 6/10 | Prêt pour Vercel mais **jamais déployé ni testé sur Neon** ; aucune CI. |
| **Global** | **7,5/10** | Solide et vérifié en local ; la note monte dès le premier déploiement réussi. |

---

## 10. Reste à faire

1. **Créer la base Neon** et renseigner `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`.
2. Relire `data/seed/REVUE.md`, puis `npm run db:migrate` et `npm run db:seed` sur Neon.
3. Déployer sur Vercel et installer la PWA sur téléphone.
4. Importer les fiches d'exécution des exercices.
5. Brancher le stockage des photos de progression.
6. Ajouter des tests de parcours, notamment du mode hors-ligne réel.
7. Mettre en place une CI (`npm run verify`).
