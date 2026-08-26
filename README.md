# Muscu — plateforme de suivi d'entraînement

Suivi d'entraînement, de diète et de progression. PWA installable, utilisable hors-ligne.

**Un programme par personne.** Aucune date, aucun découpage n'est écrit dans le code : les bornes,
les blocs, les jours et les contrôles viennent du programme importé pour le compte connecté. Deux
programmes cohabitent aujourd'hui — une musculation PPL avec calisthénie sur 17 semaines, et une
musculation à domicile sur 18 semaines, sans calisthénie.

Le contenu des programmes vient de documents Markdown qui se déclarent source de vérité :
**`PROGRAMME-COMPLET.md`** et **`PROGRAMME-NOURAH.md`**.
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

Créer ensuite les comptes. Il n'y a pas d'inscription depuis l'application : sur une adresse
publique, elle donnerait un accès à n'importe qui.

```bash
npm run users -- create --user abdou --name Abdou --password "…"
```

```bash
npm run users -- create --user admin --name Administration --password "…" --role admin
```

Puis importer le programme **d'un compte** :

```bash
npm run db:seed -- --user abdou
```

Le seed importe pour ce compte : 9 échelles de progression avec leur niveau de départ, 8 objectifs
jalonnés, 11 métriques de test, 4 contrôles, et les 17 semaines des deux programmes (299 séances
prescrites, 892 lignes d'exercices, dont 480 avec leur alternative maison). Le catalogue des 111
exercices et les 14 aliments du marché local sont partagés : ce sont des référentiels neutres.

Le seed ne touche qu'au programme du compte visé, et jamais au journal de séances — ni au sien, ni à
celui des autres. On peut donc le relancer, et importer un programme différent par personne :

```bash
npm run db:seed -- --user nourah --seed data/seed/nourah.json
```

### 5. Un programme livré en PDF

Le second programme est arrivé en trois PDF. Ils sont convertis en Markdown une fois pour toutes,
et c'est le Markdown qui alimente la suite :

```bash
pdftotext -table -enc UTF-8 musculation-nourah.pdf data/extraits/nourah-musculation.txt
```

```bash
npm run nourah:convert
```

```bash
npm run nourah:seed
```

La conversion produit `PROGRAMME-NOURAH.md` ; `nourah:seed` en tire `data/seed/nourah.json` et
`data/seed/REVUE-NOURAH.md`, et **refuse d'écrire** si un contrôle échoue : semaine sans consigne,
date en double, dimanche non chômé, ou nombre de séances de musculation qui s'écarte de trois.

### 4. Lancer

```bash
npm run dev
```

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
| `npm run db:seed -- --user X` | Importe le programme du compte X |
| `npm run users -- list` | Liste les comptes |
| `npm run users -- create --user X --password "…"` | Crée un compte (`--role admin` pour l'administration) |
| `npm run db:reset` | **Destructif** — vide le schéma |
| `npm run seed:build` | Reconstruit le seed depuis `PROGRAMME-COMPLET.md` |
| `npm run nourah:convert` | Convertit les PDF de Nourah en `PROGRAMME-NOURAH.md` |
| `npm run nourah:guide` | Ajoute son guide d'exécution au Markdown |
| `npm run nourah:seed` | Reconstruit son seed depuis ce Markdown |
| `npm run db:guides -- --user X` | Importe les seules fiches d'exécution |
| `npm run smoke` | Test de fumée autonome (après `npm run build`) — tourne toujours sur PGlite, jamais sur Neon |
| `npm run users -- password --user X --password "…"` | Remplace le mot de passe d'un compte |
| `npm run users -- rename --user X --name "…"` | Change le nom affiché |
| `npm run users -- delete --user X` | **Destructif** — supprime un compte et toutes ses données |

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
    auth/           session, comptes, cloisonnement des données
scripts/
  lib/              parseur du document source
data/
  seed/             seed produit + document de revue
```

### Plusieurs personnes, des données cloisonnées

Chaque compte a son propre programme, son propre journal, ses propres mesures. Le cloisonnement
n'est pas laissé à la discrétion des pages : **la portée est décidée par le serveur**. Chaque
requête commence par lire le compte de la session (`requireUser()`) et filtre dessus ; aucune page
ne passe d'identifiant en paramètre, un appelant distrait ne peut donc pas exposer le journal du
voisin. Les index d'unicité portent eux aussi sur le compte : deux personnes peuvent enregistrer
une séance le même jour sur le même créneau.

Le rôle `admin` sert **uniquement à gérer les comptes** — créer, renommer, remplacer un mot de
passe oublié, supprimer. Il ne donne aucun accès aux données d'entraînement des autres. Un
administrateur ne peut ni se retirer son propre rôle, ni supprimer son propre compte : ce sont les
deux gestes qui fermeraient la porte de l'extérieur.

Les mots de passe sont hachés avec scrypt (sel aléatoire, `N = 16384`) et comparés en temps
constant. Personne — pas même l'administrateur — ne peut relire un mot de passe : il ne peut qu'en
imposer un nouveau. Tant qu'un compte utilise son mot de passe d'origine, un bandeau le rappelle
sur chaque écran ; il disparaît au premier changement.

### Comment faire chaque exercice

Chaque compte a sa page **Comment faire** : tous les exercices de son programme,
un par un — placement, mouvement, erreur à éviter, repère de réussite. La même fiche apparaît sur
la page d'un exercice, là où on la cherche entre deux séries.

Les fiches sont portées par le compte, pas par le catalogue partagé. Un même mouvement ne
s'explique pas de la même façon selon le matériel : le hip thrust se fait dos à un banc en salle et
dos au canapé à la maison. Une fiche unique serait fausse pour l'un des deux.

Trois sources, par ordre de priorité : le document du compte quand il décrit l'exercice, puis le
fonds commun `data/guides/commun.md`. Les variantes de nom — « Pompes au sol, 3 s de descente »,
« Traction stricte — (max − 2) par série » — sont ramenées au mouvement par `data/guides/alias.md`,
une table explicite : un rapprochement automatique par préfixe confondrait « Traction » et
« Traction australienne », qui sont deux mouvements différents.

**Un exercice sans fiche bloque la construction du seed.** Une page « comment faire » avec des
trous ne remplit pas son office.

### Rien du programme n'est écrit dans le code

Les bornes de dates, le nombre de semaines, les noms de blocs, les dates de contrôle et jusqu'à la
présence d'un onglet « Calisthénie » viennent du compte connecté. Ce n'était pas le cas au départ :
neuf endroits portaient les dates du premier programme, dont un qui calculait le lundi de la semaine
N à partir d'une constante — sur un second programme démarrant deux jours plus tard, toutes les
colonnes de charges se seraient décalées d'une semaine, sans rien afficher d'anormal.

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

### Saisir ce qui s'est réellement passé

Le programme prescrit, la réalité s'en écarte. L'application couvre les trois écarts courants :

| Situation | Ce que tu fais |
|---|---|
| Salle fermée, imprévu | Bouton **maison** sur la séance : chaque exercice affiche son équivalent domicile |
| Machine occupée | **Remplacer** : l'exercice prévu passe en « non fait », le substitut s'ajoute |
| Entraînement en plus | **Ajouter un exercice**, choisi dans le catalogue ou créé à la volée |
| Activité hors musculation | Créer l'exercice avec **son unité** — sauts, mètres, minutes |
| Jour sans programme | **Entraînement libre**, avec son titre |
| Séance oubliée | N'importe quel jour passé s'ouvre depuis **Programme** ou le calendrier |

Une séance maison compte pour l'assiduité mais pas pour la progression en charge : le document est
explicite, les deux échelles ne se comparent pas.

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
3. Depuis ta machine, en pointant sur la base Neon : lancer les migrations, créer les comptes, puis
   importer le programme de chacun.

```bash
npm run db:migrate
```

```bash
npm run users -- create --user abdou --name Abdou --password "…"
```

```bash
npm run db:seed -- --user abdou
```

4. Se connecter, puis **changer immédiatement les mots de passe** depuis l'écran *Compte* : ceux
   posés à la création ont transité par une ligne de commande et un canal de discussion.

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
