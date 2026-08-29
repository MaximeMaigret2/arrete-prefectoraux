# Implementation Plan: Date de dernière collecte affichée par département

**Branch**: `004-derniere-collecte-departement` | **Date**: 2026-08-29 | **Spec**: `specs/004-derniere-collecte-departement/spec.md`

**Input**: Feature specification from `specs/004-derniere-collecte-departement/spec.md`

## Summary

Exposer, pour chaque département vert/rouge de `GET /departements`, la `derniere_collecte` du connecteur qui le couvre (donnée déjà stockée, jamais calculée), et l'afficher dans l'infobulle par département (`Tooltip.tsx`), en complément de la date de mise à jour globale déjà affichée en en-tête (FR-012). Aucune nouvelle entité, aucun nouveau fichier de données, aucune migration : extension additive d'une réponse API existante + un composant frontend existant.

## Technical Context

**Language/Version**: TypeScript (Node.js ≥20 backend, React 18 frontend) — identique à l'existant, aucun changement.

**Primary Dependencies**: Fastify + Zod (backend, déjà en place), React + `react-simple-maps` (frontend, déjà en place). Aucune nouvelle dépendance.

**Storage**: Fichiers JSON/YAML existants (`backend/src/data/connecteurs.json`), lus via `loadDataStore()`. Aucun nouveau fichier, aucune écriture nouvelle : `Connecteur.derniere_collecte` est déjà maintenu par `updateConnecteur()` (feature 002).

**Testing**: Vitest + supertest côté backend (`tests/contract/departements.test.ts`), Vitest + Testing Library côté frontend (`frontend/tests/unit/`).

**Target Platform**: Web (identique à l'existant) — API Fastify + SPA React.

**Project Type**: Web application (backend/frontend), structure déjà en place.

**Performance Goals**: Aucun impact mesurable attendu — un champ supplémentaire dans une réponse déjà chargée en mémoire (`DataStore`), pas de requête ni de calcul additionnel coûteux.

**Constraints**: Ne pas modifier le schéma `Connecteur` (Key Entities de spec.md) ; ne pas dupliquer la logique de résolution département→connecteur déjà utilisée pour `connecteur_id` (Assumptions de spec.md) — un seul point de résolution, réutilisé pour les deux champs.

**Scale/Scope**: 96 départements, 1 endpoint modifié (`GET /departements`), 1 composant modifié (`Tooltip.tsx`), 1 contrat OpenAPI mis à jour.

## Constitution Check

*GATE: doit passer avant toute implémentation.*

- Principe "API comme unique source de vérité côté frontend" (FR-011, feature 001) : respecté — la donnée transite exclusivement par `GET /departements`, aucun état parallèle côté client.
- Principe de rigueur temporelle (Principe 6) : respecté — `derniere_collecte` est déjà stockée en ISO 8601 UTC (schéma `Connecteur`), affichée en Europe/Paris comme le reste (FR-004).
- Aucune violation identifiée — pas d'entrée dans Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/004-derniere-collecte-departement/
├── spec.md    # Spécification (ce dossier)
├── plan.md    # Ce fichier
└── tasks.md   # Détail des tâches
```

Pas de `research.md`/`data-model.md`/`contracts/` dédiés : aucune inconnue technique à lever (Technical Context entièrement renseigné sans NEEDS CLARIFICATION), aucune nouvelle entité (Key Entities de spec.md : `Connecteur` existant, champ déjà présent). Le contrat existant (`specs/001-carte-arretes-rave-teknival/contracts/openapi.yaml`) est mis à jour en place — il documente déjà `GET /departements`, cette feature l'étend plutôt que de le dupliquer.

### Source Code (repository root)

```text
backend/
├── src/
│   └── api/routes/departements.ts   # Ajout du champ derniere_collecte par département
└── tests/
    └── contract/departements.test.ts   # Assertions sur le nouveau champ

frontend/
├── src/
│   ├── services/apiClient.ts        # Ajout du champ au type DepartementState
│   └── components/Map/Tooltip.tsx   # Affichage de la date par département
└── tests/unit/
    └── Tooltip.test.tsx              # Nouveau fichier de test
```

**Structure Decision**: Web application déjà en place (`backend/` + `frontend/`, feature 001/002/003 inchangées) — cette feature n'ajoute aucun répertoire, uniquement des modifications ciblées dans les fichiers listés ci-dessus.

## Complexity Tracking

Aucune violation de la Constitution Check — section sans objet.
