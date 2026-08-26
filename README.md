# Muscu — plateforme de suivi d'entraînement

Suivi des 17 semaines de programme du **24 août au 20 décembre 2026** : musculation PPL le soir,
calisthénie matin et soir, diète recomposition. PWA installable, utilisable hors-ligne.

Le contenu des programmes vient de **`PROGRAMME-COMPLET.md`**, qui se déclare source de vérité.
L'application remplace le papier en tant qu'outil de saisie, notamment les trois tableaux que le
document laisse volontairement vides (tableau de charges, tests de force, contrôles physiques).

---

## Démarrer

### 1. Installer

```bash
npm install
```

### 2. Configurer

Copie `.env.example` vers `.env.local` et renseigne :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Chaîne Neon *pooled*, utilisée à l'exécution |
| `DATABASE_URL_UNPOOLED` | Connexion directe, utilisée par les migrations |
| `AUTH_SECRET` | Secret de session, 32 caractères minimum |

Génère le secret :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Sans `DATABASE_URL`**, l'application bascule automatiquement sur une base locale
[PGlite](https://pglite.dev) (Postgres compilé en WebAssembly, dossier `.pglite/`). Pratique pour
développer sans identifiants ; refusé en production.

### 3. Préparer la base

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

Le seed importe : 111 exercices, 9 échelles de progression avec leur niveau de départ, 8 objectifs
jalonnés, 11 métriques de test, 14 aliments du marché local, et les 17 semaines des deux programmes
(299 séances prescrites, 892 lignes d'exercices, dont 480 avec leur alternative maison).

### 4. Lancer

```bash
npm run dev
```

Au premier lancement, l'écran de connexion propose de **créer** le mot de passe. Un seul compte.

---

## Le programme en base

Le référentiel est reconstruit depuis le document source, pas saisi à la main :

```bash
npm run seed:build
```

Cette commande lit `PROGRAMME-COMPLET.md` et produit :

- `data/seed/programme.json` — les données importées ensuite en base ;
- `data/seed/REVUE.md` — **le même contenu, lisible, à relire avant l'import**.

Le script **refuse d'écrire** si un contrôle de cohérence échoue : dates incohérentes, doublons,
temps de repos non conformes à la structure des 60 minutes, alternative maison manquante, ou
journée de volume du jeudi qui ne serait pas plus légère que celle du lundi.

> **Pourquoi le Markdown plutôt que les PDF.** L'extraction depuis un PDF est un aller-retour
> lossy, et trois classes de bugs en sont sorties : des colonnes qui dérivent d'une ligne, des
> fourchettes écrasées sur leur borne haute (`4 × 20–30 s` devenu `4 × 30 s`), et des consignes
> tronquées. Le pire était silencieux : la journée de volume du jeudi, prescrite à `max − 2`,
> ramenée à `max − 1` — soit deux journées lourdes de tractions par semaine. Dans un tableau
> Markdown les cellules sont délimitées : ces bugs n'ont plus de place où exister.

## Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run verify` | Typecheck + lint + tests |
| `npm test` | Tests unitaires du domaine métier |
| `npm run db:generate` | Génère une migration depuis le schéma |
| `npm run db:migrate` | Applique les migrations |
| `npm run db:seed` | Importe le référentiel |
| `npm run db:reset` | **Destructif** — vide le schéma |
| `npm run seed:build` | Reconstruit le seed depuis `PROGRAMME-COMPLET.md` |
| `npm run smoke` | Test de fumée autonome (après `npm run build`) |
| `npm run db:reset-password` | Efface le mot de passe local |

---

## Architecture

```
src/
  app/
    (app)/          pages protégées par authentification
    api/            sync (écritures), jour (lecture), auth
  components/       interface, formulaires de saisie
  lib/
    domain/         règles métier pures et testées
    db/             schéma Drizzle et client
    local/          IndexedDB et file d'attente hors-ligne
    auth/           session mono-utilisateur
scripts/
  lib/              parseur du document source
data/
  seed/             seed produit + document de revue
```

### Le domaine métier est isolé

`src/lib/domain/` ne connaît ni la base ni React : ce sont des fonctions pures, couvertes par
**120 tests**. C'est là que vivent les règles du programme, et c'est là qu'une erreur coûterait le
plus cher :

- **double progression** — haut de fourchette tenu sur toutes les séries → +2,5 kg (haut du corps)
  ou +5 kg (bas), et retour au bas de la fourchette ;
- **règle de la série test** — ±2,5 à 5 kg selon le résultat de la première série ;
- **règle du (max − N)** en calisthénie — le décalage vaut 1 les jours de force et 2 le jeudi,
  journée de volume volontairement plus légère — et passage de niveau après deux séances propres
  consécutives ;
- **séances à la maison** : elles comptent pour l'assiduité mais sont exclues de la progression en
  charge, le programme précisant que les deux échelles ne se comparent pas ;
- **moyenne mobile 7 jours** et verdict de recomposition croisant poids, tour de taille et charges ;
- **quatre signaux d'alerte** : douleur articulaire au-delà de 48 h, baisse de performance sur deux
  séances, sommeil dégradé, fréquence cardiaque de repos élevée.

### Le hors-ligne est une décision d'architecture, pas une option

La séance de salle est à 23h, au Sénégal, avec un réseau qui peut lâcher. Les deux chemins sont
séparés :

| Chemin | Comportement |
|---|---|
| **Écriture** | IndexedDB d'abord, file d'attente (`outbox`), envoi dès que le réseau revient |
| **Lecture référentiel** | Mise en cache locale : la séance du jour s'affiche sans réseau |
| **Lecture analytique** | Calculée côté serveur — on ne consulte pas un tableau de bord entre deux séries |

Chaque mutation porte un identifiant généré côté client, enregistré en base : la rejouer ne crée pas
de doublon.

Le serveur reste la source de vérité. iOS peut purger le stockage d'une PWA après plusieurs semaines
sans ouverture : le local n'est qu'un tampon.

### Service worker écrit à la main

Next 16 utilise Turbopack par défaut et **fait échouer le build** en présence d'une configuration
webpack personnalisée — ce dont dépendent les intégrations PWA courantes (`@serwist/next`). Les
besoins étant simples (précache de la coquille, réseau d'abord pour les données), `public/sw.js` est
écrit directement. La file d'attente vit de toute façon côté application.

### Graphiques en SVG pur

Pas de bibliothèque de graphiques : les courbes se rendent côté serveur, sans JavaScript envoyé au
client. Sur une connexion mobile facturée au volume, c'est un choix produit.

---

## Déployer sur Vercel

1. Pousser le dépôt sur GitHub, puis importer le projet dans Vercel.
2. Renseigner `DATABASE_URL`, `DATABASE_URL_UNPOOLED` et `AUTH_SECRET` dans les variables
   d'environnement du projet.
3. Lancer les migrations et le seed une fois, depuis ta machine, en pointant sur la base Neon.

## Installer la PWA

- **Android / Chrome** : menu → « Installer l'application ».
- **iPhone / Safari** : Partager → « Sur l'écran d'accueil ». Les notifications ne fonctionnent
  qu'une fois l'application installée, et à partir d'iOS 16.4.
- **Ordinateur** : icône d'installation dans la barre d'adresse.

---

## Points connus

- `drizzle-kit` tire une version d'`esbuild` avec un avertissement de sécurité modéré. L'outil ne
  sert qu'aux migrations locales et n'est jamais déployé.
- Les fiches d'exécution des exercices (position, exécution, erreur à éviter) ne sont pas encore
  importées.
- Les photos de progression ne sont pas encore branchées sur un stockage externe.
