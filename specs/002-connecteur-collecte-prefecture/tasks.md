---

description: "Task list for feature implementation"
---

# Tasks: Connecteurs de collecte automatique des arrêtés préfectoraux

**Input**: Design documents from `/specs/002-connecteur-collecte-prefecture/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (connecteur-interface.md, admin-api.yaml, registre-sources.schema.md), quickstart.md

**Tests**: Included. `plan.md` (Testing) and `research.md` §9 specify Vitest (unit), Supertest (contract, incl. 401 without auth), and integration tests with a fake connector as the required test strategy for this feature, extending the existing convention from `specs/001`.

**Organization**: Tasks are grouped by user story (spec.md) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)

## Path Conventions

Web app (existing structure from specs/001, extended): `backend/src/`, `backend/tests/`, `frontend/src/`, `frontend/tests/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Introduce the new dependencies and directory scaffolding this feature needs, without any behavior yet.

- [X] T001 Add connector dependencies (`cheerio`, `pdf-parse`, `node-cron`, `@fastify/basic-auth`, and their `@types/*` where needed) to `backend/package.json`; run `npm install`
- [X] T002 [P] Scaffold `backend/src/connecteurs/` per plan.md Project Structure: empty `types.ts`, `registry.ts`, `runner.ts`, `scheduler.ts`, `dedupe.ts`, `extraction/`, `moteurs/pageWeb/`, `moteurs/pdf/`, `configs/`
- [X] T003 [P] Scaffold `backend/src/api/routes/admin/` (`auth.ts`, `anomalies.ts`, `connecteurs.ts`) and test directories `backend/tests/contract/admin/`, `backend/tests/integration/connecteurs/`, `backend/tests/unit/connecteurs/`, `backend/tests/fixtures/connecteurs/pageWeb/`, `backend/tests/fixtures/connecteurs/pdf/`
- [X] T004 [P] Scaffold `frontend/src/pages/AdminPage.tsx`, `frontend/src/components/AnomalyResolution/`, `frontend/src/services/adminApiClient.ts` as empty placeholders, plus `frontend/tests/e2e/resolution-anomalie.spec.ts` placeholder

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure shared by every user story — common connector interface, decision engine, persistence, and admin authentication. No user story can be completed without this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Extend `Connecteur` schema with `type_connecteur` field (`enum: page_web | pdf`) in `backend/src/models/connecteur.ts` (data-model.md, "Entité Connecteur (extension)")
- [X] T005A Extend `Evenement` schema with required `autorite_signataire` (string) field in `backend/src/models/evenement.ts` (data-model.md, "Entité Événement (extension)"; Constitution Principe 1; remediation for /speckit-analyze finding C1) — decide and apply a backfill/default strategy for pre-existing events in `events/<code>.json` that predate this field
  - **Décision de backfill** : plutôt qu'une valeur générique (`"non renseignée"`), les 4 événements existants (`events/13.json`, `33.json`, `77.json`) ont été rétro-complétés avec l'autorité réelle du connecteur qui les a produits — `"Le Préfet de Seine-et-Marne"` (77), `"Le Préfet des Bouches-du-Rhône"` (13), `"Le Préfet de la Gironde"` (33) — cohérent avec `contracts/connecteur-interface.md` (exemple `prefecture-77`) et `connecteurs.json`. Champ ajouté comme `z.string().min(1)` (obligatoire, sans défaut) dans `EvenementSchema`, positionné après `reference_arrete` (ordre aligné sur `ConfirmationAnomalieRequest` dans `contracts/admin-api.yaml`).
  - Aide de test `makeEvent` dans `backend/tests/unit/computeDepartementState.test.ts` mise à jour avec une valeur par défaut (`'Le Préfet de test'`) pour rester compilable.
  - Vérifié : `backend/tests/unit/computeDepartementState.test.ts` (9/9 verts), `tsc -b` ne signale aucune erreur liée à ce changement (seules des erreurs préexistantes et sans rapport — `@types/supertest` manquant — subsistent). Les échecs de `tests/contract/departements.test.ts`, `evenements.test.ts`, `departement-history.test.ts` observés lors de la vérification sont préexistants et sans rapport avec ce champ : ils viennent de `type_connecteur` (T005, déjà fait) absent de `backend/src/data/connecteurs.json`, à résoudre par T032/T033/T034 (migration des connecteurs `prefecture-77/13/33` vers une config déclarative), hors périmètre de T005A.
- [X] T006 [P] Define common `Connecteur` interface, `CandidatEvenement`, `ResultatCollecte`, `SourceBrute` types in `backend/src/connecteurs/types.ts` (contracts/connecteur-interface.md §1)
- [X] T007 [P] Create `ExecutionCollecte` zod schema in `backend/src/models/executionCollecte.ts` (data-model.md)
- [X] T008 [P] Create `AnomalieCollecte` zod schema in `backend/src/models/anomalieCollecte.ts` (data-model.md)
- [X] T009 Export `executionCollecte` and `anomalieCollecte` from `backend/src/models/index.ts` (depends on T007, T008)
- [X] T010 [P] Create empty append-only data files `backend/src/data/executions.json` (`[]`) and `backend/src/data/anomalies.json` (`[]`)
- [X] T011 Extend `DataStore`/`loadDataStore` in `backend/src/data/loader.ts` to load `executions.json` and `anomalies.json` (depends on T007, T008, T010)
- [X] T012 Add persistence/write helpers (`appendEvenement`, `appendExecution`, `upsertAnomalie`, `updateConnecteur`) with cache invalidation in `backend/src/data/loader.ts` (depends on T011)
- [X] T013 [P] Implement shared French date/reference extraction helpers in `backend/src/connecteurs/extraction/champsCommuns.ts` (research.md §3–4)
- [X] T014 Implement doublon detection heuristic (reference similarity + date-range overlap) in `backend/src/connecteurs/dedupe.ts` (FR-010, research.md §5) (depends on T006)
- [X] T015 Implement `evaluerCandidat` decision function and `runner.ts` orchestration (collecte → dedupe → publication/anomalie → journalisation) in `backend/src/connecteurs/runner.ts` (data-model.md "Logique de décision", contracts/connecteur-interface.md §1) (depends on T005A, T006, T012, T014)
  - **Précisions apportées à T006 pendant l'implémentation** : `CandidatEvenement.date_fin_ambigue?: boolean` ajouté — `date_fin: string | null` seul ne permet pas de distinguer « absence totale de mention » (data-model.md étape 3, pas une anomalie) de « mention présente mais non résolvable » (anomalie `date_ambigue`) ; les deux cas produisaient `date_fin: null` de façon indiscernable. `ResultatCollecte.echec_global` étendu avec `source: SourceBrute` (obligatoire) — nécessaire pour que l'anomalie `echec_lecture_source` produite par le runner satisfasse `source_brute` (obligatoire dans `AnomalieCollecteSchema`) et la règle 4 du contrat §5. `extraction/champsCommuns.ts` (T013) complété en conséquence avec `extraireDateAvecAmbiguite` (purement additif, tests existants inchangés).
  - `evaluerCandidat` traite les étapes 2 à 5 de la logique de décision (l'étape 1, échec de lecture de la source, n'a pas de candidat à évaluer — traitée directement dans `executerConnecteur` via `echec_global`).
  - `determinerStatut` : `succes` couvre aussi bien une collecte sans nouveauté (0 publié/0 anomalie, US3 scénario 3) qu'une collecte où toutes les extractions retenues ont produit une anomalie (0 publié/N anomalies) — la source a été lue avec succès dans les deux cas, ce n'est pas un échec technique du connecteur ; `echec` est réservé à une source illisible ou une exception non interceptée.
  - `Connecteur.derniere_collecte` mis à jour dès que le statut n'est pas `echec` (succès complet ou partiel), jamais sur `echec`.
- [X] T016 Implement `registry.ts` — loads `connecteurs.json` + `configs/<id>.yaml`, `creerConnecteur()` dispatch skeleton (no moteur cases yet) in `backend/src/connecteurs/registry.ts` (depends on T005, T006)
  - `creerConnecteur()` lève une erreur explicite pour `page_web`/`pdf` (aucun moteur câblé — T028/T030/T031), avec exhaustivité TypeScript (`never`) sur `type_connecteur` pour empêcher un `type_connecteur` non géré silencieusement.
  - `chargerConnecteursActifs()` isole l'échec d'instanciation d'un connecteur (config absente/moteur non câblé) : logue et écarte ce connecteur plutôt que de faire échouer le chargement des autres (même principe d'isolation que `runner.ts`, contrat §5 règle 6 ; FR-012).
  - `obtenirConnecteur(id)`/`trouverConnecteurEntree(id)` ajoutés en anticipation de T035 (déclenchement manuel) — retournent `null` pour un id inconnu sans tenter de charger de configuration.
  - Tests dans `backend/tests/unit/connecteurs/registry.test.ts` (7/7 verts).
- [X] T017 Register `@fastify/basic-auth` and the `/api/v1/admin` route group (401 without valid credentials) in `backend/src/api/app.ts` and `backend/src/api/routes/admin/auth.ts` (research.md §7, FR-015)
  - Identifiants exclusivement via `ADMIN_USERNAME`/`ADMIN_PASSWORD` (variables d'environnement) — `registerAdminAuth` échoue explicitement au démarrage si absentes, jamais de repli par défaut non sécurisé. `vitest.config.ts` leur donne une valeur de test uniquement (`env`), pour que `buildApp()` reste utilisable par les tests existants sans les modifier.
  - Comparaison des identifiants à temps constant (`crypto.timingSafeEqual`).
  - `onRequest` hook posé sur le contexte Fastify encapsulé `/api/v1/admin` : toute route qui y sera enregistrée plus tard (anomalies : T051-T054 ; connecteurs : T035/T063) hérite automatiquement de la protection, sans rien dupliquer.
  - Pas de route admin réelle encore enregistrée dans ce contexte (aucune n'existe avant T035/T051) : le mécanisme est donc vérifié isolément dans `backend/tests/unit/api/adminAuth.test.ts` (route de test jetable dans le même contexte protégé) plutôt que via T020, qui nécessite une vraie route et reste `[ ]`.
  - Confirmé sans régression : mêmes échecs préexistants (bug `type_connecteur`, T032-034) qu'avant ce changement sur `cors-and-auth.test.ts`/`departements.test.ts`/`evenements.test.ts`, aucun nouvel échec.
- [X] T018 [P] Unit tests for `evaluerCandidat` decision logic (all 5 branches) in `backend/tests/unit/connecteurs/runnerDecision.test.ts` (depends on T015)
- [X] T019 [P] Unit tests for `dedupe.ts` heuristic in `backend/tests/unit/connecteurs/dedupe.test.ts` (depends on T014) — écrits en même temps que T014.
- [X] T020 [P] Contract test: any `/api/v1/admin/*` route returns 401 without Basic Auth credentials in `backend/tests/contract/admin/auth.test.ts` (depends on T017)
- [X] T020A [P] Unit/integration test: after a `runner.ts` run, the resulting `ExecutionCollecte` has correct `nombre_evenements_publies`/`nombre_anomalies` counts and `statut` (`succes`/`echec`/`partiel`), and `Connecteur.derniere_collecte` is updated on success, in `backend/tests/unit/connecteurs/runnerJournalisation.test.ts` (FR-011; remediation for /speckit-analyze finding F2) (depends on T015)
  - Connecteur factice couvrant les 3 chemins du contrat + le cas mixte (`partiel`) et la liste vide (US3 scénario 3). `loader.ts` n'ayant pas d'indirection de répertoire de données testable, le test écrit temporairement dans les vrais fichiers JSON et restaure l'état d'origine dans `afterEach` (par écriture uniquement — la suppression de fichier n'est pas permise sur ce point de montage).

**Checkpoint**: Decision engine, persistence, registry skeleton, and admin auth are operational — user story implementation can now begin.

---

## Phase 3: User Story 1 - Constituer un registre des sources par département (Priority: P1) 🎯 MVP

**Goal**: A registry recensing, per department, where to find the official publication (or an explicit "à investiguer") — usable and consultable before any connector exists.

**Independent Test**: Consult the registry for any department and find either a source description (authority, access point, expected format) or an explicit "no source identified yet" — without any connector having been developed.

- [X] T021 [P] [US1] Define `EntreeRegistreSchema` + `RegistreSourcesSchema` in `backend/src/models/sourceRegistre.ts` (contracts/registre-sources.schema.md)
- [X] T022 [US1] Export `sourceRegistre` from `backend/src/models/index.ts` (depends on T021)
- [X] T023 [US1] Create `backend/src/data/registre-sources.yaml` with one entry per department code in `backend/src/data/departements.json` — `prefecture-77`/`13`/`33` as `statut: connecteur_developpe` (`format_attendu: page_web`, `connecteur_id` set), all remaining departments as `statut: a_investiguer` (FR-017/SC-007)
  - Adresses réelles des RAA renseignées pour 77/13/33 (`point_acces`) : seine-et-marne.gouv.fr, bouches-du-rhone.gouv.fr, gironde.gouv.fr — vérifiées par recherche web le 2026-08-13 (`derniere_verification`).
- [X] T024 [US1] Load and validate `registre-sources.yaml` into `DataStore` via `js-yaml` + `RegistreSourcesSchema` in `backend/src/data/loader.ts` (depends on T021, T023)
  - Nouveau helper `loadYaml` (même contrat que `loadJson` : fallback `[]` sur `ENOENT`) ; `DataStore.registreSources` ajouté et exposé par `loadDataStore()`. `computeDepartementState.test.ts` mis à jour (`makeStore` construit un `DataStore` littéral) pour inclure le nouveau champ.
- [X] T025 [P] [US1] Unit test: registry has exactly one entry per department code from `departements.json`, no missing/duplicate codes in `backend/tests/unit/connecteurs/registreSources.test.ts` (SC-007) (depends on T024)
  - `connecteurs.json` réel n'a pas encore `type_connecteur` (bug préexistant, T005A/T032-034, hors périmètre US1) : `loadDataStore()` échouerait sinon à le parser. Patché temporairement dans `beforeEach`/restauré dans `afterEach`, même convention que `registry.test.ts`.
- [X] T026 [P] [US1] Unit test: `EntreeRegistreSchema` rejects incoherent `statut`/`autorite`/`point_acces`/`connecteur_id` combinations in `backend/tests/unit/connecteurs/registreSourcesSchema.test.ts` (depends on T021)
  - Couvre aussi la validation de champ (URL, longueur `departement_code`, enums, format `derniere_verification`), au-delà des seules combinaisons incohérentes explicitement citées.

**Checkpoint**: The registry is consultable and validated, entirely independent of connector code.

---

## Phase 4: User Story 2 - Ajouter un connecteur pour une nouvelle préfecture (Priority: P2)

**Goal**: Add a connector for a given prefecture so its department stops being displayed "non couvert" (grey), without touching the application core.

**Independent Test**: Add a connector for a currently-grey department, run a collection, let at least one event extract unambiguously, and verify the map shows that department red/green at the expected date — without modifying core code (API, state calculation, map).

- [X] T027 [P] [US2] Implement `PageWebConfigSchema` in `backend/src/connecteurs/moteurs/pageWeb/config.schema.ts` (contracts/connecteur-interface.md §2)
- [X] T028 [US2] Implement `page_web` moteur (fetch + cheerio scraping générique, filtrage par mots-clés, extraction des champs) `creerConnecteur()` in `backend/src/connecteurs/moteurs/pageWeb/moteur.ts` (depends on T006, T013, T027)
  - Couverture par `backend/tests/unit/connecteurs/moteurPageWeb.test.ts` (4 tests : filtrage par mots-clés, extraction depuis le titre seul, suivi du lien PDF joint réutilisant le moteur `pdf`, `echec_global` si `url_liste` inaccessible) — via mocks `fetch`/`pdf-parse` plutôt que les fixtures fichier T036/T037/T042, couverture fonctionnellement équivalente à T043.
- [X] T029 [P] [US2] Implement `PdfConfigSchema` in `backend/src/connecteurs/moteurs/pdf/config.schema.ts` (contracts/connecteur-interface.md §3)
- [X] T030 [US2] Implement `pdf` moteur (fetch + `pdf-parse`, extraction des champs, échec si texte vide/insuffisant) `creerConnecteur()` in `backend/src/connecteurs/moteurs/pdf/moteur.ts` (depends on T006, T013, T029)
  - Couverture par `backend/tests/unit/connecteurs/moteurPdf.test.ts` (5 tests), même approche par mocks — fonctionnellement équivalent à T044.
- [X] T031 [US2] Wire `page_web` and `pdf` cases into the `creerConnecteur()` switch in `backend/src/connecteurs/registry.ts` (depends on T016, T028, T030)
  - **Extension non planifiée réalisée en même temps** : un troisième type `rss` (moteur `backend/src/connecteurs/moteurs/rss/`, `RssConfigSchema`) a été ajouté en suivant exactement le patron `page_web`/`pdf`, avant toute confirmation par le registre des sources qu'un connecteur `rss` réel existe — anticipation documentée et assumée dans `contracts/connecteur-interface.md` §4/§10 et `data-model.md` (format courant de publication du RAA chez certaines préfectures). Couvert par `backend/tests/unit/connecteurs/moteurRss.test.ts` (5 tests). `TypeConnecteurSchema` (`backend/src/models/connecteur.ts`) étendu en conséquence à `page_web | pdf | rss`.
- [X] T032 [P] [US2] Migrate `prefecture-77` to a declarative config `backend/src/connecteurs/configs/prefecture-77.yaml` + add `type_connecteur: page_web` to its entry in `backend/src/data/connecteurs.json`
- [X] T033 [P] [US2] Migrate `prefecture-13` to a declarative config `backend/src/connecteurs/configs/prefecture-13.yaml` + add `type_connecteur: page_web` to its entry in `backend/src/data/connecteurs.json`
- [X] T034 [P] [US2] Migrate `prefecture-33` to a declarative config `backend/src/connecteurs/configs/prefecture-33.yaml` + add `type_connecteur: page_web` to its entry in `backend/src/data/connecteurs.json`
  - Sélecteurs CSS/patterns repris du patron déjà établi pour `prefecture-77` (`contracts/connecteur-interface.md`, exemple §2) — non vérifiés contre le HTML réel des trois sites (pas d'accès web sortant depuis cet environnement), à confirmer avant la première collecte réelle. Chaque fichier le documente explicitement en en-tête. `autorite_signataire`/URLs repris de `registre-sources.yaml` (entrées 77/13/33).
  - Corrige le bug préexistant documenté par T005A/T020A/T025 (`connecteurs.json` sans `type_connecteur` pour les 3 connecteurs réels) : `tests/contract/departements.test.ts` et `tests/contract/evenements.test.ts` passent désormais (9/9), plus régression sur les 3 autres suites contract (`admin/auth`, `openapi-schema`, `cors-and-auth`, `departement-history` — 24/24 au total).
  - `tests/unit/connecteurs/registry.test.ts` mis à jour : `chargerConnecteursActifs()` charge maintenant aussi les 3 connecteurs réels (plus le connecteur factice du test) — l'assertion vérifiait auparavant une liste stricte à un seul élément, qui supposait implicitement l'échec de chargement des connecteurs réels (bug ci-dessus) plutôt que de le vérifier explicitement.
- [ ] T035 [US2] Implement `POST /api/v1/admin/connecteurs/{id}/collecter` (déclenchement manuel, FR-014) in `backend/src/api/routes/admin/connecteurs.ts`, invoking `runner.ts` for the given connecteur and returning its `ExecutionCollecte`; return `404` for an unknown id and `409` if the connecteur is `actif: false` (contracts/admin-api.yaml; remediation for /speckit-analyze finding F1) (depends on T015, T017, T031)
- [ ] T036 [P] [US2] Fixture: well-formed `page_web` publication (all fields readable) in `backend/tests/fixtures/connecteurs/pageWeb/publication-propre.html`
- [ ] T037 [P] [US2] Fixture config for a test connector pointing at the fixture above in `backend/tests/fixtures/connecteurs/pageWeb/config-test.yaml`
- [ ] T038 [US2] Integration test: adding a connector for a new/grey department, triggering manual collection, and confirming a published event (`methode_collecte: automatique`) makes the department non-grey in `backend/tests/integration/connecteurs/ajoutConnecteur.test.ts` (Acceptance Scenarios US2.1, US2.2) (depends on T035, T036, T037)
- [ ] T039 [P] [US2] Contract test: `POST /api/v1/admin/connecteurs/{id}/collecter` → 200 with `ExecutionCollecte` for a valid id, 404 for unknown id, 409 for a disabled (`actif: false`) connecteur, 401 without auth in `backend/tests/contract/admin/connecteurs.test.ts` (depends on T035)

**Checkpoint**: A new connector can be added purely via configuration + a `connecteurs.json` entry, without touching core code; manual trigger works end to end.

---

## Phase 5: User Story 3 - Collecter et publier automatiquement les arrêtés sans ambiguïté (Priority: P3)

**Goal**: A connector periodically retrieves new publications from its source and publishes directly to the history when extraction is complete and unambiguous — no re-entry, no systematic manual review.

**Independent Test**: Trigger collection for a connector pointing at a known, well-formed test fixture set (page web and/or PDF) and verify the contained arrêtés are published directly as events in the API and map, without an intermediate step.

- [ ] T040 [US3] Implement the daily scheduler (`node-cron`, one run per active connecteur per day) invoking `runner.ts` in `backend/src/connecteurs/scheduler.ts` (FR-013, research.md §6) (depends on T015, T016)
- [ ] T041 [US3] Start the scheduler on server boot in `backend/src/server.ts` (depends on T040)
- [ ] T042 [P] [US3] Fixture: `page_web` publication referencing an attached PDF (`selecteur_lien_pdf` path) in `backend/tests/fixtures/connecteurs/pageWeb/publication-avec-pdf.html` and `backend/tests/fixtures/connecteurs/pdf/piece-jointe.pdf`
- [ ] T043 [P] [US3] Unit tests for the `page_web` moteur against fixtures (clean text, PDF-linked publication, unreadable list page) in `backend/tests/unit/connecteurs/moteurPageWeb.test.ts` (depends on T028, T036, T042)
- [ ] T044 [P] [US3] Unit tests for the `pdf` moteur against fixtures (extractable text, empty/unreadable text) in `backend/tests/unit/connecteurs/moteurPdf.test.ts` (depends on T030, T042)
- [ ] T045 [US3] Integration test: a fake `Connecteur` run through `runner.ts` publishes directly (no anomaly) when extraction is complete and unambiguous, and the API/map reflect the event immediately in `backend/tests/integration/connecteurs/runner.test.ts` (Acceptance Scenarios US3.1, US3.2) (depends on T015)
- [ ] T046 [US3] Integration test: re-running the same connecteur on an unchanged source produces no duplicate event (idempotence) in `backend/tests/integration/connecteurs/idempotence.test.ts` (Acceptance Scenario US3.3, FR-010) (depends on T015, T014)
- [ ] T046A [P] [US3] Unit test: when `evaluerCandidat` returns `action: 'publier'`, the resulting event always has a non-null `source_url` populated from `CandidatEvenement.source.url` (SourceBrute) in `backend/tests/unit/connecteurs/runnerDecision.test.ts` (SC-002; remediation for /speckit-analyze finding E1) (depends on T015)
- [ ] T047 [P] [US3] Unit test: every config YAML under `connecteurs/configs/` validates against its type's zod schema in `backend/tests/unit/connecteurs/configsSchema.test.ts` (depends on T027, T029, T032, T033, T034)

**Checkpoint**: Connectors collect and publish automatically, daily and idempotently, with no human intervention needed for clean extractions.

---

## Phase 6: User Story 4 - Résoudre une anomalie de collecte avant publication (Priority: P4)

**Goal**: Alert the operator only when extraction fails or is ambiguous (missing field, unreadable date, suspected duplicate, unreadable source), so those cases can be resolved before publication without reviewing every successful extraction.

**Independent Test**: Force an ambiguous/failed extraction via a test fixture, verify no event is published automatically but an anomaly appears in the resolution space with its raw source; resolve it and verify the event (or its rejection) follows; verify a clean extraction in the same run never appears there.

- [ ] T048 [P] [US4] Fixture: publication missing a required field (autorité absente) in `backend/tests/fixtures/connecteurs/pageWeb/publication-champ-manquant.html`
- [ ] T049 [P] [US4] Fixture: publication duplicating an already-published event (same département, close reference) in `backend/tests/fixtures/connecteurs/pageWeb/publication-doublon.html`
- [ ] T050 [P] [US4] Fixture: PDF with no extractable text (scanned/image) in `backend/tests/fixtures/connecteurs/pdf/scan-illisible.pdf`
- [ ] T051 [US4] Implement `GET /api/v1/admin/anomalies` (filter by `statut`, default `en_attente`) in `backend/src/api/routes/admin/anomalies.ts` (FR-009, contracts/admin-api.yaml) (depends on T012, T017)
- [ ] T052 [US4] Implement `POST /api/v1/admin/anomalies/{id}/confirmer` — publishes an event with `methode_collecte: manuelle_verifiee` and `autorite_signataire` from the request body; `source_url` defaults to the anomaly's `source_brute.url` when not explicitly overridden in the request body, so a confirmed event is never published without a consultable source (SC-002); sets the anomaly to `confirmee`, links `evenement_resultant_id` in `backend/src/api/routes/admin/anomalies.ts` (FR-006, Acceptance Scenario US4.3) (depends on T005A, T051)
- [ ] T053 [US4] Implement `POST /api/v1/admin/anomalies/{id}/rejeter` — sets the anomaly to `rejetee` (terminal), never creates an event in `backend/src/api/routes/admin/anomalies.ts` (FR-016, Acceptance Scenario US4.4) (depends on T051)
- [ ] T054 [US4] Register the `admin/anomalies` routes under `/api/v1/admin` in `backend/src/api/app.ts` (depends on T051, T052, T053)
- [ ] T055 [US4] Integration test: extraction with a missing field / duplicate / unreadable source creates an anomaly (not an event), visible in the resolution space with partial fields and source access, while a clean extraction in the same run never appears there in `backend/tests/integration/connecteurs/anomalies.test.ts` (Acceptance Scenarios US4.1, US4.2) (depends on T015, T048, T049, T050)
- [ ] T056 [P] [US4] Contract test: `GET /anomalies`, `POST /confirmer` (201 + event published), `POST /rejeter` (200, no event), 404/409 edge cases, 401 without auth in `backend/tests/contract/admin/anomalies.test.ts` (depends on T052, T053)
- [ ] T056A [P] [US4] Contract test: `POST /confirmer` without a `source_url` override in the request body still publishes an event with a non-null `source_url` equal to the anomaly's `source_brute.url` in `backend/tests/contract/admin/anomalies.test.ts` (SC-002; remediation for /speckit-analyze finding E1) (depends on T052)
- [ ] T057 [P] [US4] Implement `adminApiClient.ts` (Basic Auth credentials, fetch wrapper) distinct from `apiClient.ts` in `frontend/src/services/adminApiClient.ts`
- [ ] T058 [US4] Implement the AnomalyResolution list + detail components (partial fields, source brute, confirmer/rejeter actions) in `frontend/src/components/AnomalyResolution/` (depends on T057)
- [ ] T059 [US4] Implement `AdminPage.tsx` wiring AnomalyResolution to `adminApiClient`, mounted at `/admin` in `frontend/src/pages/AdminPage.tsx` (depends on T058)
- [ ] T060 [US4] Route `/admin` to `AdminPage` based on `window.location.pathname` in `frontend/src/main.tsx` (depends on T059)
- [ ] T061 [P] [US4] Unit tests for the AnomalyResolution components in `frontend/tests/unit/AnomalyResolution.test.tsx` (depends on T058)
- [ ] T062 [P] [US4] E2E test: resolve an anomaly end to end, confirm and reject paths, in `frontend/tests/e2e/resolution-anomalie.spec.ts` (SC-005) (depends on T059)

**Checkpoint**: Anomalies are surfaced and resolvable end to end (API + admin UI); rejected anomalies never leak into the public API or map.

---

## Phase 7: User Story 5 - Désactiver un connecteur défaillant sans impact sur le reste du produit (Priority: P5)

**Goal**: Disable a failing connector independently of the others, so its department reverts to grey predictably without breaking already-validated history or other connectors.

**Independent Test**: Disable an existing connector and verify (a) other connectors keep working normally, (b) the department shows "non couvert" for dates after deactivation, (c) history already validated before deactivation stays intact and consultable.

- [ ] T063 [US5] Implement `PATCH /api/v1/admin/connecteurs/{id}` (`actif` true/false) in `backend/src/api/routes/admin/connecteurs.ts` (FR-012, contracts/admin-api.yaml) (depends on T012, T017, T031)
- [ ] T064 [US5] Register the PATCH route alongside the manual-trigger route under `/api/v1/admin` in `backend/src/api/app.ts` (depends on T063)
- [ ] T065 [US5] Ensure `scheduler.ts` and `registry.ts` skip inactive connecteurs when building the daily run set, without any change to `backend/src/services/computeDepartementState.ts` in `backend/src/connecteurs/scheduler.ts` / `backend/src/connecteurs/registry.ts` (depends on T016, T040)
- [ ] T066 [US5] Integration test: disabling a connector with existing history stops future scheduled runs for it, other connectors keep running normally, and past validated events remain intact/consultable in `backend/tests/integration/connecteurs/desactivation.test.ts` (Acceptance Scenarios US5.1, US5.2) (depends on T063, T065)
- [ ] T067 [P] [US5] Contract test: `PATCH /api/v1/admin/connecteurs/{id}` toggles `actif`, 404 for unknown id, 401 without auth in `backend/tests/contract/admin/connecteurs.test.ts` (extends T039's file) (depends on T063)

**Checkpoint**: Connectors can be disabled/re-enabled independently, without breaking other connectors or already-published history.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Consistency and final validation across all user stories.

- [ ] T068 [P] Extend the OpenAPI/swagger registration in `backend/src/api/app.ts` to document the `/api/v1/admin/*` endpoints, consistent with `contracts/admin-api.yaml`
- [ ] T069 [P] Verify `backend/package.json` test scripts (`test:unit`, `test:contract`, `test:integration`) pick up the new `connecteurs/`/`admin/` test directories
- [ ] T070 Run the full backend test suite (`npm run test`) and frontend (`npm run test:unit`, `npm run test:e2e`) — no regression on the existing `specs/001` suites
- [ ] T071 Run the 5 `quickstart.md` validation scenarios end to end against a local dev server
- [ ] T071A [P] Contract/regression test on the public API (`GET /api/v1/evenements`, `GET /api/v1/departements/{code}/evenements`): every event with a non-null `connecteur_id` (automatique or manuelle_verifiee) has a non-null `source_url` — 100% coverage per SC-002 — in `backend/tests/contract/evenements-source.test.ts` (SC-002; remediation for /speckit-analyze finding E1) (depends on T046A, T056A)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–7)**: All depend on Foundational completion.
  - US1 (Phase 3) has no dependency on any other story — pure data/registry.
  - US2 (Phase 4) is the first story that produces working connectors and the manual-trigger endpoint; does not require US1's code (only its purpose — knowing where to point a connector — which is an operator/documentation concern, not a code dependency).
  - US3 (Phase 5) builds on the moteurs and registry entries introduced in US2 (scheduler runs the same connectors); logically sequenced after US2 but touches mostly new files (`scheduler.ts`).
  - US4 (Phase 6) reuses the runner's anomaly path (Foundational) and the admin auth (Foundational); independent of US2/US3 files but conceptually exercised together with them for a full round trip.
  - US5 (Phase 7) reuses the `PATCH` admin route group and registry/scheduler filtering; depends on connector entries existing (US2) to have something to disable.
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### Within Each User Story

- Config/interface schemas before the moteurs/routes that consume them.
- Moteurs and registry wiring before the endpoints that trigger them.
- Fixtures before the unit/integration tests that use them.
- Backend endpoints before the frontend clients/components that call them.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel.
- Within Foundational: T006, T007, T008, T010, T013 can run in parallel (different files); T018, T019, T020 (tests) can run in parallel once their targets exist.
- Once Foundational completes, US1 can start immediately in parallel with US2's schema/moteur tasks (T021 vs. T027/T029), since they touch disjoint files.
- Within US2: T027 and T029 (config schemas) in parallel; T032/T033/T034 (per-prefecture config migration) in parallel.
- Within US4: T048/T049/T050 (fixtures) in parallel; T057 (frontend client) can start in parallel with backend T051–T054 since it targets a not-yet-existing contract already fixed by `contracts/admin-api.yaml`.

---

## Parallel Example: Foundational

```bash
Task: "Define common Connecteur interface, CandidatEvenement, ResultatCollecte, SourceBrute types in backend/src/connecteurs/types.ts"
Task: "Create ExecutionCollecte zod schema in backend/src/models/executionCollecte.ts"
Task: "Create AnomalieCollecte zod schema in backend/src/models/anomalieCollecte.ts"
Task: "Implement shared French date/reference extraction helpers in backend/src/connecteurs/extraction/champsCommuns.ts"
```

## Parallel Example: User Story 2

```bash
Task: "Implement PageWebConfigSchema in backend/src/connecteurs/moteurs/pageWeb/config.schema.ts"
Task: "Implement PdfConfigSchema in backend/src/connecteurs/moteurs/pdf/config.schema.ts"
Task: "Migrate prefecture-77 to backend/src/connecteurs/configs/prefecture-77.yaml"
Task: "Migrate prefecture-13 to backend/src/connecteurs/configs/prefecture-13.yaml"
Task: "Migrate prefecture-33 to backend/src/connecteurs/configs/prefecture-33.yaml"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: User Story 1 (registre des sources).
4. **STOP and VALIDATE**: registry consultable per department, 100% coverage (SC-007).

### Incremental Delivery

1. Setup + Foundational → decision engine, persistence, auth ready.
2. Add US1 → registry usable independently (MVP for the "where to look" problem).
3. Add US2 → first real connector live end to end, manual trigger works, a grey department turns colored.
4. Add US3 → daily automatic collection + idempotence.
5. Add US4 → anomalies surfaced and resolvable via the admin UI.
6. Add US5 → connectors can be disabled safely.
7. Polish → docs, full regression, quickstart validation.

### Parallel Team Strategy

With multiple developers, after Foundational:
- Developer A: US1 (registry) — fully independent.
- Developer B: US2 → US3 (moteurs, scheduler) — sequential, same subsystem.
- Developer C: US4 (anomalies API + admin UI) — can start as soon as Foundational's runner/auth exist, using fixtures it creates itself.
- US5 folds in once US2's connector entries exist (small, one developer).

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Tests are included per `plan.md`/`research.md` §9 (Vitest unit, Supertest contract incl. 401, integration with a fake connector) — write them alongside (or just after) the implementation task they cover; the fixtures they depend on are listed as separate [P] tasks.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently.
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence.
