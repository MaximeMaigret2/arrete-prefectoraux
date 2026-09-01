# Implementation Plan: États des départements précalculés sur l'intervalle sélectionné (réglette)

**Branch**: `006-etats-precalcules-intervalle` | **Date**: 2026-09-01 | **Spec**: `specs/006-etats-precalcules-intervalle/spec.md`

**Input**: Feature specification from `specs/006-etats-precalcules-intervalle/spec.md`

## Summary

Ajouter une route `GET /departements/etats?debut=&fin=` qui renvoie, pour chaque département, l'état déjà résolu par `computeDepartementState` sous forme de segments contigus couvrant l'intervalle demandé (fusion des jours consécutifs au résultat identique). Le frontend charge ces segments une seule fois à la sélection de l'intervalle, puis retrouve localement — par simple comparaison de bornes, sans aucune règle métier dupliquée — l'état à afficher à chaque pas de la réglette. Supprime à la racine le flash "Chargement de la carte…" observé aujourd'hui à chaque jour de défilement, sans introduire de jeu de données ni de logique de calcul parallèle côté client (Principe 9).

## Technical Context

**Language/Version**: TypeScript (Node.js ≥20 backend, React 18 frontend) — identique à l'existant, aucun changement.

**Primary Dependencies**: Fastify + Zod (backend, déjà en place), React + `@radix-ui/react-slider` (frontend, déjà en place). Aucune nouvelle dépendance.

**Storage**: Fichiers JSON/YAML existants, lus via `loadDataStore()`. Aucun nouveau fichier, aucune nouvelle entité : les segments sont calculés à la volée à partir des mêmes données que `GET /departements?date=...`, jamais persistés.

**Testing**: Vitest + supertest côté backend (nouveau `tests/contract/departements-etats.test.ts`, nouveau test unitaire pour la fonction de fusion en segments), Vitest + Testing Library côté frontend (nouveau test unitaire pour la fonction de recherche locale), Playwright côté frontend (extension de `tests/e2e/slider-history.spec.ts` existant).

**Target Platform**: Web (identique à l'existant) — API Fastify + SPA React.

**Project Type**: Web application (backend/frontend), structure déjà en place.

**Performance Goals**: Le volume de la réponse reste proportionnel au nombre réel de changements d'état sur l'intervalle (segments), pas au nombre de jours (SC-004 de spec.md). Le calcul serveur, lui, boucle sur chaque jour de l'intervalle en interne (réutilisation directe de `computeDepartementState`, non optimisée analytiquement dans cette feature) — négligeable à l'échelle actuelle (96 départements, 5 événements en production), à réévaluer si le volume d'événements croît significativement (feature 005 du backlog). Côté client, la recherche locale du segment à chaque pas de réglette est une comparaison de bornes sur au plus quelques dizaines de segments par département — coût négligeable, pas de mesure de performance dédiée nécessaire.

**Constraints**: Ne dupliquer aucune règle de `computeDepartementState` côté frontend (FR-007 de spec.md, Principe 9 de la constitution) — la fonction de recherche locale ne DOIT faire qu'une comparaison de plages de dates déjà résolues par le serveur. Ne pas modifier le chemin "date unique" existant (FR-008).

**Scale/Scope**: 96 départements, 1 nouvelle route backend, 1 fonction de fusion en segments (backend), 1 fonction de recherche locale (frontend), 1 composant modifié (`MapPage.tsx`), 1 contrat OpenAPI mis à jour, 1 test e2e étendu.

## Constitution Check

*GATE: doit passer avant toute implémentation.*

- **Principe 9 (toutes les données via une API, frontend sans jeu de données parallèle)** : respecté — le calcul de l'état d'un département reste intégralement côté API (réutilisation directe de `computeDepartementState`, aucune règle dupliquée) ; le frontend ne fait qu'une recherche de bornes sur des segments déjà résolus par le serveur, ce qui reste un usage de l'API comme unique source de vérité, pas un calcul parallèle.
- **Principe 6 (rigueur temporelle)** : respecté — les bornes de chaque segment sont dérivées du même mécanisme Europe/Paris déjà testé (`parisDate.ts`, `computeDepartementState`), aucun nouveau calcul de fuseau horaire introduit.
- **Principe 5 (simplicité d'architecture)** : respecté — aucune nouvelle dépendance, aucun nouveau stockage ; la nouvelle route est un point d'agrégation au-dessus d'une fonction déjà existante et testée.
- **Principe 2 (historisation immuable)** : respecté — aucun nouvel état stocké ; les segments sont une vue calculée à la demande, jamais persistée.
- Aucune violation identifiée — une seule entrée mineure en Complexity Tracking (limite de taille d'intervalle, nouvelle constante de configuration).

## Project Structure

### Documentation (this feature)

```text
specs/006-etats-precalcules-intervalle/
├── spec.md    # Spécification (ce dossier)
├── plan.md    # Ce fichier
└── tasks.md   # Détail des tâches
```

Pas de `research.md`/`data-model.md`/`contracts/` dédiés : aucune inconnue technique à lever (Technical Context entièrement renseigné), aucune nouvelle entité persistée (Key Entities de spec.md : "Segment d'état" est une forme de réponse API dérivée, pas un modèle stocké). Le contrat existant (`specs/001-carte-arretes-rave-teknival/contracts/openapi.yaml`) est mis à jour en place, comme pour la feature 004.

### Source Code (repository root)

```text
backend/
├── src/
│   ├── services/computeDepartementState.ts   # Ajout d'une fonction de fusion en segments sur un intervalle
│   └── api/routes/departements.ts            # Nouvelle route GET /departements/etats
└── tests/
    ├── unit/connecteurs/computeDepartementStateSegments.test.ts   # Nouveau
    └── contract/departements-etats.test.ts                          # Nouveau

frontend/
├── src/
│   ├── services/apiClient.ts                    # Nouveau type + nouvelle fonction d'appel
│   ├── services/resolveEtatDepuisSegments.ts     # Nouveau, fonction pure de recherche de segment
│   └── pages/MapPage.tsx                         # Charge les segments à la sélection d'intervalle, dérive l'état localement au lieu de fetcher par pas de réglette
└── tests/
    ├── unit/resolveEtatDepuisSegments.test.ts    # Nouveau
    └── e2e/slider-history.spec.ts                 # Étendu (vérifie l'absence d'appel réseau/flash pendant le défilement)
```

**Structure Decision**: Web application déjà en place (`backend/` + `frontend/`) — cette feature n'ajoute aucun répertoire, uniquement des modifications ciblées et deux nouveaux fichiers utilitaires (un par côté) dans les répertoires déjà en place.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Nouvelle constante de limite de durée d'intervalle sur `GET /departements/etats` | Éviter qu'un intervalle démesuré ne dégrade le temps de réponse (la boucle jour-par-jour interne n'est pas optimisée analytiquement dans cette feature) | Ne rien borner reporterait le risque à un incident de performance futur plutôt que de le prévenir simplement dès maintenant, pour un coût d'implémentation négligeable |
