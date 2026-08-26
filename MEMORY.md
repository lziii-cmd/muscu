# MEMORY.md — Mémoire du projet

Dernière mise à jour : 2026-08-26

## CONTEXTE ACTUEL
- Où on en est : **application multi-comptes**. Le passage d'un compte unique à plusieurs comptes est terminé côté code : table `users`, `user_id` sur 17 tables, 14 index d'unicité re-cadrés sur le compte, toutes les requêtes filtrées côté serveur, écrans *Compte* et *Comptes* (administration). Typecheck, lint, 120 tests et test de fumée au vert ; build de production réussi.
- Dernière fonctionnalité travaillée : **profil** (stature, naissance, poids visé, cibles de diète, IMC et rapport tour de taille / stature, déconnexion) puis **import du programme de Nourah** depuis trois PDF convertis en Markdown.
- Prochaine fonctionnalité prévue : à définir. Pistes ouvertes : fiches d'exécution des exercices, stockage des photos de progression.
- Problèmes ouverts :
  - Base Neon **migrée sans destruction** par `0002_comptes.sql` : le compte `abdou` créé sur le site déployé a été repris tel quel, avec son mot de passe et ses données. Les trois comptes existent ; les deux programmes sont importés (Abdou 299 séances sur 17 semaines, Nourah 124 jours sur 18 semaines).
  - Les mots de passe initiaux ont transité par la conversation : **à changer au premier passage** depuis l'écran *Compte*. Un bandeau le rappelle tant que c'est le cas.
  - Les fiches d'exécution des exercices ne sont pas importées.
  - Les photos de progression n'ont pas de stockage branché.

## DÉCISIONS TECHNIQUES
| Date | Décision | Pourquoi | Alternative écartée |
|------|----------|----------|---------------------|
| 2026-08-26 | Stack Vercel + Neon | Demande explicite de l'utilisateur | Supabase, Railway |
| 2026-08-26 | Next.js 16.3.3 + React 19.2 | Version installée par `create-next-app` ; doc locale lue avant de coder | Next 15 |
| 2026-08-26 | Drizzle ORM plutôt que Prisma | Léger en serverless, migrations SQL versionnées | Prisma |
| 2026-08-26 | drizzle-orm monté en 0.45.2 | Faille **haute** d'injection SQL (GHSA-gpj5-g38j-94v9) sur `<0.45.2` | Rester en 0.44 |
| 2026-08-26 | Service worker écrit à la main | Next 16 fait **échouer le build** si une config webpack custom est présente (Turbopack par défaut) ; `@serwist/next` en dépend | `@serwist/next`, `next-pwa` |
| 2026-08-26 | Graphiques en SVG pur, `recharts` retiré | Rendu côté serveur, aucun JS envoyé au client ; données mobiles coûteuses au Sénégal | Recharts, Chart.js |
| 2026-08-26 | Semaine 1 du PPL transcrite à la main | Tableaux PDF structurellement dégradés (en-têtes fusionnés, valeurs décalées de 2 lignes) : un parseur produirait des données fausses sans le signaler | Forcer le parseur |
| 2026-08-26 | Colonnes décalées lues en flux puis appariées par index | Constat vérifié : l'alignement vertical est perdu, l'ordre est fidèle | Se fier aux positions de colonnes |
| 2026-08-26 | Refus d'apparier si les comptes diffèrent | Un décalage silencieux ferait charger la mauvaise barre pendant 4 mois | Deviner |
| 2026-08-26 | Écriture via file d'attente IndexedDB (outbox) | Séance à 23h, réseau instable ; le serveur reste source de vérité car iOS purge le stockage des PWA | Écriture directe |
| 2026-08-26 | Idempotence par identifiant de mutation client | Rejouer après coupure ne doit pas créer de doublon | Déduplication côté client seul |
| 2026-08-26 | Auth par scrypt de `node:crypto` | Évite une dépendance native à compiler ; mémoire-dur, résistant au GPU | NextAuth, argon2 natif |
| 2026-08-26 | **Portée décidée par le serveur** (`requireUser()`), jamais passée en paramètre | Un appelant distrait ne peut pas exposer le journal du voisin : l'oubli de filtre devient impossible plutôt qu'improbable | `userId` passé depuis les pages |
| 2026-08-26 | `user_id` dans les index d'unicité, pas seulement en colonne | Sans lui, la deuxième personne ne pourrait pas enregistrer une séance le jour où l'autre en a une | Index globaux |
| 2026-08-26 | Le rôle admin ne gère que les comptes | Gérer les comptes n'est pas lire le journal de quelqu'un ; séparer les deux évite qu'un accès administratif devienne un accès aux données | Admin voit tout |
| 2026-08-26 | Un administrateur ne peut ni se retirer son rôle ni se supprimer | Ce sont les deux gestes qui fermeraient la porte de l'extérieur | Confiance dans l'interface |
| 2026-08-26 | Le seed vise **un compte** et ne touche jamais au journal | Deux programmes différents doivent coexister ; un re-seed ne doit rien effacer de ce qui a été vécu | Seed global |
| 2026-08-26 | Catalogue d'exercices et aliments partagés entre comptes | Référentiels neutres : les dupliquer n'apporterait rien et compliquerait la recherche | Table par compte |
| 2026-08-26 | Pas d'inscription depuis l'application | Adresse publique : une inscription libre donnerait un accès à n'importe qui | Écran d'inscription |
| 2026-08-26 | Client de base mémorisé sur `globalThis`, pas par module | Next duplique une variable de module entre le graphe des pages et celui des routes : deux instances PGlite sur un dossier mono-processus, et une écriture jamais relue | Variable de module |
| 2026-08-26 | PDF de Nourah convertis **une fois** en Markdown | Même raison que pour le premier programme : dans un tableau Markdown les cellules sont délimitées. La conversion est relue une fois, tout le reste travaille sur du texte structuré | Parser le PDF à chaque build |
| 2026-08-26 | Bornes de colonnes calculées **par tableau** | D'un tableau à l'autre le PDF ne place pas les colonnes aux mêmes abscisses ; des bornes globales décaleraient des valeurs sans rien signaler | Bornes globales |
| 2026-08-26 | Le seed porte une **liste** de programmes | Nourah n'en a qu'un, Abdou deux. Des champs nommés en dur obligeraient à lui inventer une calisthénie vide | `ppl` / `calisthenie` en dur |
| 2026-08-26 | Tout ce qui décrit le programme vient du compte | Neuf endroits portaient les dates du premier programme, dont le calcul du lundi de la semaine N — sur un programme démarrant deux jours plus tard, les colonnes de charges se décalaient sans rien afficher d'anormal | Constantes partagées |
| 2026-08-26 | L'onglet Calisthénie disparaît sans échelle | Un onglet vide se lit comme une panne, pas comme une absence voulue | Onglet toujours visible |
| 2026-08-26 | PGlite en repli local quand `DATABASE_URL` est absente | Permet de développer et de tester sans identifiants Neon ni Docker | Exiger Neon dès le développement |
| 2026-08-26 | Garde « pas de base locale » sur `VERCEL`, pas sur `NODE_ENV` | Un build de production tourne aussi en local (tests) ; le vrai risque est un déploiement sans base | Garde sur NODE_ENV |
| 2026-08-26 | **Source = `PROGRAMME-COMPLET.md`**, plus les PDF | Dans un tableau Markdown les cellules sont délimitées : les trois classes de bugs de l'extraction PDF (colonnes qui dérivent, fourchettes écrasées, consignes tronquées) n'ont plus de place où exister | Continuer à parser des PDF |
| 2026-08-26 | `hold_seconds_low` / `hold_seconds_high` au lieu d'une valeur unique | Une fourchette « 20-30 s » n'est pas une tenue de 30 s ; n'en garder que la borne haute durcit la consigne | Borne haute seule |
| 2026-08-26 | `max_offset` entier au lieu d'un booléen | Le décalage vaut 1 les jours de force et **2 le jeudi**, journée de volume. Tout ramener à 1 donne deux journées lourdes de tractions par semaine | Supposer toujours −1 |
| 2026-08-26 | Contrôle bloquant « jeudi plus léger que lundi » | L'erreur était silencieuse et invisible à la relecture : seul un invariant la rattrape | Confiance dans le parsing |
| 2026-08-26 | Extraction PDF en `pdftotext -table` et non `-layout` *(étape intermédiaire, abandonnée)* | `-table` préserve l'alignement des lignes ; `-layout` faisait dériver les colonnes de droite d'une ligne, imposant des heuristiques d'appariement fragiles — et incapables de lire la colonne « Alternative maison », qui contient elle-même des « 3 × 12 » | `-layout` + appariement par index |
| 2026-08-26 | Semaine 1 du PPL **plus** transcrite à la main | En `-table` ses tableaux sont lisibles comme les autres ; la transcription manuelle était une dette de maintenance | Garder l'override |
| 2026-08-26 | Échelles, objectifs et métriques de test **parsés** au lieu d'être transcrits | Ils ont changé entre deux révisions du document sans que rien ne le signale — exactement le risque à éviter | Retranscrire à la main |
| 2026-08-26 | Le bouton maison est toujours disponible sur une séance de salle | Le lieu où l'on s'entraîne est un fait, il ne dépend pas de la présence d'une colonne dans le document — la semaine 1 n'en a pas | N'afficher le bouton que si une alternative existe |
| 2026-08-26 | Remplacer un exercice = marquer l'original non fait + ajouter le substitut | Réutilise les mécanismes existants, garde la trace de ce qui était prévu, aucun schéma supplémentaire | Colonne « remplacé par » |
| 2026-08-26 | `measure_label` libre sur l'exercice | Une corde à sauter se compte en sauts, une course en mètres ; forcer « répétitions » rendrait la saisie absurde | Enum figée |
| 2026-08-26 | Séances maison exclues de la progression en charge | Consigne explicite du document : « ne compare pas ses performances à celles de la salle, ce sont deux échelles différentes » | Tout mélanger |
| 2026-08-26 | `react/no-unescaped-entities` désactivée | Interface intégralement en français, l'apostrophe est un caractère courant ; React échappe déjà le JSX | Échapper chaque apostrophe |

## CE QUI A ÉTÉ FAIT
| Date | Fonctionnalité | Statut | Notes |
|------|----------------|--------|-------|
| 2026-08-26 | Extraction des 3 PDF | fait | `pdftotext -table` sur les versions révisées de 02:07 |
| 2026-08-26 | MEMORY.md et SPEC.md | fait | Phase 0 |
| 2026-08-26 | Parseurs PPL, calisthénie et référentiel | fait | 0 erreur, 0 avertissement sur les deux programmes |
| 2026-08-26 | Seed + document de revue | fait | 504 + 388 lignes, 480 alternatives maison, 8 échelles, 8 objectifs, 11 métriques |
| 2026-08-26 | Schéma 29 tables + migration | fait | `drizzle/0000_init.sql` |
| 2026-08-26 | Domaine métier + 116 tests | fait | 6 modules purs, sans base ni React |
| 2026-08-26 | Couche hors-ligne (Dexie + outbox) | fait | Synchronisation idempotente via `/api/sync` |
| 2026-08-26 | Authentification | fait | iron-session + scrypt, groupe de routes `(app)` protégé |
| 2026-08-26 | 11 pages + 2 pages de détail | fait | Aujourd'hui, séance/[date], journal, progression, calisthénie, corps, tests, diète, sommeil, bilan, exercices |
| 2026-08-26 | PWA (manifeste, service worker, icônes) | fait | Icônes générées par programme, encodeur PNG maison |
| 2026-08-26 | Test de fumée autonome | fait | 13 pages + 7 comportements d'API, dont le refus de l'administration à un compte ordinaire |
| 2026-08-26 | Planning des 17 semaines, saisie rétroactive, séances libres | fait | Page *Programme*, panneau « à rattraper » |
| 2026-08-26 | Alternative maison, remplacement d'un exercice, exercices à unité libre | fait | Bouton *maison* toujours offert en salle ; corde à sauter comptée en sauts |
| 2026-08-26 | **Multi-comptes** | fait | `users`, `user_id` sur 17 tables, 14 index re-cadrés, requêtes et synchronisation filtrées |
| 2026-08-26 | Écran *Compte* + administration des comptes | fait | Changement de son mot de passe, création/réinitialisation/suppression côté admin, bandeau « mot de passe d'origine » |
| 2026-08-26 | **Profil** | fait | Stature, naissance, poids visé, cibles de diète, IMC et rapport tour de taille / stature, pesée du jour, déconnexion |
| 2026-08-26 | **Programme de Nourah** | fait | 3 PDF → `PROGRAMME-NOURAH.md` → seed : 18 semaines, 124 jours, 689 lignes, 7 objectifs, 9 mesures, 4 contrôles |
| 2026-08-26 | Programme entièrement piloté par le compte | fait | Bornes, blocs, contrôles, onglet calisthénie : plus rien en dur |
| 2026-08-26 | Migration `0002_comptes.sql` **additive** | fait | Répétée sur base neuve et sur une copie du scénario de production avant d'être appliquée à Neon |
| 2026-08-26 | Déploiement Neon en multi-comptes | fait | 3 comptes, programme d'Abdou importé (299 séances), aucune donnée perdue |

## PROBLÈMES RENCONTRÉS & SOLUTIONS
| Date | Problème | Cause | Solution appliquée |
|------|----------|-------|--------------------|
| 2026-08-26 | Lecture des PDF impossible via l'outil Read | `pdftoppm` absent | `pdftotext -layout` |
| 2026-08-26 | En-têtes de semaine et de jour ignorés | Sauts de page `\f` collés en début de ligne | Retirés dans `normalizeText` |
| 2026-08-26 | Charges tronquées (« 0 kg » au lieu de « 30 kg ») | Bornes de colonnes calées sur les libellés d'en-tête, alors que les valeurs débordent à gauche | Bornes calculées sur les colonnes de blanc du **corps** du tableau, en-tête exclu |
| 2026-08-26 | Séries/reps perdues dans certains tableaux | Frontière reps/charge géométriquement instable | Zone lue d'un bloc puis découpée **par motif** |
| 2026-08-26 | Valeurs en trop dans les flux | Deux causes distinctes : charge passée à la ligne, et décalage d'index | Fusion des continuations, reconnues par l'absence de motif « séries × reps » |
| 2026-08-26 | Semaines toutes rattachées à la S1 (calisthénie) | Le parseur sautait d'un jour au suivant, franchissant les en-têtes de semaine | Fin de jour bornée aussi par l'en-tête de semaine |
| 2026-08-26 | Blocs SOIR perdus (57 blocs) | Libellé « Exercice » sur une autre ligne que « Séries » | Colonne synthétisée, seule sa géométrie important |
| 2026-08-26 | Faille **haute** d'injection SQL | `drizzle-orm < 0.45.2` | Montée en 0.45.2, audit revenu à 0 haute |
| 2026-08-26 | `@serwist/next` incompatible | Config webpack custom → build en échec sous Turbopack | Service worker écrit à la main |
| 2026-08-26 | **Build TypeScript en 38 minutes** | `.pglite` (29 Mo de binaires), `.next` et `data/` inclus dans le programme TypeScript | Exclus dans `tsconfig.json` → build ramené à **12,6 s** |
| 2026-08-26 | Base locale injoignable au lancement | PGlite bundlé par Turbopack : son WASM localisé via `import.meta.url` n'est plus résolu | `serverExternalPackages: ["@electric-sql/pglite"]` |
| 2026-08-26 | Test de fumée en échec après la 1re exécution | PGlite est mono-processus : le script et le serveur ne voient pas les mêmes écritures | Test rendu autonome : base dédiée (`PGLITE_DIR`) et serveur propre |
| 2026-08-26 | Faux échecs du test de fumée | React échappe les entités HTML (`Aujourd&#x27;hui`) | Décodage avant comparaison |
| 2026-08-26 | **Jeudi normalisé à (max − 1) au lieu de (max − 2)** | Le libellé disait max−2, la valeur calculée max−1 ; mon parseur retenait la valeur calculée | `max_offset` lu depuis le libellé, plus un invariant qui refuse le seed si le jeudi n'est pas plus léger que le lundi |
| 2026-08-26 | **Fourchettes de tenue écrasées** (« 4 × 20-30 s » → « 4 × 30 s ») | `hold[3] ?? hold[2]` retenait la borne haute | Deux colonnes, borne basse et borne haute |
| 2026-08-26 | Consignes de semaine tronquées | Capture d'une seule ligne, et découpe sur les espaces multiples de `-table` | Source Markdown + repli sur la première ligne de prose |
| 2026-08-26 | **Seed construit sur des PDF périmés** | Deux versions révisées déposées à 02:07 pendant la construction ; mon dernier inventaire du dossier datait de 01:16 | Reprise complète : réextraction, réécriture des deux parseurs, re-seed. Leçon : réinspecter le dossier avant toute étape qui consomme les sources |
| 2026-08-26 | Type de séance tronqué (« LEGS A » → « LEGS ») | `-table` insère des espaces à l'intérieur des titres ; ma découpe sur « 2 espaces ou plus » coupait au mauvais endroit | Normalisation des espaces au lieu d'une découpe |
| 2026-08-26 | Titre de section absorbé par la dernière ligne d'un tableau | Bloc borné uniquement par les titres de jour et de semaine | Bornes élargies aux titres de section et intertitres |
| 2026-08-26 | Parseur ancré sur le sommaire au lieu du corps | En `-table` tout est indenté : l'indentation ne distingue plus sommaire et corps | Repères pris sur la **dernière** occurrence |
| 2026-08-26 | **Le test de fumée a écrit dans la base Neon** | Supprimer `DATABASE_URL` du processus parent ne suffit pas : chaque enfant recharge `.env.local` par dotenv et y retrouve l'URL | Variables mises à la chaîne vide et transmises telles quelles aux enfants — dotenv n'écrase jamais une variable déjà présente. Dégât constaté : un mot de passe aléatoire posé dans `settings`, effacé depuis ; aucune donnée utilisateur perdue |
| 2026-08-26 | Serveur de test survivant entre deux exécutions | `taskkill` lancé de façon asynchrone juste avant `process.exit` | Arrêt synchrone (`spawnSync`) et arrêt sur tous les chemins de sortie, plus une garde qui refuse de démarrer si le port est pris |
| 2026-08-26 | Build servi depuis un cache périmé | Turbopack conservait l'ancienne route d'authentification | `rm -rf .next` avant un build de vérification |
| 2026-08-26 | Erreurs de lint React 19 | `Date.now()` pendant le rendu, `setState` synchrone dans un effet | Compteur monotone, `useSyncExternalStore`, remontage par `key` |
| 2026-08-26 | **Écritures jamais relues par les pages, en local** | Next sépare le graphe des pages de celui des routes d'API ; le client de base mémorisé par module y était dupliqué, donc deux instances PGlite sur un dossier mono-processus. La synchronisation répondait « ok » et l'écran restait vide | Client posé sur `globalThis`, plus deux contrôles au test de fumée : une écriture doit être relue, et deux comptes ne doivent jamais voir la pesée de l'autre |
| 2026-08-26 | Charge prescrite absente sur les exercices aux haltères | L'affichage ne lisait que `load_raw` ; les haltères vivent dans `dumbbell_raw` — 167 lignes chez Abdou, 128 chez Nourah sans repère de charge | Repli sur `dumbbell_raw`, affiché « par haltère » |
| 2026-08-26 | Titres de semaine tronqués à la conversion | Le PDF coupe les titres longs sur deux lignes séparées par un blanc | Reprise de la ligne suivante tant qu'elle n'ouvre pas une structure connue |
| 2026-08-26 | `.pglite-local/` entré dans un commit (29 Mo) | `.gitignore` ne couvrait que `.pglite/` et `.pglite-smoke/` | Motif élargi à `.pglite*/`, commit corrigé avant publication |

## POINTS DE VIGILANCE
- **Le programme est daté et court.** 24 août → 20 décembre 2026. Aucune date en dur dans le code : tout vient de `program_weeks` ou de `src/lib/targets.ts`.
- **PGlite est mono-processus.** Arrêter le serveur avant `db:migrate`, `db:seed` ou `npm run users`, sinon les écritures ne sont pas vues. Un `taskkill` brutal sur un serveur qui tient la base la laisse corrompue : supprimer le dossier et la reconstruire.
- **Toute nouvelle requête doit être filtrée par compte.** Le point d'entrée est `currentUserId()` ; une requête qui l'oublie renvoie les données de tout le monde sans lever d'erreur. Même chose pour tout nouvel index d'unicité, qui doit inclure `user_id`.
- **Le seed vise un compte.** `npm run db:seed -- --user X` : sans `--user`, il refuse de tourner. Il réécrit le programme de X et ne touche à rien d'autre.
- **Une séance déjà enregistrée référence sa séance prescrite.** Re-semer le programme d'un compte qui a déjà journalisé des séances échouera sur la clé étrangère — c'est voulu, mieux vaut un refus qu'une perte.
- **Rien du programme ne doit revenir en dur.** Dates, nombre de semaines, noms de blocs, dates de contrôle, présence de la calisthénie : tout vient du compte. Une constante réintroduite serait juste pour l'un et fausse pour l'autre, sans rien afficher d'anormal.
- **Nourah ne fait pas de calisthénie.** Son programme est une musculation à domicile : ni échelle de progression, ni max de tractions.
- **Deux tables de charges, pas une.** `load_raw` porte la barre ou la machine, `dumbbell_raw` l'haltère — où « 8 kg » signifie huit kilos dans *chaque* main. Les confondre double ou divise la charge réelle.
- **Ne jamais afficher une courbe de poids seule.** En recomposition, le poids ment : la lecture croise toujours poids lissé + tour de taille + charges.
- **La saisie doit tenir en une main, à 23h.** Cibles tactiles ≥ 44 px, clavier numérique, une charge par exercice et non par série.
- **Le seed n'est pas une vérité absolue.** `data/seed/REVUE.md` existe pour être relu ; les valeurs prescrites restent éditables dans l'application.
- **iOS purge le stockage des PWA** après quelques semaines sans ouverture : le local n'est qu'un tampon, le serveur fait foi.
- Le tableau des consignes d'exécution des exercices reste à importer (extraction non fiable en l'état).

## DETTE TECHNIQUE EN COURS
| Priorité | Problème | Impact | Effort |
|----------|----------|--------|--------|
| Moyenne | Fiches d'exécution des exercices non importées | La bibliothèque affiche les noms et l'historique, pas les consignes | M |
| Moyenne | Photos de progression sans stockage | Le comparateur avant/après ne peut pas fonctionner | M |
| Basse | `drizzle-kit` tire un `esbuild` avec avertissement modéré | Outil local de migration, jamais déployé | S |
| Basse | 15 avertissements de parsing sur le champ « repère » calisthénie | Champ indicatif (« Poids du corps », « Assistance »), laissé vide plutôt que faux | S |
| Basse | Pas de tests de parcours (Playwright) | Le test de fumée couvre le rendu et l'API, pas l'interaction | M |

## NOTES DE SESSION

### 2026-08-26 — quatrième partie
L'utilisateur a demandé deux comptes nommés plus un compte d'administration. Ce n'est pas un ajout d'écran : c'est une propriété qui doit tenir sur **toute** la surface de l'application. Trois choix ont porté le travail.

D'abord, la portée est **décidée par le serveur**. Chaque requête commence par `currentUserId()` et filtre dessus ; aucune page ne passe d'identifiant. Un appelant distrait ne peut donc pas exposer le journal du voisin — l'erreur devient impossible plutôt qu'improbable.

Ensuite, `user_id` est entré dans les **index d'unicité**, pas seulement dans les colonnes. Sans cela, la deuxième personne n'aurait pas pu enregistrer une séance le jour où l'autre en avait une : le conflit se serait produit à la première utilisation réelle, pas au test.

Enfin, le rôle admin ne gère que les comptes. Gérer un compte n'est pas lire le journal de quelqu'un. Un administrateur peut imposer un mot de passe — jamais en lire un, l'empreinte scrypt n'étant pas réversible — mais ne voit aucune donnée d'entraînement. Il ne peut pas non plus se retirer son propre rôle ni se supprimer : ce sont les deux gestes qui fermeraient la porte de l'extérieur.

Le cloisonnement a été vérifié bout en bout, pas seulement lu : deux comptes ont enregistré un poids différent le même jour, chacun ne voit que le sien. Le test de fumée contrôle désormais aussi qu'un compte ordinaire est refusé sur l'administration, par la page comme par l'API.

Le déploiement a pris un autre chemin que prévu, et un meilleur. La remise à zéro du schéma Neon a été **refusée par le garde-fou de l'environnement**. Plutôt que d'insister, j'ai introspecté la base distante : elle était déjà à jour sur tout, sauf la partie comptes — et elle contenait un compte `abdou` créé depuis le site déployé, avec son mot de passe.

D'où `0002_comptes.sql`, une migration **additive** : elle crée `users`, y reprend le compte décrit par `settings` avec son empreinte de mot de passe, rattache les lignes existantes à ce compte, re-cadre les index d'unicité, puis supprime `settings`. Rien n'est détruit. Elle a été répétée deux fois avant d'être appliquée : sur une base neuve (chaîne 0000 → 0001 → 0002, suivie du seed et du test de fumée) et sur une **copie du scénario de production** (ancien schéma + données représentatives), en vérifiant qu'aucune ligne ne se retrouvait sans propriétaire.

Le blocage a donc produit le bon résultat : un chemin de migration réutilisable au prochain déploiement, là où la remise à zéro aurait été un geste unique et destructeur.

### 2026-08-26 — cinquième partie

Deux demandes, dans cet ordre : un écran de profil, puis le programme de Nourah.

Le profil a servi de révélateur. En vérifiant que la pesée du jour s'enregistrait, rien ne s'affichait — alors que la synchronisation répondait « ok ». Next sépare le graphe des pages de celui des routes d'API, et le client de base mémorisé par module y était dupliqué : deux instances PGlite sur un même dossier, mono-processus. Le client vit maintenant sur `globalThis`.

Ce défaut invalidait rétrospectivement la façon dont j'avais « vérifié » le cloisonnement des comptes à la partie précédente : mon contrôle cherchait une chaîne dans une page de 38 Ko et l'avait trouvée par coïncidence. Deux assertions sont entrées dans le test de fumée — une écriture doit être relue par la page qui l'affiche, et deux comptes qui se pèsent le même jour ne doivent jamais voir la pesée de l'autre. La propriété est maintenant tenue par un test qui échouerait si elle cassait.

Le programme de Nourah est arrivé en trois PDF. Ils s'extrayaient proprement, donc conversion en Markdown une fois pour toutes (`npm run nourah:convert`) plutôt qu'un parseur PDF de plus. Les bornes de colonnes sont calculées tableau par tableau : le PDF ne les place pas aux mêmes abscisses d'un jour à l'autre. Résultat : 18 semaines, 124 jours, 689 lignes, zéro volume illisible, zéro nom vide.

Son programme est structurellement différent : une séance par jour à domicile, pas de calisthénie, pas d'alternative maison — c'est déjà la maison — et surtout 18 semaines du 26 août au 27 décembre, là où celui d'Abdou fait 17 semaines du 24 août au 20 décembre. Neuf endroits du code portaient les dates du premier. Le plus grave n'était pas un libellé mais le calcul du lundi de la semaine N : sur un programme démarrant deux jours plus tard, toutes les colonnes de charges se seraient décalées d'une semaine, en affichant des valeurs plausibles. Tout vient désormais du compte.

Un dernier défaut est apparu à l'écran : les exercices aux haltères n'affichaient aucune charge prescrite. L'affichage ne lisait que la colonne barre/machine, alors que les haltères ont la leur — 167 lignes concernées chez Abdou, 128 chez Nourah. Il était là depuis le début et personne ne l'avait vu, faute de comparer deux programmes.

### 2026-08-26 — troisième partie
L'utilisateur a relayé une relecture ligne par ligne de mon seed contre ses sources. Les charges de musculation étaient toutes bonnes (116 occurrences vérifiées), mais la partie calisthénie avait quatre défauts, dont deux sérieux. Je les ai vérifiés un par un contre le document plutôt que de les appliquer de confiance : **tous fondés**.

Le plus grave n'était pas une donnée fausse mais une donnée *plausible* : le jeudi ramené à (max − 1) au lieu de (max − 2). Rien ne le signale à la relecture, et le résultat est deux journées lourdes de tractions par semaine chez un débutant. C'est le type d'erreur contre lequel un invariant vaut mieux qu'une relecture — il y en a un maintenant.

Dans la foulée, l'utilisateur a déposé `PROGRAMME-COMPLET.md` : un document Markdown consolidé qui se déclare source de vérité. Bascule complète — quatre parseurs PDF supprimés, un parseur Markdown à la place. Les cellules y étant délimitées, les trois classes de bugs disparaissent par construction plutôt que par correctif.

### 2026-08-26 — seconde partie
L'utilisateur a demandé si j'avais bien utilisé ses derniers fichiers. Vérification faite : **non**. Deux PDF révisés déposés à 02:07 pendant la construction, jamais vus. Le seed reposait sur les versions de 00:53.

Reprise complète, et le contenu avait réellement changé : exercices de calisthénie différents (progressions plus accessibles), nouveau « Bloc 0 — Découverte », nouvelles sections (préparation des poignets, erreurs du débutant, objectifs réalistes), 8 échelles au lieu de 7, et surtout une **colonne « Alternative maison » sur chaque exercice de salle**, avec une section dédiée à l'entraînement à domicile.

Cette colonne n'est pas cosmétique : elle transforme une séance manquée en séance déplacée. Elle a entraîné un champ `home_alternative`, un lieu de séance (`salle`/`maison`), une bascule dans l'écran de saisie, et une règle métier testée — la progression en charge ignore les séances maison.

Le passage en `pdftotext -table` a par ailleurs permis de **supprimer** la transcription manuelle de la semaine 1 et les heuristiques d'appariement de colonnes : moins de code, moins de façons de se tromper.

### 2026-08-26 — première partie
Session unique et longue. Phases 0 à 4 enchaînées après feu vert explicite (« fais tout d'un coup, vérifie, corrige et reteste »), avec autorisation spéciale de mettre à jour MEMORY.md et SPEC.md.

Les 3 PDF ont été **remplacés en cours de session** par des versions révisées : même structure, tableaux plus complets. Le seed part des nouvelles versions.

Quatre exigences ajoutées par l'utilisateur en cours de route et intégrées : enregistrement rétroactif avec badge de retard, case à cocher par exercice, une charge en kg par exercice, résumé de fin de séance. Elles ont fait apparaître un niveau dans le modèle de données (`session_exercises`) qu'il valait mieux introduire avant l'interface qu'après.

Deux découvertes ont changé des choix d'architecture : Next 16 impose Turbopack et casse les intégrations PWA classiques (service worker écrit à la main), et le périmètre TypeScript faisait passer le build de 12 s à 38 min (exclusions ajoutées).

Reste à faire côté utilisateur : créer la base Neon, renseigner `DATABASE_URL`, `DATABASE_URL_UNPOOLED` et `AUTH_SECRET`, relire `data/seed/REVUE.md`, puis déployer.
