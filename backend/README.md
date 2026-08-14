# Backend — API Carte des arrêtés d'interdiction de rassemblements musicaux non déclarés

API publique en lecture seule (Fastify 4 + TypeScript), sans authentification, exposant l'état des
101 départements français et l'historique complet des arrêtés (rave party / teknival). Voir
`../specs/001-carte-arretes-rave-teknival/` pour la spécification, le plan et le contrat OpenAPI complets.

## Prérequis

- Node.js 20 LTS

## Installation

```bash
npm install
```

## Lancement

```bash
npm run dev     # serveur de développement (tsx watch), http://localhost:3000
npm run build   # compilation TypeScript -> dist/
npm start       # exécute dist/server.js (après build)
```

## Tests

```bash
npm run test:unit         # logique de calcul d'état (computeDepartementState)
npm run test:contract     # contrats des endpoints (Supertest)
npm run test:integration  # cohérence API ↔ calcul (SC-005)
npm test                  # toute la suite
```

### Tests de dérive des connecteurs réels (`test:live-drift`)

```bash
npm run test:live-drift   # JAMAIS dans npm test / CI — déclenchement manuel uniquement
```

Suite séparée (`vitest.live.config.ts`, `tests/live/connecteurs/*.live.test.ts`) qui fait un **vrai
appel réseau** vers le site de chaque préfecture connectée (une requête, pas de scan complet) pour
vérifier que les sélecteurs de `src/connecteurs/configs/*.yaml` matchent encore la structure HTML
réelle — sans jamais rien affirmer sur le *contenu* (titres, dates, nombre de bulletins), qui change
en permanence et n'est pas sous notre contrôle : seule la *structure* (sélecteurs, présence d'un lien
PDF, page joignable) est vérifiée, pour ne pas produire de faux échecs à chaque publication normale.

Volontairement exclue de `vitest.config.ts` (`exclude: [..., 'tests/live/**']`) et donc absente de
`npm test`/`test:unit`/`test:contract`/`test:integration` et de toute CI. À lancer à la main, sans
cadence imposée — par exemple avant de réactiver un connecteur resté inactif un moment, ou en cas de
doute sur une baisse silencieuse du volume d'événements collectés pour un département. Un échec
signale une dérive de structure à examiner (site redesigné, URL changée), pas un bug de code.

## Données

Stockage fichier JSON versionné (`src/data/departements.json`, `src/data/connecteurs.json`,
`src/data/events/<code>.json`), chargé en mémoire au démarrage (voir
`../specs/001-carte-arretes-rave-teknival/research.md` §3 pour la justification de ce choix).

Le jeu de données livré ici est un **jeu de test minimal** (quickstart.md) : département `77`
(interdiction active sans fin), `13` (interdiction levée), `2A` (non couvert), `33` (chevauchement
interdiction/prolongation). À remplacer par des connecteurs réels avant mise en production.

## API

- `GET /api/v1/departements?date=YYYY-MM-DD`
- `GET /api/v1/departements/{code}/evenements`
- `GET /api/v1/evenements?debut=YYYY-MM-DD&fin=YYYY-MM-DD`
- `GET /documentation/json` — schéma OpenAPI généré

## Constat d'environnement (transparence)

Ce projet a été généré dans un environnement d'exécution dont l'accès réseau sortant est
restreint (registre npm et `raw.githubusercontent.com` inaccessibles). `npm install` et
l'exécution des suites de tests n'ont donc pas pu être validés dans cet environnement — à faire en
premier lieu après clonage sur une machine avec accès réseau standard.
