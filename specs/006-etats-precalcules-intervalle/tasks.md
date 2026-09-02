# Tasks: États des départements précalculés sur l'intervalle sélectionné (réglette)

**Input**: Documents de conception depuis `specs/006-etats-precalcules-intervalle/`

**Prerequisites**: plan.md, spec.md

**Tests**: inclus — le projet a des tests à chaque niveau depuis la feature 001, cette feature suit la même convention.

**Organization**: Une seule user story (P1) — pas de découpage en phases multiples.

## Format: `[ID] [P?] [US1] Description`

## Phase 1: Setup

Aucune tâche de setup : aucune nouvelle dépendance, aucune nouvelle structure de répertoire (cf. plan.md, Project Structure).

## Phase 2: Foundational

Aucune tâche fondationnelle bloquante : `computeDepartementState` existe déjà et reste réutilisé tel quel (FR-003). Cette feature ajoute une agrégation au-dessus d'un mécanisme existant, elle n'en crée pas un nouveau.

## Phase 3: User Story 1 - Défilement fluide de la réglette sur un intervalle sélectionné (Priority: P1) 🎯 MVP

**Goal**: Un utilisateur qui a sélectionné un intervalle voit la réglette répondre instantanément à chaque pas, sans appel réseau ni message de chargement, avec un état strictement identique à celui de la route par date unique.

**Independent Test**: cf. spec.md, section "Independent Test" de l'US1.

### Tests for User Story 1

- [x] T001 [P] [US1] Créer `backend/tests/unit/connecteurs/computeDepartementStateSegments.test.ts` : cas sans aucun événement sur l'intervalle (1 segment), cas avec un changement d'état au milieu de l'intervalle (2 segments contigus, bornes exactes), intervalle réduit à un seul jour (1 segment), et comparaison croisée jour par jour avec `computeDepartementState` sur l'échantillon département 13 / mai 2026 (même fixture que le test e2e existant) — aucun écart toléré (FR-004).
- [x] T002 [P] [US1] Créer `backend/tests/contract/departements-etats.test.ts` : 400 si `debut`/`fin` manquants, invalides, ou `fin` antérieure à `debut` (mêmes règles que `/evenements`, FR-010 pour la limite de durée) ; réponse 200 dont les segments par département sont contigus et couvrent intégralement `[debut, fin]` ; `connecteur_id`/`derniere_collecte` présents une seule fois par département, jamais dupliqués par segment (FR-009).
- [x] T003 [P] [US1] Créer `frontend/tests/unit/resolveEtatDepuisSegments.test.ts` : retrouve le bon segment pour une date donnée y compris aux bornes exactes (`date_debut`/`date_fin` inclusives), retombe sur un état par défaut cohérent si aucun segment ne matche (garde-fou, ne devrait pas arriver si le backend couvre bien tout l'intervalle) — aucune assertion ne doit porter sur une règle de calcul d'état (FR-007 : cette fonction ne fait qu'une comparaison de plages).

### Implementation for User Story 1

- [x] T004 [US1] `backend/src/services/computeDepartementState.ts` : ajouter une fonction (ex. `computeDepartementStateSegments(store, code, debut, fin)`) qui parcourt chaque jour de l'intervalle, appelle `computeDepartementState` pour chacun, et fusionne les jours consécutifs au résultat identique (`etat` + référence de `evenement_applicable` + `dernier_arrete_connu`) en segments contigus (FR-001, FR-003). Dépend de T001 (TDD léger, cohérent avec la convention du dépôt).
- [x] T005 [US1] `backend/src/api/routes/departements.ts` : nouvelle route `GET /departements/etats`, réutilisant la validation déjà en place pour `/evenements` (bornes, ordre `debut`/`fin`), une constante de limite de durée raisonnable (FR-010, cf. Assumptions/Complexity Tracking), et le même point de résolution département→connecteur déjà factorisé pour `connecteur_id`/`derniere_collecte` (FR-009). Dépend de T004.
- [x] T006 [US1] `specs/001-carte-arretes-rave-teknival/contracts/openapi.yaml` : documenter `GET /departements/etats` et son schéma de réponse (segments par département), même convention que le reste du contrat.
- [x] T007 [P] [US1] `frontend/src/services/apiClient.ts` : nouveau type de réponse (segments par département) + fonction `getDepartementsEtatsPeriode(debut, fin)`.
- [x] T008 [US1] `frontend/src/services/resolveEtatDepuisSegments.ts` (nouveau) : fonction pure `resolveEtatDepuisSegments(segmentsParDepartement, date): Map<string, DepartementState>` — recherche de bornes uniquement, aucune règle métier (FR-007). Dépend de T007 et T003.
- [x] T009 [US1] `frontend/src/pages/MapPage.tsx` : quand un intervalle est sélectionné dans le calendrier, charger les segments une seule fois (`getDepartementsEtatsPeriode`, FR-005) au lieu d'appeler `fetchForDate` à chaque pas de réglette ; dériver `departementsState` via un `useMemo` local (T008) à chaque changement de `currentDate` dans cet intervalle (FR-006) ; le mode "date unique" reste inchangé, continue d'utiliser `fetchForDate`/`GET /departements?date=...` (FR-008). Dépend de T008.
- [x] T010 [US1] `frontend/tests/e2e/slider-history.spec.ts` : étendre pour vérifier qu'un seul appel réseau a lieu à la sélection de l'intervalle et qu'aucun nouvel appel ni le texte "Chargement de la carte…" n'apparaît pendant le défilement de la réglette (interception réseau Playwright), en plus des assertions déjà existantes sur le changement d'état au bon jour (SC-001, SC-002).
- [x] T011 [US1] Vérification de non-régression : `npx tsc -p backend/tsconfig.json --noEmit` et `npx tsc -b` côté frontend, suites `tests/unit` + `tests/contract` backend complètes, `test:unit` frontend complet, `test:e2e` (au moins `slider-history.spec.ts`) — 0 erreur, 0 régression.

**Checkpoint**: US1 fonctionnelle et testable indépendamment — MVP de cette feature = la feature elle-même (une seule user story).

## Dependencies & Execution Order

- T001, T002 et T003 (tests) peuvent s'écrire en parallèle, avant l'implémentation (TDD léger, cohérent avec la convention déjà en place dans le dépôt).
- T004 doit précéder T005 (la route consomme la fonction de fusion), qui doit lui-même précéder T006 (le contrat documente l'implémentation, pas l'inverse) — T005 et T006 peuvent toutefois être faits dans le même commit.
- T007 doit précéder T008 (la fonction de recherche locale consomme le type de réponse), qui doit lui-même précéder T009 (le composant consomme la fonction de recherche).
- T009 doit précéder T010 (le test e2e vérifie le nouveau comportement du composant).
- T011 clôt la feature : exécuté après T001-T010.

## Notes

- Cette feature remplace l'option initialement envisagée avec l'utilisateur (debounce/déclenchement au relâchement de la réglette, `onValueCommit`) : aucune tâche de debounce n'est nécessaire ici, la recherche locale de segment étant déjà instantanée et sans réseau (cf. spec.md, Assumptions).
- Pas de tâche de migration de données : aucune nouvelle entité stockée, les segments sont calculés à la volée (Key Entities de spec.md).
- Pas de tâche de découpage MVP supplémentaire : une seule user story couvre l'intégralité de la feature.
