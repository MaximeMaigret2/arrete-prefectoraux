---

description: "Task list template for feature implementation"
---

# Tasks: Carte interactive des arrêtés d'interdiction de rassemblements musicaux non déclarés

**Input**: Design documents from `/specs/001-carte-arretes-rave-teknival/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md, `.specify/memory/constitution.md`

**Tests**: Included. La constitution impose des tests unitaires pour `computeDepartementState` (Workflow de développement) et le plan retient explicitement Vitest/Supertest/Playwright avec des scripts `test:unit`/`test:contract`/`test:e2e` référencés comme critère de sortie dans quickstart.md.

**Organization**: Tasks are grouped by user story (P1 → P4, voir spec.md) pour permettre une implémentation et une validation indépendantes de chacune.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Peut s'exécuter en parallèle (fichiers différents, pas de dépendance)
- **[Story]**: User story à laquelle la tâche est rattachée (US1–US4)
- Chemins de fichiers exacts inclus dans chaque description

## Path Conventions

Web app (Option 2, voir plan.md) : `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialisation des projets backend et frontend

- [X] T001 Créer l'arborescence `backend/` et `frontend/` conforme à la section Project Structure de plan.md
- [X] T002 Initialiser le projet `backend/` (TypeScript 5.x, Node 20 LTS) avec les dépendances Fastify 4.x, `@fastify/swagger`, `@fastify/cors`, `zod` dans `backend/package.json`
- [X] T003 Initialiser le projet `frontend/` (Vite + React 18 + TypeScript) avec les dépendances `react-simple-maps`, `d3-geo`, `topojson-client`, `date-fns`, `date-fns-tz`, `react-day-picker`, `@radix-ui/react-slider` dans `frontend/package.json`
- [X] T004 [P] Configurer ESLint + Prettier pour `backend/` (`backend/.eslintrc.cjs`, `backend/.prettierrc`)
- [X] T005 [P] Configurer ESLint + Prettier pour `frontend/` (`frontend/.eslintrc.cjs`, `frontend/.prettierrc`)
- [X] T006 [P] Configurer Vitest pour le backend dans `backend/vitest.config.ts`
- [X] T007 [P] Configurer Vitest + Testing Library pour le frontend dans `frontend/vitest.config.ts`
- [X] T008 [P] Configurer Playwright pour les tests e2e frontend dans `frontend/playwright.config.ts`
- [X] T009 Récupérer et convertir `departements.geojson` (gregoiredavid/france-geojson, version simplifiée) en `frontend/src/assets/departements.topojson` (research.md §1)

**Checkpoint**: Projets initialisés, outillage de lint/test en place.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Modèle de données, chargement, calcul d'état — socle utilisé par les 4 user stories

**⚠️ CRITICAL**: Aucune user story ne démarre avant la fin de cette phase

- [X] T010 [P] Définir les types TypeScript + schémas zod `Département`, `Événement`, `Connecteur` (data-model.md) dans `backend/src/models/`
- [X] T011 Créer `backend/src/data/departements.json` (référentiel statique des 101 départements : `code` + `nom`, codes INSEE alignés sur le topojson de T009)
- [X] T012 [P] Créer le jeu de données de test dans `backend/src/data/events/` et `backend/src/data/connecteurs.json` couvrant : département `77` (interdiction active sans `date_fin`), `13` (interdiction suivie d'une `levee`), `2A` (aucun connecteur), un chevauchement (`prolongation` posée avant expiration d'une `interdiction`) — conforme aux Prérequis de quickstart.md
- [X] T013 Implémenter le chargeur en mémoire (`events/<code>.json`, `connecteurs.json`, `departements.json`) dans `backend/src/data/loader.ts` (dépend de T010, T011, T012)
- [X] T014 Implémenter la fonction pure `computeDepartementState(code, date)` selon l'algorithme de data-model.md §Logique de calcul dans `backend/src/services/computeDepartementState.ts` (dépend de T013)
- [X] T015 [P] Tests unitaires de `computeDepartementState` — minimum imposé par la constitution : absence d'arrêté, arrêté sans `date_fin`, chevauchement de deux arrêtés, date exactement égale à une borne (début/fin) dans `backend/tests/unit/computeDepartementState.test.ts` (dépend de T014)
- [X] T016 Mettre en place le squelette Fastify avec `@fastify/cors` (ouvert) et `@fastify/swagger` dans `backend/src/api/app.ts` (dépend de T013)
- [X] T017 [P] Mettre en place la coquille de l'application frontend (point d'entrée, route de page principale) dans `frontend/src/pages/MapPage.tsx`
- [X] T018 [P] Implémenter `apiClient.ts`, unique point de consommation de l'API, dans `frontend/src/services/apiClient.ts`

**Checkpoint**: Socle prêt — les user stories peuvent démarrer, y compris en parallèle.

---

## Phase 3: User Story 1 - Consulter l'état actuel des départements sur la carte (Priority: P1) 🎯 MVP

**Goal**: Afficher au chargement une carte de France où chaque département est coloré vert/rouge/gris selon son état du jour, avec indicateur non fondé sur la seule couleur.

**Independent Test**: Charger l'application sans interaction et vérifier que les ~101 départements affichent chacun l'un des trois états, cohérent avec le jeu de données du jour.

### Tests for User Story 1

- [X] T019 [P] [US1] Test de contrat pour `GET /api/v1/departements?date=...` dans `backend/tests/contract/departements.test.ts`

### Implementation for User Story 1

- [X] T020 [US1] Implémenter la route `GET /api/v1/departements` (validation zod du paramètre `date`, appel à `computeDepartementState` pour chaque département) dans `backend/src/api/routes/departements.ts` (dépend de T014, T019)
- [X] T021 [US1] Enregistrer la route `/api/v1/departements` dans `backend/src/api/app.ts` (dépend de T020)
- [X] T022 [P] [US1] Implémenter le composant Map (rendu SVG des départements coloré par état via `react-simple-maps`) dans `frontend/src/components/Map/Map.tsx`
- [X] T023 [P] [US1] Implémenter le composant Legend avec indicateurs non-couleur (motif/icône/texte, FR-002/WCAG 2.1 AA) dans `frontend/src/components/Legend/Legend.tsx`
- [X] T024 [US1] Connecter `MapPage` à `GET /api/v1/departements` pour la date du jour et rendre Map + Legend dans `frontend/src/pages/MapPage.tsx` (dépend de T018, T022, T023)
- [X] T025 [US1] Afficher la date de dernière mise à jour (FR-012) et la mention "ne remplace pas une vérification officielle" (FR-014) dans `frontend/src/pages/MapPage.tsx` (dépend de T024)
- [X] T026 [P] [US1] Test e2e : chargement de l'application, vérification que tous les départements affichent un des 3 états avec indicateur non-couleur dans `frontend/tests/e2e/map-load.spec.ts`

**Checkpoint**: User Story 1 fonctionnelle et testable indépendamment (MVP livrable).

---

## Phase 4: User Story 2 - Rejouer l'historique via calendrier et réglette (Priority: P2)

**Goal**: Permettre la sélection d'une date/intervalle et le défilement jour par jour de l'historique, avec recalcul de la carte sans rechargement.

**Independent Test**: Choisir un intervalle connu incluant la pose et la levée d'un arrêté, faire défiler la réglette jour par jour, vérifier que le département concerné change de couleur au bon jour.

### Implementation for User Story 2

- [X] T027 [P] [US2] Implémenter le composant Calendar (date unique / intervalle) avec `react-day-picker` dans `frontend/src/components/Calendar/Calendar.tsx`
- [X] T028 [P] [US2] Implémenter le composant Slider (défilement jour par jour, accessible) avec `@radix-ui/react-slider` dans `frontend/src/components/Slider/Slider.tsx`
- [X] T029 [US2] Connecter Calendar + Slider à `MapPage` : la sélection d'un intervalle active les bornes de la réglette, chaque pas re-fetch `GET /api/v1/departements` et re-rend la carte sans rechargement dans `frontend/src/pages/MapPage.tsx` (dépend de T024, T027, T028)
- [X] T030 [US2] Gérer le chemin "date unique" (validation → un seul fetch, réglette non requise) dans `frontend/src/pages/MapPage.tsx` (dépend de T029)
- [X] T031 [P] [US2] Étendre les tests unitaires de `computeDepartementState` : bascule exacte au lendemain de `date_fin`, date antérieure à toute donnée collectée → gris (jamais vert par défaut) dans `backend/tests/unit/computeDepartementState.test.ts` (dépend de T015)
- [X] T032 [P] [US2] Test e2e : sélection d'un intervalle couvrant pose+levée d'un arrêté, défilement jour par jour, vérification du changement de couleur au jour exact dans `frontend/tests/e2e/slider-history.spec.ts`

**Checkpoint**: User Stories 1 et 2 fonctionnelles indépendamment.

---

## Phase 5: User Story 3 - Consulter le détail d'un arrêté au survol (Priority: P3)

**Goal**: Afficher au survol d'un département une infobulle avec référence/dates de l'arrêté, ou "non couvert" si aucune donnée.

**Independent Test**: Survoler un département rouge, un vert et un gris, et vérifier le contenu de chaque infobulle.

### Implementation for User Story 3

- [X] T033 [P] [US3] Implémenter le composant Tooltip dans `frontend/src/components/Map/Tooltip.tsx`
- [X] T034 [US3] Connecter le Tooltip aux événements de survol de Map : référence + dates pour rouge, mention explicite d'absence d'interdiction pour vert, "non couvert" pour gris (FR-005/FR-006) dans `frontend/src/components/Map/Map.tsx` (dépend de T022, T033)
- [X] T035 [P] [US3] Test e2e : survol d'un département rouge, vert et gris, vérification du contenu de l'infobulle dans `frontend/tests/e2e/tooltip.spec.ts`

**Checkpoint**: User Stories 1 à 3 fonctionnelles indépendamment.

---

## Phase 6: User Story 4 - Consommer les données via l'API publique (Priority: P4)

**Goal**: Exposer l'historique par département et tous les événements sur un intervalle, en lecture seule, sans authentification, documenté en OpenAPI.

**Independent Test**: Appeler chaque endpoint avec des paramètres valides et invalides, sans passer par l'interface web, et vérifier la cohérence avec ce qu'affiche la carte.

### Tests for User Story 4

- [X] T036 [P] [US4] Test de contrat pour `GET /api/v1/departements/{code}/evenements` dans `backend/tests/contract/departement-history.test.ts`
- [X] T037 [P] [US4] Test de contrat pour `GET /api/v1/evenements?debut=&fin=` dans `backend/tests/contract/evenements.test.ts`

### Implementation for User Story 4

- [X] T038 [P] [US4] Implémenter la route `GET /api/v1/departements/{code}/evenements` (historique chronologique, 404 si code inconnu, `couvert: false` + liste vide si non couvert) dans `backend/src/api/routes/departements.ts` (dépend de T013, T036)
- [X] T039 [P] [US4] Implémenter la route `GET /api/v1/evenements` (validation `debut`/`fin`, 400 si manquant/mal formé/`fin` < `debut`) dans `backend/src/api/routes/evenements.ts` (dépend de T013, T037)
- [X] T040 [US4] Enregistrer les nouvelles routes dans `backend/src/api/app.ts` (dépend de T038, T039)
- [X] T041 [US4] Vérifier que le schéma exposé par `@fastify/swagger` correspond à `contracts/openapi.yaml` (schémas de route ajustés si nécessaire) dans `backend/src/api/routes/` (dépend de T040)
- [X] T042 [P] [US4] Test de contrat vérifiant que le document OpenAPI servi correspond à `contracts/openapi.yaml` dans `backend/tests/contract/openapi-schema.test.ts` (dépend de T041)

**Checkpoint**: Les 4 user stories sont fonctionnelles indépendamment.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Vérifications transverses (SC-005, absence d'authentification, accessibilité) et validation finale

- [X] T043 [P] Test de contrat vérifiant l'absence d'authentification requise et le CORS ouvert sur tous les endpoints `/api/v1/*` dans `backend/tests/contract/cors-and-auth.test.ts`
- [X] T044 [P] Test d'intégration vérifiant que les réponses API et le rendu de la carte sont strictement identiques pour les mêmes paramètres (SC-005) dans `backend/tests/integration/api-map-consistency.test.ts`
- [X] T045 [P] Rédiger `backend/README.md` et `frontend/README.md` (instructions d'installation/lancement)
- [X] T046 Revue d'accessibilité WCAG 2.1 AA de Map, Legend, Calendar, Slider (navigation clavier + indicateurs non-couleur)
- [X] T047 Exécuter la validation complète de `quickstart.md` (4 scénarios manuels + `test:unit`/`test:contract`/`test:e2e` verts)
  - **Mise à jour (2026-08-11, re-vérifié)** : `npm install` OK. Exécutés et **verts** :
    - Backend : `npm run test:unit` (8/8), `npm run test:contract` (5 fichiers, 22/22),
      `npm run test:integration` (5/5) → **35/35 tests backend passés**.
    - Frontend : `npm run test:unit` (Vitest, 1/1).
    - `tsc -b` (typecheck frontend) et la transformation Vite (1281 modules) passent sans erreur.
  - **Correction de la note précédente** : le blocage supposé du serveur Fastify (« le port n'est
    jamais en écoute ») était un faux négatif — délai de compilation `tsx` à froid (~30s) plus long
    que le délai d'attente utilisé initialement, pas un problème réseau du sandbox. En relançant
    `npm run dev` et en attendant le message `"Server listening at http://0.0.0.0:3000"` avant de
    tester, le **scénario 4 (API publique) a été rejoué et validé avec succès** :
    - `curl /api/v1/departements?date=2026-08-10` → 77 = rouge (interdiction sans `date_fin`),
      13 = vert (levée passée), 2A = gris. Conforme à l'attendu.
    - `curl /api/v1/departements/77/evenements` → historique correct, `date_fin: null`.
    - `curl /api/v1/departements/2A/evenements` → `"couvert": false, "evenements": []`. Conforme.
    - `curl /api/v1/evenements?debut=2026-01-01&fin=2026-12-31` → événements agrégés corrects.
    - Aucun header d'authentification requis (200 sans credentials) ; CORS ouvert vérifié
      (`access-control-allow-origin` reflète l'origine envoyée).
    - `/documentation/json` accessible publiquement ; les chemins exposés
      (`/departements`, `/departements/{code}/evenements`, `/evenements`) correspondent à
      `contracts/openapi.yaml`.
  - **Toujours bloqué dans cet environnement (limitation infra du sandbox Cowork, pas du code)** :
    - `npm run test:e2e` (Playwright) : téléchargement du binaire Chromium (`cdn.playwright.dev`)
      refusé par l'allowlist réseau du sandbox (403 "Connection blocked by network allowlist").
      Aucun navigateur (Playwright ou autre) n'est disponible dans ce sandbox pour piloter le
      frontend réel.
    - Scénarios manuels 1 à 3 de `quickstart.md` (carte à la date du jour, réglette/calendrier,
      infobulle) : nécessitent un rendu visuel dans un navigateur pour vérifier les couleurs,
      l'absence de rechargement de page et le contenu de l'infobulle au survol — non vérifiable par
      `curl`. Le frontend démarre et compile sans erreur (`tsc -b` + build Vite OK), et le test
      unitaire `Legend.test.tsx` couvre les libellés non-couleur, mais le rendu bout-en-bout reste
      non exécuté ici.
    - `npm run build` (frontend) échoue sur une étape annexe : `vite build` ne parvient pas à
      supprimer l'ancien dossier `dist/` (`EPERM: operation not permitted, unlink ...`), un artefact
      de permissions du dossier monté dans ce sandbox (fichiers `dist/` créés lors d'une session
      précédente, non supprimables par la session courante) — sans lien avec le code : la
      transformation des 1281 modules réussit avant cette étape de nettoyage.
  - **À faire en priorité sur une machine standard (hors sandbox Cowork)** : `npx playwright install`
    puis `npm run test:e2e`, et rejouer manuellement les scénarios 1 à 3 de `quickstart.md` dans un
    vrai navigateur (notamment le scénario 2, réglette/calendrier, qui n'a pas d'équivalent
    automatisé backend). Scénario 4 (API) déjà validé, aucune action requise.
  - **Mise à jour (2026-08-11, rejeu manuel dans un vrai navigateur via Claude in Chrome, `npm run
    dev` backend + frontend lancés sur la machine de l'utilisateur)** : les 4 scénarios ont été
    rejoués pour de vrai (plus de blocage sandbox — le navigateur de l'utilisateur atteint son
    propre `localhost`) :
    - Scénario 1 : conforme (77 rouge, 13 vert, 2A/2B gris, icônes non-couleur dans la légende).
    - Scénario 3 : conforme (infobulles 77/13/2B avec les contenus attendus).
    - Scénario 4 : conforme (déjà validé précédemment, re-confirmé).
    - **Scénario 2 : bug trouvé** — la bascule rouge→vert de `13` le 16/05 est correcte, mais une
      date antérieure à toute donnée collectée (`2026-01-01`) affichait `13`/`33`/`77` en **vert**
      au lieu de **gris**, en violation de FR-016 / Acceptance Scenario US2.4. Cause : dans
      `computeDepartementState` (`backend/src/services/computeDepartementState.ts`), le test de
      couverture (`departementsCouverts.has(code)`) ne tenait pas compte de la date : un
      département référencé par un connecteur était "vert par défaut" pour *toute* date sans
      événement actif, y compris avant l'existence de son tout premier événement connu.
    - **Corrigé** : ajout d'une étape (1bis) qui retourne `gris` si la date demandée est antérieure
      au `date_debut` du premier événement connu du département (quand des événements existent).
      Un département couvert sans aucun événement reste `vert` à toute date (dossier "propre",
      cas distinct, toujours couvert par le test `retourne vert pour un département couvert sans
      aucun arrêté`). Test de régression ajouté dans
      `backend/tests/unit/computeDepartementState.test.ts`. Correction revérifiée en direct via
      l'API (`GET /api/v1/departements?date=2026-01-01` → tous les départements gris) sans casser
      le comportement à la date du jour ni la bascule du 16/05.
    - `npm run test:unit` n'a pas pu être rejoué dans le sandbox Cowork (mismatch de binaire natif
      `@rollup/rollup-linux-x64-gnu` : `node_modules` installé sur la machine Windows de
      l'utilisateur, incompatible avec l'environnement Linux du sandbox — sans lien avec le code).
      **À faire sur la machine de l'utilisateur** : `npm run test:unit` dans `backend/` pour
      confirmer que la suite complète (35 tests + le nouveau test de régression) passe.
  - **Mise à jour (2026-08-11, exécution complète réussie dans le sandbox Cowork)** : le mismatch
    natif `@rollup/rollup-linux-x64-gnu` a été contourné en copiant `backend/` et `frontend/` (hors
    `node_modules`) dans un répertoire scratch Linux et en relançant `npm install` localement. Ceci a
    permis d'exécuter réellement la suite complète pour la première fois dans ce sandbox :
    - **Contradiction de tests découverte et corrigée** : le test de régression FR-016/US2.4 ajouté
      précédemment (« affiche gris pour une date antérieure au premier événement connu ») et le test
      de borne pré-existant (« date strictement égale à date_debut : jour inclus en rouge »)
      utilisaient tous les deux un seul événement isolé pour un département sans autre historique —
      donc structurellement impossibles à satisfaire simultanément par une même implémentation.
      Résolu (choix utilisateur) en conservant la règle 1bis (gris avant le premier événement connu)
      et en adaptant le test de borne (département `59`) pour inclure un événement antérieur déjà
      résolu, isolant ainsi le comportement de borne testé de la règle FR-016/US2.4.
    - Backend : `test:unit` 9/9, `test:contract` 22/22, `test:integration` 5/5 → **36/36 tests
      backend verts**.
    - Frontend : `test:unit` (Vitest) 1/1 vert.
    - Scénario 4 (API publique) rejoué via `curl` : 77 rouge, 13 vert, 33 rouge (chevauchement
      prolongation), 2A gris/`couvert:false`, aucune authentification requise, `/documentation/json`
      accessible et conforme à `contracts/openapi.yaml`.
    - `npx playwright install chromium` a cette fois réussi (le blocage réseau précédent ne s'est
      pas reproduit), mais `test:e2e` reste bloqué : le Chromium headless du sandbox nécessite des
      bibliothèques système (`libXdamage.so.1` et probablement d'autres) absentes de l'image, et le
      sandbox ne fournit pas d'accès root pour les installer (`sudo` refusé). Limitation d'
      environnement, sans lien avec le code.
    - Scénarios manuels 1 à 3 : déjà validés dans un vrai navigateur lors de la mise à jour
      précédente (voir ci-dessus) ; non rejoués ici faute de navigateur disponible dans ce sandbox.
  - **Conclusion** : les 4 scénarios de `quickstart.md` sont validés (3 en navigateur réel lors d'une
    session précédente, 1 via `curl` aujourd'hui), et `test:unit`/`test:contract`/`test:integration`
    sont verts (37 tests au total). Seul `test:e2e` (Playwright) n'a jamais pu être exécuté de bout en
    bout dans le sandbox Cowork, pour des raisons d'infrastructure (bibliothèques système manquantes,
    pas d'accès root) et non de code. Recommandation : lancer `npm run test:e2e` une fois sur une
    machine standard pour lever ce dernier doute avant une mise en production.
  - **Mise à jour (2026-08-11, `test:e2e` exécuté sur la machine de l'utilisateur)** : `npm run
    test:e2e` → **3/3 tests Playwright verts** (map-load, tooltip, slider-history). Dernier doute levé.
    **Critère de sortie du quickstart entièrement satisfait** : 4 scénarios manuels conformes,
    `test:unit`/`test:contract`/`test:integration`/`test:e2e` tous verts (40 tests au total).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Aucune dépendance — démarrage immédiat
- **Foundational (Phase 2)**: Dépend de Setup — bloque toutes les user stories
- **User Stories (Phase 3–6)**: Dépendent toutes de Foundational ; peuvent ensuite avancer en parallèle ou par ordre de priorité (P1 → P2 → P3 → P4)
- **Polish (Phase 7)**: Dépend des user stories livrées

### User Story Dependencies

- **US1 (P1)**: Aucune dépendance à une autre story
- **US2 (P2)**: S'intègre à `MapPage` livré par US1 (T024) mais son test indépendant (défilement réglette) reste autonome
- **US3 (P3)**: S'intègre au composant Map livré par US1 (T022) mais son test indépendant (contenu de l'infobulle) reste autonome
- **US4 (P4)**: Indépendante de l'interface web ; réutilise uniquement le socle backend (Phase 2)

### Within Each User Story

- Tests de contrat avant l'implémentation des routes correspondantes
- Modèles/loader (Foundational) avant services, services avant endpoints
- Composants UI avant leur intégration dans `MapPage`
- Story complète avant de passer à la priorité suivante

### Parallel Opportunities

- Toutes les tâches [P] de la Phase 1 en parallèle
- T010, T012, T015, T017, T018 (Phase 2) en parallèle une fois leurs dépendances directes satisfaites
- Une fois Foundational terminé : US1, US3 (frontend) et US4 (backend) peuvent avancer en parallèle par des personnes différentes ; US2 dépend du rendu Map livré par US1 (T024)
- Toutes les tâches de tests marquées [P] au sein d'une story en parallèle

---

## Parallel Example: User Story 1

```bash
# Lancer en parallèle une fois Foundational terminé :
Task: "Contract test for GET /api/v1/departements?date=... in backend/tests/contract/departements.test.ts"
Task: "Implement Map component in frontend/src/components/Map/Map.tsx"
Task: "Implement Legend component in frontend/src/components/Legend/Legend.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Terminer Phase 1 : Setup
2. Terminer Phase 2 : Foundational (bloquant)
3. Terminer Phase 3 : User Story 1
4. **STOP et VALIDER** : tester US1 indépendamment (chargement carte, 3 états, indicateur non-couleur)
5. Déployer/démontrer si prêt

### Incremental Delivery

1. Setup + Foundational → socle prêt
2. US1 → validation indépendante → démo (MVP)
3. US2 → validation indépendante → démo
4. US3 → validation indépendante → démo
5. US4 → validation indépendante → démo
6. Chaque story ajoute de la valeur sans casser les précédentes

### Parallel Team Strategy

1. L'équipe termine Setup + Foundational ensemble
2. Une fois Foundational fait :
   - Développeur A : US1 (frontend Map/Legend + route `/departements`)
   - Développeur B : US4 (routes `/departements/{code}/evenements` et `/evenements`, OpenAPI)
   - Développeur C : US2/US3 (Calendar/Slider/Tooltip), démarre dès que T022/T024 (Map) sont disponibles
3. Intégration finale en Phase 7

---

## Notes

- [P] = fichiers différents, sans dépendance
- [Story] rattache la tâche à sa user story pour la traçabilité
- Les tests de contrat/unitaires doivent échouer avant l'implémentation correspondante
- Committer après chaque tâche ou groupe logique
- S'arrêter à chaque checkpoint pour valider la story indépendamment
- Éviter : tâches vagues, conflits sur un même fichier, dépendances inter-stories qui casseraient l'indépendance
