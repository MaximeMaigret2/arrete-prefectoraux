# Tasks: Un échec de téléchargement PDF ne doit plus jamais ressembler à « rien à signaler »

**Input**: Documents de conception depuis `specs/007-fiabilisation-echec-telechargement-pdf/`

**Prerequisites**: plan.md, spec.md (committé, `1abbbb2`)

**Tests**: inclus — convention déjà en place depuis la feature 001.

**Organization**: 4 user stories — US1/US2/US3 en P1, US4 en P2. Dépendance stricte US1 → US2 → US3 (chacune indépendamment testable, cf. spec.md « Independent Test ») ; US4 dépend de US1+US2 (la priorisation et la réactivation ciblée n'ont de sens qu'une fois le signal disponible dans les données persistées).

## Format: `[ID] [P?] [US#] Description`

## Phase 1: Setup

Aucune tâche de setup distincte : `backend/src/scripts/` existe déjà (feature 005), aucune nouvelle dépendance (plan.md, Principe 5).

## Phase 2: Foundational

Aucune tâche fondationnelle bloquante distincte de T002 (US1) : le nouveau type `CandidatNonResolu` est un prérequis direct de l'US1, pas une fondation séparée.

## Phase 3: User Story 1 - Un échec de résolution du PDF ne disparaît plus silencieusement (Priority: P1) 🎯 MVP technique

**Goal**: `ResultatCollecte.candidatsNonResolus` distingue, pour chaque candidat du moteur `page_web` dont le titre seul n'est pas pertinent, un échec de résolution (`page_detail`/PDF inaccessible) d'un « non pertinent » réellement vérifié.

**Independent Test**: cf. spec.md, US1.

### Tests for User Story 1

- [ ] T001 [P] [US1] `backend/tests/unit/connecteurs/moteurPageWeb.test.ts` : échec de résolution `page_detail`/PDF + titre seul non pertinent → `candidatsNonResolus` contient l'entrée (`departement_code`, `message`, `source`) ; titre déjà pertinent + PDF en échec → candidat publié normalement, `candidatsNonResolus` vide (FR-002) ; PDF lu avec succès sans mot-clé → candidat écarté, `candidatsNonResolus` vide (FR-003) ; PDF scan illisible (texte extractible < 20 caractères) → comportement actuel inchangé, `candidatsNonResolus` vide (edge case dédié, distinct) ; `granularite_liste: annuelle` + au moins un candidat non résolu → `anneesCouvertes` non émis (FR-011, défense en profondeur).

### Implementation for User Story 1

- [ ] T002 [US1] `backend/src/connecteurs/types.ts` : ajouter le type exporté `CandidatNonResolu { departement_code: string; message: string; source: SourceBrute }` et `ResultatCollecte.candidatsNonResolus?: CandidatNonResolu[]`.
- [ ] T003 [US1] `backend/src/connecteurs/moteurs/pageWeb/moteur.ts` : dans la boucle principale de `collecter()`, quand la résolution de `resoudreUrlPdfPublication` ou de `telechargerEtExtraireTextePdf` échoue et que le titre seul n'était pas déjà pertinent, pousser une entrée dans `candidatsNonResolus` au lieu de laisser le candidat disparaître sans trace — dépend de T002.
- [ ] T004 [US1] `backend/src/connecteurs/moteurs/pageWeb/moteur.ts` : quand `granularite_liste === 'annuelle'`, ne plus émettre `anneesCouvertes` si `candidatsNonResolus` n'est pas vide (FR-011) — dépend de T003.
- [ ] T005 [US1] `specs/002-connecteur-collecte-prefecture/contracts/connecteur-interface.md` : vérifier que la documentation de `candidatsNonResolus` (§1 `ResultatCollecte`, point 7 des comportements génériques) déjà rédigée dans cette session est bien committée avec le reste de la feature.

**Checkpoint**: un échec de résolution PDF/`page_detail` sur un candidat dont le titre seul n'est pas pertinent est désormais visible dans `ResultatCollecte`, sans changement de comportement pour les cas déjà correctement traités (FR-002, FR-003, scan illisible).

## Phase 4: User Story 2 - Le statut d'exécution rend l'incertitude visible sans relire les journaux bruts (Priority: P1)

**Goal**: une exécution comportant au moins un candidat non résolu obtient le statut `incertain` (prioritaire sur `succes`/`partiel`) et une `AnomalieCollecte` de type `candidat_non_resolu` par candidat concerné.

**Independent Test**: cf. spec.md, US2.

### Tests for User Story 2

- [ ] T006 [P] [US2] `backend/tests/unit/connecteurs/runner.test.ts` : `determinerStatut` priorise `'incertain'` dès que `nombreCandidatsNonResolus > 0`, y compris quand `nombrePublies > 0` (Acceptance Scenario US2.3) et quand `nombrePublies > 0 && nombreAnomalies > 0` (l'`incertain` prime sur le `partiel`) ; inchangé (`succes`/`partiel`/`echec`) quand `nombreCandidatsNonResolus === 0` ; `construireAnomalieNonResolu` produit une `AnomalieCollecte` de type `candidat_non_resolu` correctement formée à partir d'un `CandidatNonResolu`.

### Implementation for User Story 2

- [ ] T007 [US2] `backend/src/models/anomalieCollecte.ts` : ajouter `'candidat_non_resolu'` à `TypeAnomalieSchema`.
- [ ] T008 [US2] `backend/src/models/executionCollecte.ts` : ajouter `'incertain'` à `StatutExecutionSchema` ; ajouter `nombre_candidats_non_resolus: z.number().int().min(0).default(0)` à `ExecutionCollecteSchema` (rétrocompatible pour les exécutions déjà persistées, cf. `data/loader.ts`) ; étendre la règle `superRefine` existante pour exiger `statut === 'incertain'` dès que `nombre_candidats_non_resolus > 0`.
- [ ] T009 [US2] `backend/src/connecteurs/runner.ts` : `construireAnomalieNonResolu()` (nouveau, parallèle à `construireAnomalieEchecLecture`) — dépend de T007.
- [ ] T010 [US2] `backend/src/connecteurs/runner.ts` : `executerConnecteurAvecClassification` compte `resultat.candidatsNonResolus`, persiste une `AnomalieCollecte` par candidat non résolu via `construireAnomalieNonResolu` (T009), et transmet le compte à `determinerStatut` — dépend de T003, T009.
- [ ] T011 [US2] `backend/src/connecteurs/runner.ts` : `determinerStatut()` gagne un 4e paramètre (`nombreCandidatsNonResolus`) et priorise `'incertain'` avant même la règle `publiés>0 && anomalies>0 → partiel` — dépend de T008.
- [ ] T012 [US2] `specs/002-connecteur-collecte-prefecture/contracts/admin-api.yaml` : `AnomalieCollecte.type_anomalie` += `candidat_non_resolu` ; `ExecutionCollecte.statut` += `incertain` ; `ExecutionCollecte.properties` += `nombre_candidats_non_resolus` (integer, minimum 0) — dépend de T007, T008.

**Checkpoint**: une exécution avec candidat(s) non résolu(s) est reconnaissable au premier coup d'œil sur son `statut` (`incertain`), sans avoir à connaître un champ annexe, et chaque candidat non résolu laisse une trace individuelle dans `anomalies.json`.

## Phase 5: User Story 3 - Le backfill ne referme jamais un mois/année qui a perdu un candidat (Priority: P1)

**Goal**: `backfill-historique.ts` ne retire jamais du checkpoint un mois (ni, pour un connecteur `granularite_liste: annuelle`, l'année entière) dont l'exécution comporte un candidat non résolu, et ce signal ne compte jamais dans le seuil du circuit-breaker.

**Independent Test**: cf. spec.md, US3.

### Tests for User Story 3

- [ ] T013 [P] [US3] `backend/tests/integration/connecteurs/backfill-historique.test.ts` : une exécution `incertain` (`nombre_candidats_non_resolus > 0`) ne retire pas le mois/année du checkpoint et ne réinitialise ni n'incrémente `echecsReseauConsecutifs` ; le comportement existant pour `succes` (retrait + reset) et `echec` (réseau vs page introuvable, cf. feature 005) reste inchangé ; une reprise ultérieure retente normalement le mois laissé dans `moisRestants`.

### Implementation for User Story 3

- [ ] T014 [US3] `backend/src/scripts/backfill-historique.ts` : nouvelle branche dans `executerBackfill()`, évaluée avant la branche de succès — si `execution.nombre_candidats_non_resolus > 0`, ne pas retirer le mois/année du checkpoint et ne pas toucher `echecsReseauConsecutifs` — dépend de T010, T011.
- [ ] T015 [US3] `backend/src/scripts/backfill-historique.ts` : `RapportGroupe` += `moisNonResolus` (compteur), affiché dans le résumé final de l'orchestration — dépend de T014.

**Checkpoint**: un mois/année ayant perdu un candidat pendant le backfill reste éligible à une reprise ultérieure, sans jamais avoir compté comme un échec réseau ni avoir été marqué traité à tort.

## Phase 6: User Story 4 - Prioriser et réactiver la remédiation de l'historique déjà collecté avant ce correctif (Priority: P2)

**Goal**: un opérateur peut, sans lancement automatique, obtenir une priorisation objectivable du périmètre à rejouer (parmi l'historique déjà marqué « traité » avant ce correctif) puis réactiver explicitement les mois/années choisis dans le checkpoint.

**Independent Test**: cf. spec.md, US4.

### Tests for User Story 4

- [ ] T016 [P] [US4] `backend/tests/integration/connecteurs/prioriser-remediation.test.ts` (checkpoint/executions/configs synthétiques, aucun réseau réel) : classement par plausibilité (connecteurs `granularite_liste: annuelle`, exécutions `succes` à 0 événement publié en tête) ; les candidats non résolus actuels (post-correctif, si le connecteur a déjà été relancé) sont listés séparément.
- [ ] T017 [P] [US4] `backend/tests/integration/connecteurs/reactiver-mois-checkpoint.test.ts` : réinsertion ciblée d'un périmètre explicite (connecteurs, éventuellement plage de mois) dans `moisRestants`, en union avec l'existant — jamais de perte d'un mois déjà en attente, jamais de doublon.

### Implementation for User Story 4

- [ ] T018 [US4] `backend/src/scripts/prioriser-remediation.ts` (nouveau) : lecture seule — classe les connecteurs déjà marqués « traités » par plausibilité et liste les candidats non résolus actuels (post-correctif) — dépend de T010, T015.
- [ ] T019 [US4] `backend/src/scripts/reactiver-mois-checkpoint.ts` (nouveau) : réinsère dans `moisRestants` du checkpoint les mois cibles d'un périmètre explicite fourni par l'opérateur, en union avec l'existant — dépend de T014.
- [ ] T020 [US4] `backend/package.json` : scripts npm dédiés (ex. `remediation:prioriser`, `remediation:reactiver`) pour invoquer T018/T019, documentés en commentaire dans chaque fichier.
- [ ] T021 [US4] Vérification de non-régression complète : `npx tsc -p backend/tsconfig.json --noEmit`, suite `tests/unit` + `tests/contract` + `tests/integration` backend complète (hors `test:live-drift`) — 0 erreur, 0 régression.

**Checkpoint**: un opérateur dispose d'une liste priorisée et objectivable du périmètre à rejouer, et peut réactiver explicitement un sous-ensemble choisi sans jamais perdre de progression déjà acquise après ce correctif.

## Phase 7: Exécution réelle (hors code, opérationnel)

Cette phase n'est pas du développement mais l'exécution du mécanisme livré par les phases précédentes — jamais un lancement automatique (FR-017, Assumptions).

- [ ] T022 Lancer `prioriser-remediation.ts` (T018, lecture seule) sur le périmètre complet et faire valider par l'opérateur le sous-ensemble à réactiver avant tout rejeu.
- [ ] T023 Sur validation, lancer `reactiver-mois-checkpoint.ts` (T019) sur le sous-ensemble validé.
- [ ] T024 Relancer `backfill-historique.ts` (déjà existant, feature 005, désormais fiabilisé par T014) sur le sous-ensemble réactivé.
- [ ] T025 Documenter le résultat de cette remédiation (mois/années effectivement rejoués, candidats non résolus rencontrés, événements historiques supplémentaires publiés) dans `claude/etat-connecteurs.md`.

## Dependencies & Execution Order

- Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4), strictement : US2 a besoin du signal produit par US1 (T003) ; US3 a besoin du statut/comptage produit par US2 (T010, T011) ; US4 a besoin des deux (T010, T015) pour prioriser et réactiver un périmètre pertinent.
- À l'intérieur de la Phase 3 : T002 → T003 → T004 ; T005 en parallèle ; T001 en parallèle de l'implémentation correspondante.
- À l'intérieur de la Phase 4 : T007 et T008 sont indépendants et peuvent être menés en parallèle ; T009 dépend de T007 ; T010 dépend de T003 et T009 ; T011 dépend de T008 ; T012 dépend de T007 et T008 ; T006 en parallèle de l'implémentation correspondante.
- À l'intérieur de la Phase 5 : T014 dépend de T010 et T011 ; T015 dépend de T014 ; T013 en parallèle de l'implémentation correspondante.
- À l'intérieur de la Phase 6 : T018 et T019 sont indépendants et peuvent être menés en parallèle ; T020 dépend des deux ; T021 dépend de T020 ; T016/T017 en parallèle de l'implémentation correspondante.
- Phase 7 ne démarre qu'après T021 (non-régression complète validée) — jamais de réactivation ni de rejeu réel avant que la suite de tests automatisée ne soit intégralement verte. T022 précède T023, qui précède T024, qui précède T025.

## Notes

- Aucune tâche de migration de données applicative au sens strict : `ExecutionCollecte` gagne un champ à valeur par défaut (`nombre_candidats_non_resolus: 0`, rétrocompatible via zod, cf. `data/loader.ts`) et une valeur d'énumération supplémentaire (`statut: 'incertain'`) ; `AnomalieCollecte` gagne une valeur d'énumération (`type_anomalie: 'candidat_non_resolu'`). Aucune ré-écriture des exécutions/anomalies déjà persistées n'est nécessaire ni proposée par cette feature (les exécutions passées restent `succes`/`echec`/`partiel` telles quelles — la remédiation de l'historique déjà collecté avant ce correctif passe uniquement par US4, sur la base d'une plausibilité, jamais d'une réécriture rétroactive du statut).
- Le fichier de checkpoint (`backfill-checkpoint.json`, feature 005) reste le même artefact opérationnel hors modèle applicatif ; seule la logique qui le met à jour (T014) et deux nouveaux scripts qui le manipulent explicitement (T018, T019) changent.
- Aucune modification de `dedupe.ts` ni de la mécanique de résolution `champ_manquant`/`date_ambigue`/`doublon_potentiel` (hors périmètre, cf. spec.md « Ce qui n'est PAS en cause »).
