# Tasks: Date de dernière collecte affichée par département

**Input**: Documents de conception depuis `specs/004-derniere-collecte-departement/`

**Prerequisites**: plan.md, spec.md

**Tests**: inclus — le projet a des tests à chaque niveau depuis la feature 001, cette feature suit la même convention.

**Organization**: Une seule user story (P1) — pas de découpage en phases multiples.

## Format: `[ID] [P?] [US1] Description`

## Phase 1: Setup

Aucune tâche de setup : aucune nouvelle dépendance, aucune nouvelle structure de répertoire (cf. plan.md, Project Structure).

## Phase 2: Foundational

Aucune tâche fondationnelle bloquante : la donnée (`Connecteur.derniere_collecte`) et le point de résolution département→connecteur existent déjà dans `backend/src/api/routes/departements.ts`. Cette feature étend un mécanisme existant, elle n'en crée pas un nouveau.

## Phase 3: User Story 1 - Voir la fraîcheur de la donnée d'un département précis (Priority: P1) 🎯 MVP

**Goal**: Un utilisateur qui survole un département vert/rouge voit, dans l'infobulle déjà existante, la date de dernière collecte de la source pour ce département.

**Independent Test**: cf. spec.md, section "Independent Test" de l'US1.

### Tests for User Story 1

- [ ] T001 [P] [US1] Étendre `backend/tests/contract/departements.test.ts` : `derniere_collecte` non nul et cohérent avec `backend/src/data/connecteurs.json` pour un département vert et un département rouge connus (ex. '13', '77') ; `derniere_collecte: null` pour tout département à l'état gris.
- [ ] T002 [P] [US1] Créer `frontend/tests/unit/Tooltip.test.tsx` : la date de collecte s'affiche pour les états vert et rouge quand `derniere_collecte` est renseigné, ne s'affiche pas quand `derniere_collecte` est `null` (état gris, ou vert/rouge avec collecte jamais exécutée).

### Implementation for User Story 1

- [ ] T003 [US1] `backend/src/api/routes/departements.ts` : dans le handler `GET /departements`, factoriser la résolution du connecteur (déjà utilisée pour `connecteur_id`) pour en dériver aussi `derniere_collecte` — `null` systématique quand `etat === 'gris'`. Un seul point de résolution pour les deux champs (spec.md, Assumptions).
- [ ] T004 [US1] `specs/001-carte-arretes-rave-teknival/contracts/openapi.yaml` : ajouter `derniere_collecte` (nullable, `format: date-time`) au schéma `DepartementState`, avec la même description que FR-001/FR-002 de spec.md.
- [ ] T005 [P] [US1] `frontend/src/services/apiClient.ts` : ajouter `derniere_collecte: string | null` à l'interface `DepartementState`.
- [ ] T006 [US1] `frontend/src/components/Map/Tooltip.tsx` : afficher la date de dernière collecte (fuseau Europe/Paris, FR-004) pour les états vert et rouge quand elle est renseignée, immédiatement après le contenu déjà affiché pour cet état — rien pour l'état gris (dépend de T005).
- [ ] T007 [US1] Vérification de non-régression : `npx tsc -p backend/tsconfig.json --noEmit` et `npx tsc -b` côté frontend, suite `tests/unit` + `tests/contract` backend complète, `test:unit` frontend complet — 0 erreur, 0 régression.

**Checkpoint**: US1 fonctionnelle et testable indépendamment — MVP de cette feature = la feature elle-même (une seule user story).

## Dependencies & Execution Order

- T001 et T002 (tests) peuvent s'écrire en parallèle, avant l'implémentation (TDD léger, cohérent avec la convention déjà en place dans le dépôt).
- T003 doit précéder T004 (le contrat documente l'implémentation, pas l'inverse) mais peut être fait dans le même commit.
- T005 doit précéder T006 (le composant consomme le type).
- T007 clôt la feature : exécuté après T001-T006.

## Notes

- Pas de tâche de migration de données : `derniere_collecte` existe déjà pour les 96 connecteurs réels (vérifié sur `connecteurs.json`).
- Pas de tâche de découpage MVP supplémentaire : une seule user story couvre l'intégralité de la feature.
