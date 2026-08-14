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
- [X] T035 [US2] Implement `POST /api/v1/admin/connecteurs/{id}/collecter` (déclenchement manuel, FR-014) in `backend/src/api/routes/admin/connecteurs.ts`, invoking `runner.ts` for the given connecteur and returning its `ExecutionCollecte`; return `404` for an unknown id and `409` if the connecteur is `actif: false` (contracts/admin-api.yaml; remediation for /speckit-analyze finding F1) (depends on T015, T017, T031)
  - `trouverConnecteurEntree(id)` (déjà posé en anticipation en T016) vérifie existence + `actif` avant toute instanciation du connecteur runtime — un connecteur désactivé n'est jamais exécuté, même manuellement. Route enregistrée dans le même contexte Fastify protégé que `registerAdminAuth` (`app.ts`), sans rien dupliquer.
- [X] T036 [P] [US2] Fixture: well-formed `page_web` publication (all fields readable) in `backend/tests/fixtures/connecteurs/pageWeb/publication-propre.html`
  - Déjà créée pendant T028 (réutilisée par `moteurPageWeb.test.ts`) ; vérifiée conforme au besoin de T036/T038 (3 publications : une complète, une non pertinente à filtrer, une avec pièce jointe PDF).
- [X] T037 [P] [US2] Fixture config for a test connector pointing at the fixture above in `backend/tests/fixtures/connecteurs/pageWeb/config-test.yaml`
  - Config `page_web` alignée sur les sélecteurs/patterns de `publication-propre.html` ; `url_liste` factice (`https://exemple-test.gouv.fr/...`), résolue par un stub `fetch` dans les tests qui la consomment (T038/T039) — aucun accès réseau réel.
- [X] T038 [US2] Integration test: adding a connector for a new/grey department, triggering manual collection, and confirming a published event (`methode_collecte: automatique`) makes the department non-grey in `backend/tests/integration/connecteurs/ajoutConnecteur.test.ts` (Acceptance Scenarios US2.1, US2.2) (depends on T035, T036, T037)
  - Département de test `2B` (Haute-Corse), non couvert par aucun connecteur réel ni par les autres suites. Vérifie successivement : (1) `2B` gris avant tout ajout de connecteur (non couvert) ; (2) `obtenirConnecteur` + `executerConnecteur('manuel')` publient directement l'événement `2026-77-0512` (`methode_collecte: automatique`, `source_url` renseignée) ; (3) l'état calculé passe à `rouge` (non gris) à une date couverte. Écriture temporaire dans les vrais fichiers de données (même convention que T020A/T031), restaurée en `afterEach`. 3/3 tests verts.
  - **Correctif (constaté après coup, en marge de T042-047)** : `anomalies.json`/`executions.json` n'étaient ni sauvegardés ni restaurés par ce test, contrairement à `runnerJournalisation.test.ts`/T020A et `scheduler.test.ts`/T040 — oubli, pas une question de parallélisme entre suites. Or la 3ᵉ publication de `publication-propre.html` ('2026-77-0520', sans PDF suivi dans `config-test.yaml`) produit systématiquement une anomalie `champ_manquant`, qui restait donc dans les vrais fichiers après chaque exécution de la suite complète. Ajouté à `beforeEach`/`afterEach`, même patron que les fichiers qui le faisaient déjà correctement. Revérifié : 3/3 tests toujours verts, `anomalies.json`/`executions.json` redeviennent `[]` après coup.
- [X] T039 [P] [US2] Contract test: `POST /api/v1/admin/connecteurs/{id}/collecter` → 200 with `ExecutionCollecte` for a valid id, 404 for unknown id, 409 for a disabled (`actif: false`) connecteur, 401 without auth in `backend/tests/contract/admin/connecteurs.test.ts` (depends on T035)
  - Départements de test `04`/`05` (distincts de `2A`/`2B`/`33`/`77` déjà utilisés ailleurs, pour limiter les collisions entre suites de tests écrivant dans les mêmes fichiers réels). 4/4 tests verts via `buildApp()` + supertest, incluant 401 sans authentification (revérifie T020 sur cette route réelle).
  - Suite complète vérifiée sans régression : `tests/unit` (12 fichiers, 90 tests), `tests/contract` (7 fichiers, 30 tests), `tests/integration` (2 fichiers, 8 tests) — tous verts. Erreurs `tsc -b` préexistantes et sans rapport (`@types/supertest` manquant, documenté depuis T005A) inchangées.
  - **Correctif (T042-047)** : même oubli et même correctif que ci-dessus (T038) — `anomalies.json`/`executions.json` non sauvegardés/restaurés, corrigé à l'identique. 4/4 tests toujours verts.

**Checkpoint**: A new connector can be added purely via configuration + a `connecteurs.json` entry, without touching core code; manual trigger works end to end.

---

## Phase 5: User Story 3 - Collecter et publier automatiquement les arrêtés sans ambiguïté (Priority: P3)

**Goal**: A connector periodically retrieves new publications from its source and publishes directly to the history when extraction is complete and unambiguous — no re-entry, no systematic manual review.

**Independent Test**: Trigger collection for a connector pointing at a known, well-formed test fixture set (page web and/or PDF) and verify the contained arrêtés are published directly as events in the API and map, without an intermediate step.

- [X] T040 [US3] Implement the daily scheduler (`node-cron`, one run per active connecteur per day) invoking `runner.ts` in `backend/src/connecteurs/scheduler.ts` (FR-013, research.md §6) (depends on T015, T016)
  - Tâche cron unique (05:00 Europe/Paris par défaut, `noOverlap: true`) qui délègue à `executerCycleQuotidien()` → `chargerConnecteursActifs()` (registry.ts) puis `executerConnecteursPlanifies()`, laquelle exécute chaque connecteur **séquentiellement** (jamais en parallèle, pour éviter des écritures concurrentes dans les fichiers JSON de `data/loader.ts`) via `executerConnecteur(connecteur, 'planifie')` — même chemin d'exécution que le déclenchement manuel (T035), seul `declenchement` diffère.
  - Isolation (FR-012, Principe 10) : une exception non interceptée par `executerConnecteur` pour un connecteur (cas théorique — ex. connecteur enregistré dans `connecteurs.json` mais dont l'entrée disparaît entre temps) est journalisée (`console.error`) et n'interrompt pas le cycle des connecteurs suivants, même principe que `registry.chargerConnecteursActifs`.
  - `demarrerScheduler()`/`arreterScheduler()` exposés pour le démarrage au boot (T041, hors périmètre ici) et pour un arrêt propre en test ; idempotent (un second `demarrerScheduler()` sans arrêt préalable renvoie la tâche déjà en cours plutôt que d'en cumuler une seconde).
  - `executerConnecteursPlanifies()` est exportée séparément de `executerCycleQuotidien()` pour rester testable avec des connecteurs factices, sans dépendre du registre ni de fichiers de configuration réels — tests dans `backend/tests/unit/connecteurs/scheduler.test.ts` (7/7 verts : exécution séquentielle + journalisation par connecteur, isolation d'un échec inattendu sans interrompre les suivants, liste vide, démarrage/arrêt/idempotence de la tâche cron, expression/fuseau personnalisés). Suite complète revérifiée sans régression (97 unit / 30 contract / 8 integration, 135/135).
- [X] T041 [US3] Start the scheduler on server boot in `backend/src/server.ts` (depends on T040)
  - `demarrerScheduler()` appelé une fois `app.listen()` résolu (serveur prêt à répondre), pas avant — le déclenchement manuel (FR-014, T035) reste disponible dès le boot indépendamment de ce cycle planifié. Pas de handler `SIGTERM`/`SIGINT` ajouté : aucun mécanisme d'arrêt propre du process n'existait déjà dans `server.ts` avant ce changement (Principe 5 — pas de complexité nouvelle sans besoin concret exprimé par ce ticket).
- [X] T042 [P] [US3] Fixture: `page_web` publication referencing an attached PDF (`selecteur_lien_pdf` path) in `backend/tests/fixtures/connecteurs/pageWeb/publication-avec-pdf.html` and `backend/tests/fixtures/connecteurs/pdf/piece-jointe.pdf`
  - `piece-jointe.pdf` généré avec `reportlab` (Python), pas à la main : un PDF handcraft minimal (xref/trailer manuels) déclenche la même erreur que le bug ci-dessous, indépendamment de sa validité — écarté pour ne pas mélanger deux problèmes. Une seconde fixture non prévue par ce ticket, `backend/tests/fixtures/connecteurs/pdf/page-sans-texte.pdf` (page blanche valide, aucun texte), a été créée à cette occasion pour le cas "texte insuffisant" de T044 (dépend seulement de T042 dans ce fichier, sans fixture dédiée pour ce cas).
  - **Bug découvert et corrigé en écrivant ces fixtures** : passer un `Buffer` Node directement à `pdf-parse` (`pdf.js` v1.10.100 embarqué) lève `bad XRef entry` sur *tout* PDF, y compris parfaitement valide (constaté avec 3 PDF de provenances différentes : handcraft, exemple canonique "Hello World", et fichier `reportlab` re-vérifié avec `pikepdf` — la même erreur apparaît quel que soit le contenu, seulement selon le type concret de l'objet passé). Un `Uint8Array` brut (même octets, copié depuis le `Buffer`) contourne le problème sans changer le texte extrait. `backend/src/connecteurs/moteurs/pdf/moteur.ts` (`telechargerEtExtraireTextePdf`) corrigé en conséquence — bug latent qui aurait fait échouer `echec_global` sur toute collecte PDF réelle en production, jamais détecté jusqu'ici car T028/T030 mockaient entièrement `pdf-parse`.
- [X] T043 [P] [US3] Unit tests for the `page_web` moteur against fixtures (clean text, PDF-linked publication, unreadable list page) in `backend/tests/unit/connecteurs/moteurPageWeb.test.ts` (depends on T028, T036, T042)
  - Réécrit pour ne plus mocker `pdf-parse` du tout (possible grâce au correctif ci-dessus) : le cas "publication avec PDF joint" exerce désormais le vrai `pdf-parse` sur les octets réels de `piece-jointe.pdf`, une vérification plus fidèle que le mock de texte utilisé jusqu'ici. 4/4 tests verts.
- [X] T044 [P] [US3] Unit tests for the `pdf` moteur against fixtures (extractable text, empty/unreadable text) in `backend/tests/unit/connecteurs/moteurPdf.test.ts` (depends on T030, T042)
  - Même principe : `pdf-parse` non mocké, `piece-jointe.pdf` pour le texte extractible, `page-sans-texte.pdf` pour le texte insuffisant (< `LONGUEUR_TEXTE_MINIMALE`). `résoudreUrlPdf` inchangé. 5/5 tests verts.
- [X] T045 [US3] Integration test: a fake `Connecteur` run through `runner.ts` publishes directly (no anomaly) when extraction is complete and unambiguous, and the API/map reflect the event immediately in `backend/tests/integration/connecteurs/runner.test.ts` (Acceptance Scenarios US3.1, US3.2) (depends on T015)
  - Connecteur factice (même patron que T020A), département de test `15` (Cantal, inutilisé ailleurs). Contrairement à `runnerJournalisation.test.ts` (T020A) et `ajoutConnecteur.test.ts` (T038), ce test exerce aussi la vraie route HTTP publique (`buildApp()` + `supertest`) — `GET /api/v1/departements?date=...` (carte) et `GET /api/v1/departements/{code}/evenements` (historique) — immédiatement après `executerConnecteur`, sans étape intermédiaire. Département `15` déjà couvert (entrée `connecteurs.json` ajoutée pour permettre `updateConnecteur`) : "avant collecte" est donc `vert` (couvert, sans événement actif), pas `gris` — l'ajout d'un connecteur sur un département gris est le sujet de T038/US2, pas de ce test. 4/4 tests verts.
- [X] T046 [US3] Integration test: re-running the same connecteur on an unchanged source produces no duplicate event (idempotence) in `backend/tests/integration/connecteurs/idempotence.test.ts` (Acceptance Scenario US3.3, FR-010) (depends on T015, T014)
  - Utilise le vrai moteur `page_web` (pas un connecteur factice) sur la fixture `publication-propre.html` (T036), servie identiquement à deux (puis trois) appels de `collecter()` successifs — c'est le connecteur réel qui est réexécuté, pas seulement `evaluerCandidat`/`detecterDoublon` isolément. Département de test `19` (Corrèze). Le 1er run publie 1 événement + 1 anomalie `champ_manquant` (une 3ᵉ publication de la fixture, sans PDF joint dans cette config, manque sa `date_debut` — hors sujet ici) ; le 2ᵉ run republie 0 événement et détecte le doublon (`doublon_potentiel`) ; un 3ᵉ run confirme l'absence de dérive. 2/2 tests verts.
- [X] T046A [P] [US3] Unit test: when `evaluerCandidat` returns `action: 'publier'`, the resulting event always has a non-null `source_url` populated from `CandidatEvenement.source.url` (SourceBrute) in `backend/tests/unit/connecteurs/runnerDecision.test.ts` (SC-002; remediation for /speckit-analyze finding E1) (depends on T015)
  - `evaluerCandidat` étant pur et retournant le candidat inchangé sur la branche `publier`, le test vérifie directement `resultat.candidat.source.url` (c'est exactement ce que `construireEvenement`, non exporté, affecte à `Evenement.source_url`) — non-null pour les 3 types de source (`page_web`/`pdf`/`rss`). 2 tests ajoutés, 11/11 verts au total dans ce fichier.
- [X] T047 [P] [US3] Unit test: every config YAML under `connecteurs/configs/` validates against its type's zod schema in `backend/tests/unit/connecteurs/configsSchema.test.ts` (depends on T027, T029, T032, T033, T034)
  - Chaque config réelle (`type_connecteur` présent) validée contre le schéma zod correspondant (`Page`/`Pdf`/`RssConfigSchema`, mapping explicite et exhaustif). Les 4 fixtures de test "au repos" (`test-ajout-connecteur-2b.yaml` et similaires — simples commentaires, réécrites seulement pendant l'exécution de leurs suites respectives) sont explicitement identifiées et ignorées, pas traitées comme des configs invalides. 4/4 tests verts.

**Checkpoint**: Connectors collect and publish automatically, daily and idempotently, with no human intervention needed for clean extractions.

---

## Phase 5bis: Validation réelle des 3 connecteurs déployés (Priority: P2.5 — **reprioritized ahead of US4/US5**, 2026-08-13)

**Reprioritization rationale**: `backend/src/data/executions.json` is empty — no connecteur has ever run against its real source. The 3 real configs (`prefecture-13.yaml`, `prefecture-33.yaml`, `prefecture-77.yaml`) carry an explicit disclaimer that their CSS selectors were never checked against real HTML (no outbound web access at the time they were written) and are literally identical placeholders (`.raa-liste .raa-item` etc.) across all 3 départements. A live check today confirms this is not a formality: `gironde.gouv.fr` and `bouches-du-rhone.gouv.fr` both run the government DSFR template with a **year-indexed RAA archive** (`Recueil des Actes Administratifs de l'année 2026` → sub-page → direct PDF links under "A lire dans cette rubrique" / "Publications légales"), not a flat list of `.raa-item` elements on the configured `url_liste`. `seine-et-marne.gouv.fr/Publications/RAA` returned an empty body on a plain fetch (likely a stale URL or JS-dependent listing) — also needs re-verification. Until each connecteur is proven against a real captured snapshot of its source, US4 (anomaly resolution UI) and US5 (disable a connector) are validating a pipeline no one has confirmed actually ingests real data. This phase moves ahead of Phase 6/7 in execution order; Phase 6/7 task IDs (T048+) are unchanged below but deprioritized until this phase's checkpoint is met.

**Goal**: Each of the 3 real connecteurs (13, 33, 77) is validated end-to-end against a real, captured snapshot of its source — covering (1) récupération (the real page/PDF is fetched and parsed), (2) traitement (candidates extracted match what a human reading the real page would expect), and (3) mise à jour de la carte (the département's state on the public API/map changes correctly after collecte) — entirely via mocked HTTP in the default test run (no live network call in `npm test`/CI). A separate, manual-only suite checks periodically whether the real source has drifted from the captured snapshot's *structure*, without ever asserting on the partner's actual data (which changes constantly and isn't ours to pin).

**Independent Test**: For each connecteur, `npm run test:integration` passes fully offline using the captured fixture; `npm run test:live-drift` (never run in CI, developer-triggered only) hits the real URL once per connecteur and reports structural drift (selectors/link patterns no longer matching) without failing on content changes.

- [X] V001 [P] Re-locate the actual arrêté-listing page for each of the 3 préfectures (current `url_liste` values are unconfirmed/likely wrong — cf. rationale above): confirm or correct `url_liste` in `registre-sources.yaml` notes and in each `prefecture-NN.yaml`, department by department (13, 33, 77)
  - **Done via live inspection (Chrome, 2026-08-13) — 3 genuinely different site structures, none matches the current `.raa-item` assumption**:
    - **13 (Bouches-du-Rhône)** — simplest of the three. `https://www.bouches-du-rhone.gouv.fr/Publications/RAA-et-Archives/RAA-2026` is a **single flat page**, no month drilldown, no `.fr-card`: 273 items for the year so far, each `a.fr-link--download` (parent `div.fr-text--lead.fr-my-3w div`), text "Télécharger recueil-13-2026-249-recueil-des-actes-administratifs-special-bis du 13 août 2026", `.fr-link__detail` span with "PDF - 0,81 Mb - 13/08/2026", href = direct PDF. One fetch, one page, no dynamic month URL needed — **best candidate to validate first**. Titles never contain "rave"/"teknival" (multi-arrêté bulletin PDFs) → needs the PDF-content-scan moteur extension (approved).
    - **33 (Gironde)** — 3-level drilldown: `url_liste` (`.../Publications/Recueil-des-Actes-Administratifs`) → year card (`.fr-card`, `h2.fr-card__title a`) → **month** sub-page (e.g. `.../Recueil-des-Actes-Administratifs-de-l-annee-2026/Aout-2026`) → bulletin PDFs as `.fr-card` items (`.fr-card__title a.fr-card__link` = title+href in one, `.fr-card__detail` = "Publié le DD/MM/YYYY"). The month segment in the URL is French, capitalized, no accent (`Aout-2026`, not `Août-2026`) — needs a **dynamic current-month URL**, not a static `url_liste`. Same bulletin-PDF pattern as 13 (titles like "RAA 33 SPECIAL N° 2026-243" never contain the keyword).
    - **77 (Seine-et-Marne)** — old `url_liste` (`.../Publications/RAA`) is a dead **404**; real page is `https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA` → year card → year page renders a `<select id="Liste-liste-docs">` of **individual daily RAA issues** (`<option value="Publications/.../RAA-2026/RAA-n-D77-13-08-2026" title="RAA n° D77-13-08-2026">`, ~200+/year, no JS needed to read it — real server-rendered `<select>`, cheerio-parseable) → each `<option>` points to an **HTML detail page** for that day's issue, which in turn links the actual PDF(s) (a day can have several: "nominatifs", "spécial", plain). 4 navigation levels total. Titles are dates, not arrêté subjects — needs the PDF scan too, applied per linked PDF on the detail page (potentially more than one per day).
  - **Net implication for V003/moteur**: none of the 3 real connecteurs can be validated with the current `page_web` moteur's single-level "list page → items → optional linked PDF" model. All 3 need the approved PDF-content-scan extension; 33 and 77 additionally need multi-level navigation (year → month/day → detail/PDF) that the moteur doesn't do today. Recommend validating **13 first** (single level, only needs the PDF-scan extension) as the pilot before tackling 33/77's extra navigation depth.
- [X] V001b Extend the `page_web` moteur (generic, no per-connector branch — contract §5 rule 7) so that when a linked PDF exists, its text is scanned for `mots_cles_filtrage` even when the publication title doesn't match (compiled RAA bulletins never have a descriptive title) — `backend/src/connecteurs/moteurs/pageWeb/moteur.ts`, approved by user 2026-08-13 before implementation
- [X] V001c **33/77 done** — Extend the `page_web` moteur (generic, no per-connector branch) with the two capabilities identified as missing in V001: an optional `navigation` (array of pre-list steps, each resolving the next URL by matching a link against a regex compiled from a declarative pattern with `{annee}`/`{mois_numero}`/`{mois_fr}`/`{mois_fr_minuscule}` placeholders substituted from the collecte date, Europe/Paris) and an optional `page_detail` (per-publication intermediate detail page, read from a configurable attribute — `href` by default, `value` for a `<select><option>` — before applying `selecteur_lien_pdf` there instead of inside the publication itself). Both default to empty/`null` — zero impact on `prefecture-13` (flat list, no navigation, no page_detail). Implementation: `backend/src/connecteurs/moteurs/pageWeb/config.schema.ts` (`EtapeNavigationSchema`/`PageDetailSchema`, `superRefine` requiring `selecteur_lien_pdf` when `page_detail` is set), `backend/src/connecteurs/moteurs/pageWeb/moteur.ts` (`resoudreUrl`/`resoudreNavigation`/`resoudreUrlPdfPublication`/`substituerPlaceholdersDate`), `backend/src/connecteurs/extraction/champsCommuns.ts` (`NOMS_MOIS_FR` export, derived from the existing `MOIS_FR` map — not duplicated), `backend/src/services/parisDate.ts` (`parisAnneeMoisCourant`). Contract documented in `contracts/connecteur-interface.md` §2/§2bis. Discovered live (Chrome inspection, 2026-08-13) that a `<select><option value="...">` on seine-et-marne.gouv.fr omits the leading `/` of an otherwise root-relative path — unlike any `href` observed on the 3 real sites — which the WHATWG `URL` resolver would otherwise silently resolve against the *current page's* path (duplicated segments, wrong URL); `resoudreUrl` normalizes this generically (any relative link without a leading `/` or scheme is treated as root-relative), not just for prefecture-77. Unit tests: `backend/tests/unit/connecteurs/moteurPageWeb.test.ts` (2 new `describe` blocks — navigation success/failure, page_detail success/isolated-failure — 6/6 new tests green, system clock fixed via `vi.setSystemTime` so `{annee}`/`{mois_fr}` resolution doesn't rot after 2026-08).
- [x] V002 [P] **13/33/77 done** — Capture a real, timestamped snapshot per connecteur into `backend/tests/fixtures/connecteurs/reel/prefecture-NN/` (`liste.html` + one representative attached PDF if the source links one), with a companion `SOURCE.md` recording the exact URL and capture date (depends on V001)
  - **13**: `liste.html` reconstructs the real DOM (classes/structure verified live) with 2 of the ~273 real bulletins; the 2 PDFs are **synthetic** (`reportlab`) — no tool in this session can download real PDF bytes. `SOURCE.md` states this limitation explicitly and recommends manually checking one real bulletin's exact wording before production use.
  - **33 (Gironde)**: 3-level structure confirmed live (Chrome, 2026-08-13) — `racine.html` (2 of 18 year cards), `annee-2026.html` (2 of 10 month cards, href month segment unaccented/capitalized — `Aout-2026`), `aout-2026.html` (2 of 10 bulletin cards, direct PDF link like prefecture-13, no detail page) — `backend/tests/fixtures/connecteurs/reel/prefecture-33/`. Same PDF-binary limitation as 13: `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` are synthetic (`reportlab`), documented in `SOURCE.md`.
  - **77 (Seine-et-Marne)**: 4-level structure confirmed live — the old `url_liste` (`.../Publications/RAA`) is a **404**, real racine is `.../Recueils-des-actes-administratifs-RAA` (`racine.html`, incl. a "featured" card linking straight to a PDF, kept as a distractor to prove `navigation` never confuses it with the year card) → `annee-2026.html` (`<select id="Liste-liste-docs">`, ~248 real options reduced to 2 + the real placeholder `option value=""`, `value` attribute root-relative **without** a leading `/`) → 2 detail pages (`detail-13-08-2026.html`, `detail-12-08-2026-nominatifs.html`, each with exactly one `a.fr-link--download`, confirmed live on 2 different days) → 2 synthetic PDFs. `backend/tests/fixtures/connecteurs/reel/prefecture-77/SOURCE.md`.
- [x] V003 [US-validation] **13/33/77 done** — Rewrite `selecteur_publications` / `selecteur_titre` / `selecteur_lien_pdf` / `patterns_dates` / `pattern_reference` in each `prefecture-NN.yaml` to match its captured snapshot; remove the "non vérifié" disclaimer once confirmed (depends on V002)
  - **13**: `url_liste` → `.../RAA-et-Archives/RAA-2026`; `selecteur_publications: "div.fr-text--lead.fr-my-3w > div"`; `selecteur_titre`/`selecteur_lien_pdf` both `"a.fr-link--download"` (same anchor is both). Date/reference patterns switched from a literal space to `\s+` before each capture group — a real PDF fixture proved `pdf-parse` reflows text across lines, breaking a literal-space regex mid-phrase ("à compter du\n13/08/2026").
  - **33**: `url_liste` → racine (`.../Recueil-des-Actes-Administratifs`) ; 2-level `navigation` (`-de-l-annee-{annee}$` then `/{mois_fr}-{annee}$`) resolves the month page dynamically ; `selecteur_publications: ".fr-card"`, `selecteur_titre`/`selecteur_lien_pdf` both `".fr-card__title a"` (same anchor, like prefecture-13) ; same `\s+` patterns as prefecture-13.
  - **77**: `url_liste` → real racine (was a dead 404) ; 1-level `navigation` (`/RAA-{annee}$`) resolves the year page ; `selecteur_publications: "#Liste-liste-docs option"` ; `selecteur_titre` deliberately a non-matching selector (an `<option>` has no descendant to `.find()`, so the moteur's existing `$publication.text()` fallback already yields the right label — verified identical to the `title` attribute live) ; `page_detail.attribut_lien: "value"` (not `href`) ; `selecteur_lien_pdf: "a.fr-link--download"` applied to the resolved detail page.
- [x] V004 [P] [US-validation] **13/33/77 done** — Integration test per connecteur — "récupération + traitement": mock `fetch` (and `pdf-parse` input where relevant) with the captured fixture, run the real `creerConnecteur(configReelle).collecter()`, assert the extracted candidats match what the captured page actually contains (reference, dates, autorité) in `backend/tests/integration/connecteurs/reel-prefecture-NN.test.ts` (depends on V003) — 13: 2/2 green ; 33: 2/2 green (navigation year→month resolved, PDF-only pertinence like 13) ; 77: 2/2 green (navigation + page_detail resolved, 1 of 2 `<select>` options correctly discarded for lacking the keyword in its PDF) — all verified against `registry.obtenirConnecteur(...)` (the real deployed configs, not hand-copied test configs), system clock fixed (`vi.setSystemTime`, 2026-08-13) since 33/77's `navigation` depends on the collecte date.
- [x] V005 [US-validation] **13/33/77 done** — Integration test per connecteur — "mise à jour de la carte": run `executerConnecteur` end-to-end through `runner.ts` against the same mocked fixture, then assert `GET /api/v1/departements` / `computeDepartementState` reflect the correct state for département NN after collecte (extends the pattern from T045, but against the *real* config instead of a fake connecteur) in `backend/tests/integration/connecteurs/reel-prefecture-NN-carte.test.ts` (depends on V004) — 13: 2/2 green ; 33: 2/2 green (département '33' vert → rouge) ; 77: 2/2 green (département '77' vert → rouge) — all reflect the new event on `GET /api/v1/departements` and `/departements/NN/evenements`, `source_url` non-null per SC-002 in every case.
- [x] V006 [P] Wire a separate, opt-in-only Vitest project for drift detection: `backend/vitest.live.config.ts` (`include: ['tests/live/**/*.test.ts']`), a `backend/tests/live/connecteurs/` directory, and a `"test:live-drift": "vitest run --config vitest.live.config.ts"` script in `package.json` — **not** included in `test`, `test:unit`, `test:contract`, `test:integration`, nor any CI workflow. Verified: `vitest.config.ts` now excludes `tests/live/**` (confirmed 0 files picked up by the default config), `test:live-drift` correctly attempts a real network call (fails only on this sandbox's lack of general internet egress — `EAI_AGAIN`, expected here, will work on a normal machine).
- [x] V007 [P] [US-validation] **13/33/77 done** — Manual-only drift test per connecteur in `backend/tests/live/connecteurs/prefecture-NN.live.test.ts`: fetch the real `url_liste` once, assert only *structural* contract properties survive (selectors resolve to ≥1 node, PDF-link pattern still present, page still reachable/200) — never assert on exact titles/dates/references, since upstream content changes routinely and isn't within this project's control (depends on V001, V006). **33**: walks both `navigation` steps live before checking the final page. **77**: walks the `navigation` step live, then resolves `page_detail` for the first option with a value, stopping at the first successfully-resolved PDF link to avoid hammering the site. Not runnable in either dev sandbox (no general internet egress) — structurally reviewed against the real captures at write-time. **Confirmed by actually running `npm run test:live-drift` on the operator's machine, 2026-08-13 22:58 — 3/3 passed**: prefecture-13 (PDF link present, 828ms), prefecture-33 (navigation racine→année→mois resolves to a page exposing a PDF link, 1640ms), prefecture-77 (navigation racine→année resolves the expected `<select>`, at least one option leads to a detail page with a PDF link, 2456ms). All 3 real connecteurs' selectors match production HTML as of this date.
- [x] V008 Document the manual trigger and intent of `test:live-drift` in `backend/README.md` (run cadence left to the operator — e.g. before re-enabling a connecteur after a long pause — never automated, to respect the 3 préfectures' sites and avoid false failures from unrelated upstream redesigns) — unchanged by V001c/33/77 (same script covers all 3 connecteurs' `tests/live/connecteurs/*.live.test.ts`)

**Checkpoint status (2026-08-13)**: **13 (Bouches-du-Rhône), 33 (Gironde) and 77 (Seine-et-Marne) all validated** — récupération, traitement (incl. PDF-content-scan, multi-level `navigation`, and `page_detail`) and mise à jour de la carte all proven offline for the 3 real connecteurs (10/10 new integration tests green across the 3, plus 6/6 new unit tests for the moteur extension itself). `page_web` now supports the 3 distinct real-world shapes observed across these 3 préfectures — flat list (13), 2-level year→month drilldown (33), and 1-level year drilldown + per-item detail page (77) — through configuration alone, no branch added to the moteur (contract §5 rule 7). `test:live-drift` itself confirmed green against production on 2026-08-13 (see V007) — the offline validation is corroborated live, not just structurally reasoned. Full regression run (T070) still pending before considering Phase 5bis fully closed.

## Phase 5bis élargie: 5 connecteurs supplémentaires — 01, 02, 03, 04, 05 (Priority: P2.5, 2026-08-14)

**Goal**: Extend the pattern proven in Phase 5bis (13/33/77) to the next 5 départements in `registre-sources.yaml` order — Ain (01), Aisne (02), Allier (03), Alpes-de-Haute-Provence (04), Hautes-Alpes (05) — same rigor: live browser inspection of the real site per département, accurate declarative `page_web` config, captured HTML snapshot fixtures with `SOURCE.md` provenance, offline integration tests ("récupération + traitement") mocking `fetch`, manual-only live-drift tests, and registration in `connecteurs.json`/`registre-sources.yaml`.

**Independent Test**: Same as Phase 5bis — `npm run test:integration` passes fully offline per connecteur using its captured fixture; `npm run test:live-drift` (developer-triggered only) hits each real URL and reports structural drift only.

- [X] V009 Extend the `page_web` moteur (generic, no per-connector branch — contract §5 rule 7) with an alternative navigation-step form, `periodes` (array of `{motif, mois_debut, mois_fin}`), mutually exclusive with `pattern_lien` (`EtapeNavigationSchema.superRefine` enforces exactly one of the two) — needed because prefecture-04 (Alpes-de-Haute-Provence) archives by **irregular semester** (janvier-juillet / août-décembre) rather than by month or year, and the month name only appears in the URL for the 4 boundary months. `resoudreMotifEtape()` picks the `periodes` entry whose `[mois_debut, mois_fin]` (with wraparound support) contains the current month (Europe/Paris) before the existing placeholder substitution/regex-match logic runs unchanged. Implementation: `backend/src/connecteurs/moteurs/pageWeb/config.schema.ts`, `backend/src/connecteurs/moteurs/pageWeb/moteur.ts`. Contract documented in `contracts/connecteur-interface.md` §2ter. Unit tests: `backend/tests/unit/connecteurs/moteurPageWeb.test.ts` (4 new tests — period resolution success, no-period-covers-current-month failure, schema rejects both-forms, schema rejects neither-form).
- [X] V010 Extend the `page_web` moteur with an `optionnelle` boolean flag (default `false`) on a navigation step: if `true` and no link matches the step's motif, the step is silently skipped (current page carries forward) instead of throwing — needed because "jump to last pagination page" links (prefecture-02, prefecture-05) are **entirely absent from the DOM**, not just empty, when a month/year has few enough entries to fit on a single page (confirmed empirically live against an empty future month on hautes-alpes.gouv.fr). Implementation: same 2 files as V009. Contract documented in `contracts/connecteur-interface.md` §2quater. Unit tests: 2 new tests in `moteurPageWeb.test.ts` (uses current page when pagination link absent; still follows it when present) — total 14/14 green in that file, no regression to the 3 existing real connecteurs (registry.test.ts 9/9 still green).
- [X] V011 [P] Live-inspect (Chrome) and build the declarative config for each of the 5 départements — `backend/src/connecteurs/configs/prefecture-0N.yaml` — one genuinely different site shape per département, none reusing the `page_web` moteur's existing behaviour by accident:
  - **01 (Ain)** — 2-level `navigation` (année → mois, href `.../RAA-2026/08-AOUT`, `{mois_numero}-{mois_fr}` uppercase in production, case-insensitive match) then a flat bulletin list identical in shape to prefecture-13 (`div.fr-text--lead > div`, same anchor is title+PDF link).
  - **02 (Aisne)** — 1-level `navigation` (année) + `optionnelle` jump to the last pagination page (V010, croissant chronological order) + `page_detail` (each `.fr-card__link` anchor leads to an HTML detail page, not a direct PDF, like prefecture-77).
  - **03 (Allier)** — 1-level `navigation` (année) whose target server-redirects straight to the flat annual list (`fetch` follows the redirect natively — no extra navigation step needed), same-anchor title+PDF pattern as 13.
  - **04 (Alpes-de-Haute-Provence)** — 1-level `navigation` using `periodes` (V009) instead of `pattern_lien` — semester card is already the complete flat list (`.fr-table td > div`), no further drilldown.
  - **05 (Hautes-Alpes)** — the deepest: 3-level `navigation` (année → mois → `optionnelle` last-pagination-page, V010) + `page_detail`, where the detail page's download link has a **real markup bug** (`<a id= class="fr-link fr-link--download" href="...">`, unquoted empty `id` swallowing `class=` per the HTML5 tokenizer — verified identical in Chrome's DOM and in the raw server response text, i.e. cheerio would see the same thing) that permanently breaks the `class` attribute on that element; `selecteur_lien_pdf` targets `a[href$='.pdf']` instead, confirmed against a local cheerio repro (`$('a').attr('class')` → `undefined`, `a.fr-link--download` → 0 matches, `a[href$='.pdf']` → 1 match).
  - All 5 configs pass `configsSchema.test.ts`'s generic per-file Zod validation.
- [x] V012 [P] Capture a real, timestamped HTML snapshot per connecteur into `backend/tests/fixtures/connecteurs/reel/prefecture-0N/` (one file per navigation level actually walked, plus one representative pair of attached PDFs), with a companion `SOURCE.md` per département recording what was verified live vs. assumed (same PDF-binary limitation as 13/33/77 — no tool in this session can download real PDF bytes, so `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` are synthetic, generated with `reportlab`, reference `0N-2026-08-XXX` and dates 13/08/2026→18/08/2026 baked in for the integration tests to assert against). 01: `racine.html`/`annee-2026.html`/`08-aout.html`. 02: `racine.html`/`annee-2026.html`/`derniere-page.html`/`detail-011.html`/`detail-005.html`. 03: `racine.html`/`annee-2026.html` (the latter representing the page reached after the site's server redirect). 04: `racine.html`/`semestre-2026-aout-decembre.html`. 05: `racine.html`/`annee-2026.html`/`mois-aout-2026.html`/`derniere-page.html`/`detail-327.html`/`detail-320.html` (the last 2 reproducing the real markup bug verbatim).
- [x] V013 [P] [US-validation] Integration test per connecteur — "récupération + traitement": mock `fetch` with the captured fixture, run the real `obtenirConnecteur('prefecture-0N').collecter()`, assert the extracted candidat matches the fixture (reference, dates, autorité, source PDF URL) and that the keyword-negative bulletin is correctly discarded — `backend/tests/integration/connecteurs/reel-prefecture-0N.test.ts` (depends on V011/V012), system clock fixed (`vi.setSystemTime`, 2026-08-13) since every one of the 5 configs' `navigation` depends on the collecte date. 10/10 tests green across the 5 files, verified via `device_bash` on the operator's machine — no `-carte` variant added for these 5 (not added for 33/77 either; the runner→map pipeline is already proven end-to-end by V005/T045/T046, re-proving it per connecteur would duplicate coverage without testing anything connector-specific).
- [x] V014 [P] [US-validation] Manual-only drift test per connecteur in `backend/tests/live/connecteurs/prefecture-0N.live.test.ts`, same spirit as V007 (structural assertions only, never content): 01/03 walk `pattern_lien` navigation steps (03: single step, redirect-followed); 02/05 additionally treat an `optionnelle` step correctly (asserts the step is either resolved or explicitly marked `optionnelle` in the config, never silently swallowed) before resolving `page_detail`; 04 resolves the `periodes` form by computing the current month's matching period locally, mirroring `resoudreMotifEtape()`. Not runnable from this sandbox (`device_bash` has no network egress — confirmed via `EAI_AGAIN` on 2 of the 5, same limitation as V007) — **pending operator run via `npm run test:live-drift` on their own machine**, same as the 13/33/77 confirmation in V007.
- [x] V015 Register the 5 new connecteurs in `backend/src/data/connecteurs.json` (`actif: true`) and flip `backend/src/data/registre-sources.yaml` départements 01-05 from `statut: identifiee` to `statut: connecteur_developpe` with `connecteur_id: prefecture-0N` (04's `point_acces` corrected to the real semester-archive URL discovered live, differing from the placeholder path recorded in the original 2026-08-13 web research). Updated the 2 pre-existing tests that hardcoded the "3 real connecteurs" list to now expect 8 (`configsSchema.test.ts`, `registreSources.test.ts`) — both would otherwise have failed not because anything regressed, but because they were asserting a now-stale closed set; caught by running the full suite, not assumed.

**Checkpoint status (2026-08-14)**: **01 (Ain), 02 (Aisne), 03 (Allier), 04 (Alpes-de-Haute-Provence) and 05 (Hautes-Alpes) all validated offline** — récupération + traitement proven for all 5 against captured real snapshots (10/10 new integration tests green), 2 generic moteur extensions added and unit-tested (`periodes` for irregular-semester archives, `optionnelle` for pagination links absent rather than empty — 6/6 new unit tests, 14/14 total in `moteurPageWeb.test.ts`), full regression run clean: `test:unit` 54/54, `test:contract` 30/30, `test:integration` all green including the pre-existing 13/33/77 suites (no regression from the registry/registre-sources edits). `page_web` now covers 8 real connecteurs across every navigation shape encountered so far (flat, 2-level, 3-level, redirect-followed, paginated-optional, irregular-periods, page_detail with and without a markup bug) — still zero per-connector branches in the moteur itself. **`test:live-drift` for the 5 new connecteurs could not be run from this sandbox (no network egress) — pending an operator run on their own machine**, same confirmation step already done for 13/33/77 in V007.

---

## Phase 5bis élargie 2: 5 connecteurs supplémentaires — 06, 07, 08, 09, 10 (Priority: P2.5, 2026-08-14)

**Goal**: Extend the pattern proven in Phase 5bis élargie to the next 5 départements in `registre-sources.yaml` order — Alpes-Maritimes (06), Ardèche (07), Ardennes (08), Ariège (09), Aube (10) — same rigor as before: live site inspection, accurate declarative `page_web` config, captured HTML snapshot fixtures with `SOURCE.md` provenance, offline integration tests ("récupération + traitement") mocking `fetch`, manual-only live-drift tests, and registration in `connecteurs.json`/`registre-sources.yaml`. Unlike Phase 5bis élargie, this session's cloud sandbox has confirmed real outbound network access to the target `.gouv.fr` domains, so both live site inspection and `test:live-drift` itself were run for real from within the sandbox — no operator run needed to close out this phase.

**Independent Test**: Same as prior phases — `npm run test:integration` passes fully offline per connecteur using its captured fixture; `npm run test:live-drift` hits each real URL and reports structural drift only (run for real this time, not deferred).

- [X] V016 [P] Inspect (direct `curl` + Python/BeautifulSoup from the cloud sandbox, no Chrome needed this time) and build the declarative config for each of the 5 départements — `backend/src/connecteurs/configs/prefecture-0N.yaml` — all 5 reuse `navigation`/`page_detail`/`optionnelle` capabilities already added in V001c/V009/V010; no new moteur extension was needed this phase:
  - **06 (Alpes-Maritimes)** — 2-level `navigation` (année → mois, descending pagination order, no jump needed), flat `.fr-card` list, same-anchor title+PDF pattern (`.fr-card__title a`) as 01/03/13.
  - **07 (Ardèche)** — 2-level `navigation` (année → mois, no year suffix on the month link), `selecteur_publications: ".fr-downloads-group li"`; download links carry the same unquoted-empty-`id=` markup bug first seen on prefecture-05, worked around with `a[href$='.pdf']` for both `selecteur_titre` and `selecteur_lien_pdf`.
  - **08 (Ardennes)** — 1-level `navigation` (année only, single flat year-long page); same `id=` markup bug, but only on **about half** the download links (129 of 258) rather than universally — `a[href$='.pdf']` used uniformly anyway since it's correct for both the buggy and non-buggy links alike; `selecteur_publications: ".fr-col-md-8 li"` chosen over `.fr-downloads-group li` after empirically comparing candidate selectors' match counts (258 vs. 129) against the real PDF-link count on the live page.
  - **09 (Ariège)** — 2-level `navigation` where step 1 is a **literal fixed pattern** (`a-partir-du-28-avril-2015$`, no date placeholder) rather than a templated one — legitimate since this archive-root segment never varies with the collecte date — then step 2 templated by month/year; same `id=` bug workaround, `selecteur_publications: ".fr-downloads-group li"`.
  - **10 (Aube)** — 1-level `navigation` (année only), flat `.fr-card` list, same-anchor pattern like 06; `url_liste` corrected to the real redirected URL (`.../Publications/Recueil-des-Actes-Administratifs-RAA2`) discovered live, differing from the placeholder path recorded in the original 2026-08-13 web research (same kind of correction as 04's `point_acces` in V015).
  - All 5 configs pass `configsSchema.test.ts`'s generic per-file Zod validation.
- [X] V017 [P] Capture a real, timestamped HTML snapshot per connecteur into `backend/tests/fixtures/connecteurs/reel/prefecture-0N/` (one file per navigation level actually walked, plus one representative pair of attached PDFs), with a companion `SOURCE.md` per département. Same PDF-binary limitation as every prior connecteur — no tool in this session can download real PDF bytes, so `bulletin-avec-arrete.pdf`/`bulletin-sans-arrete-pertinent.pdf` are synthetic (`reportlab`), reference `0N-2026-08-XXX` (references 277/249/129/124/194 for 06-10 respectively, chosen to match each site's real numbering scheme) and dates 13/08/2026→18/08/2026 baked in for the integration tests to assert against. Real download-link URLs (including spaces/accented characters) were resolved through Node's `URL` constructor before being hardcoded into the mock-fetch tests, to catch percent-encoding mismatches before they could cause a silently-never-matching mock rather than after.
- [x] V018 [P] [US-validation] Integration test per connecteur — "récupération + traitement": mock `fetch` with the captured fixture, run the real `obtenirConnecteur('prefecture-0N').collecter()`, assert the extracted candidat matches the fixture (reference, dates, autorité, source PDF URL) and that the keyword-negative bulletin is correctly discarded — `backend/tests/integration/connecteurs/reel-prefecture-0N.test.ts` (depends on V016/V017), system clock fixed (`vi.setSystemTime`, 2026-08-13). 10/10 tests green across the 5 files on first run. No `-carte` variant, same rationale as V013.
- [x] V019 [P] [US-validation] Manual-only drift test per connecteur in `backend/tests/live/connecteurs/prefecture-0N.live.test.ts`, same spirit as V007/V014 (structural assertions only, never content) — **actually run for real against production from this session's cloud sandbox** (confirmed outbound access to the target `.gouv.fr` domains, unlike the prior phase and unlike `device_bash` on the operator's machine, which remains proxy-restricted): all 5 new live-drift tests passed. Re-ran the full `test:live-drift` suite across all 13 connecteurs (77/13/33 + 01-05 + 06-10) from the sandbox — 13/13 passed, confirming zero structural drift fleet-wide as of 2026-08-14, not just for the 5 newly added.
- [x] V020 Register the 5 new connecteurs in `backend/src/data/connecteurs.json` (`actif: true`) and flip `backend/src/data/registre-sources.yaml` départements 06-10 from `statut: identifiee` to `statut: connecteur_developpe` with `connecteur_id: prefecture-0N` (10's `point_acces` corrected as noted in V016). Updated the 2 pre-existing tests that hardcoded the "8 real connecteurs" list to now expect 13 (`configsSchema.test.ts`, `registreSources.test.ts`), same maintenance step as V015 — caught by running the full suite, not assumed.

**Checkpoint status (2026-08-14)**: **06 (Alpes-Maritimes), 07 (Ardèche), 08 (Ardennes), 09 (Ariège) and 10 (Aube) all validated offline AND live** — récupération + traitement proven for all 5 against captured real snapshots (10/10 new integration tests green), full regression run clean: offline 189/189 tests across 41 files, no regression from the registry/registre-sources edits. `page_web` continues to cover every new site through configuration alone (no new moteur extension needed this phase — `navigation`/`page_detail`/`optionnelle` from V001c/V009/V010 sufficed for all 5 shapes, including a literal-fixed navigation pattern and a partial rather than universal instance of the prefecture-05 markup bug). Unlike Phase 5bis élargie, **`test:live-drift` was run for real this time, from the cloud sandbox itself** — all 5 new connecteurs pass, and a full fleet re-run confirms all 13 real connecteurs (77/13/33/01-05/06-10) are drift-free against production as of 2026-08-14. Phase 5bis and its two extensions are now fully closed for these 13 départements, with no operator action pending.

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

## Phase 9: User Story 6 - Reconstituer l'historique des arrêtés sur plusieurs années (Priority: P6)

**Status (2026-08-13)**: Planifiée seulement — documentée à la demande de l'opérateur ("Documenter d'abord") suite à la question sur le remplissage de l'historique. Aucune tâche de cette phase n'est implémentée. Ce n'est PAS un prérequis aux phases précédentes ni à leur mise en service : le backfill est un script ponctuel, pensé pour être exécuté de façon asynchrone une fois l'application déjà fonctionnelle (cf. spec.md, Assumptions).

**Goal**: Fournir un script de rétro-collecte générique (tous connecteurs, présents et futurs, sans code spécifique) capable de reconstituer par défaut les 5 dernières années d'historique par connecteur, en réutilisant sans divergence le pipeline de décision existant (publication directe / anomalie) et le mécanisme de déduplication.

**Independent Test**: Exécuter le script contre un connecteur de test dont les fixtures couvrent plusieurs périodes passées ; vérifier que les candidats extraits traversent le même pipeline (`evaluerCandidat`/`executerConnecteur`) que la collecte courante, qu'une ré-exécution sur une période déjà traitée ne duplique rien, et qu'aucun code spécifique à ce connecteur n'a été nécessaire.

- [ ] T072 [US6] Extend `ExecutionCollecte.declenchement` enum (`planifie` \| `manuel`) with a third value `backfill` in `backend/src/models/executionCollecte.ts` and `data-model.md` (FR-024)
- [ ] T073 [US6] Add an optional historical-date parameter to the collection path — e.g. `Connecteur.collecter(dateReference?: Date)` — in `backend/src/connecteurs/types.ts` and `contracts/connecteur-interface.md`, so that `navigation`/`url_liste` placeholder resolution (currently always `new Date()`, cf. `resoudreNavigation`) can target a supplied historical period instead of "now" (FR-020) (depends on T006, T015)
- [ ] T074 [US6] Extend the `page_web` moteur's `url_liste` to accept the same `{annee}`/`{mois_numero}`/`{mois_fr}` placeholders already supported by `navigation` steps (`config.schema.ts`, `moteur.ts`), and migrate `prefecture-13.yaml`'s hardcoded literal `"2026"` in `url_liste` to a placeholder — fixes a latent year-rollover bug and is a precondition for genericity (FR-020) (depends on T073)
- [ ] T075 [US6] Implement the backfill script entrypoint (e.g. `backend/src/scripts/backfill.ts`), iterating a configurable period range (default: 5 dernières années) for one connector or all active connectors from the registry, calling `executerConnecteur(connecteur, 'backfill', dateReference)` **séquentiellement** per period (never in parallel, same write-safety rule as the daily scheduler, T016/T040) (FR-019, FR-020, FR-022) (depends on T072, T074)
- [ ] T076 [US6] Verify backfill reuses `dedupe.ts` unchanged (no separate code path) so repeated runs over overlapping periods create zero duplicate events (FR-023, Acceptance Scenario US6.4) (depends on T075)
- [ ] T077 [US6] Verify backfill candidates flow through the unchanged `evaluerCandidat` anomaly path — no bulk-publish shortcut for backfill (FR-021, Acceptance Scenario US6.2) (depends on T075)
- [ ] T078 [US6] Handle per-connector navigation dead-ends gracefully (e.g. a source's history doesn't go back the full 5 years) — log how far the backfill reached for that connector and continue with the next connector rather than aborting the whole run (Acceptance Scenario US6.3) (depends on T075)
- [ ] T079 [P] [US6] Integration test: backfill script against a fake/test connector with multiple historical periods — decision-pipeline reuse, anomaly routing, idempotence on re-run, graceful stop at a source's navigable limit, no automatic trigger from the scheduler in `backend/tests/integration/connecteurs/backfill.test.ts` (Acceptance Scenarios US6.1–US6.5) (depends on T075, T076, T077, T078)
- [ ] T080 [US6] Document script usage (CLI invocation, default 5-year range, targeting one connector vs. all) in `quickstart.md` or a dedicated backfill runbook (Acceptance Scenario US6.5)

**Checkpoint**: Le backfill est générique, idempotent, routé par le même pipeline d'anomalies que la collecte courante, et reste un script à déclenchement manuel indépendant du cycle quotidien.

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
- **Validation (Phase 5bis)**: Depends on US2/US3 (Phases 4–5) — needs the real connecteurs and scheduler to exist. **Reprioritized ahead of Phase 6/7 as of 2026-08-13**: build/execute order should be Setup → Foundational → US1 → US2 → US3 → **5bis** → US4 → US5 → Polish, even though Phase numbers weren't renumbered (to avoid renumbering already-completed task IDs).
- **Polish (Phase 8)**: Depends on all desired user stories being complete.
- **US6 (Phase 9, backfill)**: Depends on US2/US3 (real connecteurs + `executerConnecteur`) and US4 (anomaly pipeline it reuses unmodified). Independent of US5. **Not required for MVP nor for any prior phase's checkpoint** — added 2026-08-13 as a documented-only phase, explicitly deferred: the operator chose to document the design now and decide separately when to implement/run it, asynchronously, once the application is already functional (cf. spec.md US6 "Why this priority").

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
5. **Add Phase 5bis (reprioritized, 2026-08-13) → each of the 3 real connecteurs (13, 33, 77) validated against a captured real snapshot: récupération, traitement, and map update all covered offline; manual-only `test:live-drift` in place.**
6. Add US4 → anomalies surfaced and resolvable via the admin UI.
7. Add US5 → connectors can be disabled safely.
8. Polish → docs, full regression, quickstart validation.
9. **Add US6 (backfill, documented 2026-08-13, not yet implemented)** → once the application is functional and stable, run a one-off, generic, asynchronous rétro-collecte over the last 5 years for every connector, ambiguous candidates going through the same anomaly-resolution space as live collection. Deliberately last and deferred — not required to reach any of the milestones above.

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
