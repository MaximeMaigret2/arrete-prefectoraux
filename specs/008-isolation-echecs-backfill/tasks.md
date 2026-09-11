# Tasks: Isolation des échecs de backfill par connecteur

**Input**: Documents de conception depuis `specs/008-isolation-echecs-backfill/`

**Prerequisites**: plan.md, spec.md (committé, `4f65efd`)

**Tests**: inclus — convention déjà en place depuis la feature 001.

**Organization**: 2 user stories — US1 en P1 (coeur du correctif), US2 en P2 (signal informatif, indépendant techniquement mais livré dans le même lot). US2 dépend de US1 (le point de sortie d'un connecteur du round-robin, modifié par US1, est aussi le point d'accroche du comptage US2).

## Format: `[ID] [P?] [US#] Description`

## Phase 1: Setup

Aucune tâche de setup distincte : aucun nouveau fichier, aucune nouvelle dépendance (plan.md, Principe 5).

## Phase 2: Foundational

Aucune tâche fondationnelle bloquante distincte de T001 (US1) : le renommage de constantes est un prérequis direct de l'US1, pas une fondation séparée.

## Phase 3: User Story 1 - Un connecteur en échec n'empêche plus les autres d'être tentés (Priority: P1) 🎯 MVP

**Goal**: le compteur d'échecs réseau consécutifs passe de la portée groupe à la portée connecteur ; un connecteur qui atteint son seuil est retiré du round-robin de CE run sans jamais interrompre les connecteurs suivants ni retirer ses mois du checkpoint.

**Independent Test**: cf. spec.md, US1.

### Tests for User Story 1

- [ ] T001 [US1] `backend/tests/integration/connecteurs/backfill-historique.test.ts` : réécrire le test `(b)` — avec un seuil par connecteur de 2, conn-a échoue 2 fois consécutives (ses 2 premiers tours) et sort du round-robin, mais conn-b (2e connecteur de la même file mutualisée) continue d'être tenté à chaque tour et obtient un succès ; vérifier que le circuit ne "s'ouvre" plus jamais pour tout le groupe (FR-001, Acceptance Scenario 1).
- [ ] T002 [P] [US1] Même fichier : nouveau test — un connecteur qui a atteint son seuil garde ses mois restants dans le checkpoint (non retirés), éligibles à une reprise ultérieure (FR-003, Acceptance Scenario 2 ; réutilise le patron du test `(c)` existant pour la reprise).
- [ ] T003 [P] [US1] Même fichier : nouveau test — un connecteur qui alterne échec réseau puis succès (jamais deux échecs consécutifs) n'est jamais retiré du round-robin, quel que soit le nombre total d'échecs non consécutifs rencontrés (FR-005, Acceptance Scenario 3).
- [ ] T004 [P] [US1] Même fichier : réécrire le test `(b bis)` — une page introuvable (`causeReseauSiEchec: false`) ne compte toujours pas dans le seuil par connecteur et n'affecte toujours pas les connecteurs suivants (FR-004, Acceptance Scenario 4 ; comportement déjà correct aujourd'hui, non-régression).
- [ ] T005 [P] [US1] Même fichier : nouveau test — un groupe à un seul connecteur (Moselle) qui dépasse le seuil se comporte comme avant (aucun autre connecteur à préserver) — non-régression explicite de l'Acceptance Scenario 5.
- [ ] T006 [P] [US1] Même fichier : nouveau test — le rapport de fin de run porte, pour un connecteur interrompu par ce mécanisme, une entrée `connecteursInterrompus` avec son identifiant, le nombre de mois qu'il n'a pas pu tenter, et la raison (FR-006, SC-004).
- [ ] T007 [P] [US1] Même fichier : nouveau test — un run où *tous* les connecteurs d'un groupe échouent au-delà du seuil se termine proprement (pas de boucle infinie, rapport `moisReussis: 0`, une entrée `connecteursInterrompus` par connecteur) — edge case dédié du spec.
- [ ] T008 [P] [US1] Même fichier : vérifier (test déjà existant ou nouveau bref) qu'un mois `incertain` (feature 007) continue à ne compter ni dans le nouveau seuil par connecteur ni comme un succès — non-régression explicite (edge case dédié du spec ; les tests `(f)`, `(f bis)`, `(f ter)` existants couvrent déjà ce point et doivent continuer de passer sans modification).

### Implementation for User Story 1

- [ ] T009 [US1] `backend/src/scripts/backfill-historique.ts` : renommer `SEUIL_CIRCUIT_BREAKER_DEFAUT`/`BACKFILL_SEUIL_CIRCUIT` en `SEUIL_ECHECS_CONNECTEUR_DEFAUT`/`BACKFILL_SEUIL_CONNECTEUR`, défaut `3` (FR-002) ; renommer `OptionsBackfill.seuilCircuitBreaker` en `seuilEchecsConnecteur`.
- [ ] T010 [US1] Même fichier : nouveau type exporté `ConnecteurInterrompu { connecteurId: string; moisRestants: number; raison: 'echecs_reseau_consecutifs' }` ; `RapportGroupe` : retirer `circuitOuvert`, ajouter `connecteursInterrompus: ConnecteurInterrompu[]` (FR-006) — dépend de T009.
- [ ] T011 [US1] Même fichier : interface locale `FileConnecteur` — ajouter `echecsConsecutifs: number` (init `0`) ; construction de `filesActives` initialise ce champ pour chaque connecteur actif — dépend de T009.
- [ ] T012 [US1] Même fichier : remplacer la variable `echecsReseauConsecutifs` (portée groupe) par `file.echecsConsecutifs` (portée connecteur) dans la branche d'échec réseau — incrémenté/réinitialisé exactement comme avant mais sur le connecteur courant — dépend de T011.
- [ ] T013 [US1] Même fichier : quand `file.echecsConsecutifs >= seuilEchecsConnecteur` — supprimer le `break tourBoucle` ; à la place, pousser une entrée dans `rapportGroupe.connecteursInterrompus` (`moisRestants` = `etat.moisRestants.length` au moment de l'interruption) et vider `file.cibles` (retrait du round-robin au prochain nettoyage de tour, même patron que `archivesEpuisees`) ; le `for` sur `filesActives` continue vers le connecteur suivant (FR-001) — dépend de T010, T012.
- [ ] T014 [US1] Même fichier : branche succès — réinitialiser `file.echecsConsecutifs = 0` (portée simplement changée, comportement inchangé) — dépend de T012.
- [ ] T015 [US1] `backend/src/scripts/backfill-historique.ts` (fonction `main`/CLI) : vérifier que le nom d'option renommé (T009) est bien répercuté partout où `seuilCircuitBreaker` était référencé (aucune référence CLI directe attendue — `main()` n'expose pas cette option en argument aujourd'hui, à confirmer en relisant `analyserArguments`) — dépend de T009.

**Checkpoint**: l'échec d'un connecteur n'interrompt plus jamais les autres connecteurs du même groupe dans le même run ; ses mois restent éligibles à une reprise ; le rapport détaille chaque interruption par connecteur.

## Phase 4: User Story 2 - Visibilité sur une dégradation généralisée, sans jamais bloquer la campagne (Priority: P2)

**Goal**: le rapport de fin de run signale, à titre uniquement informatif, qu'un nombre configurable de connecteurs consécutifs ont totalement échoué sans aucun succès interposé — sans jamais modifier le comportement du script.

**Independent Test**: cf. spec.md, US2.

### Tests for User Story 2

- [ ] T016 [P] [US2] `backend/tests/integration/connecteurs/backfill-historique.test.ts` : nouveau test — avec un seuil de dégradation de 2, deux connecteurs consécutifs échouent entièrement (0 succès chacun) sans aucun succès interposé → `rapportGroupe.degradationGeneraliseeDetectee` vaut `true`, et le traitement d'un 3e connecteur sain du même groupe a bien eu lieu normalement (FR-007, Acceptance Scenario 1 et 2).
- [ ] T017 [P] [US2] Même fichier : nouveau test — un connecteur en échec total suivi d'un connecteur avec au moins un succès puis d'un autre connecteur en échec total (jamais deux échecs totaux consécutifs sans succès interposé) → `degradationGeneraliseeDetectee` reste `false`, quel que soit le nombre total de connecteurs en échec sur le run (le compteur se réinitialise à chaque succès interposé).

### Implementation for User Story 2

- [ ] T018 [US2] `backend/src/scripts/backfill-historique.ts` : nouvelle constante `SEUIL_DEGRADATION_GENERALISEE_DEFAUT` (env `BACKFILL_SEUIL_DEGRADATION`, défaut `8`) ; nouveau champ optionnel `OptionsBackfill.seuilDegradationGeneralisee`.
- [ ] T019 [US2] Même fichier : `FileConnecteur` — ajouter `aEuUnSucces: boolean` (init `false`) ; positionné à `true` dans la branche succès (à côté de T014) — dépend de T011, T014.
- [ ] T020 [US2] Même fichier : `RapportGroupe` — ajouter `degradationGeneraliseeDetectee: boolean` (init `false`) — dépend de T010.
- [ ] T021 [US2] Même fichier : au nettoyage de fin de tour (retrait d'un connecteur de `filesActives`, quelle qu'en soit la raison — file épuisée, archives épuisées, ou interrompu par T013), incrémenter un compteur local `connecteursEchecTotalConsecutifs` si `!file.aEuUnSucces`, sinon le réinitialiser à `0` ; dès que ce compteur atteint `seuilDegradationGeneralisee`, fixer `rapportGroupe.degradationGeneraliseeDetectee = true` (jamais réinitialisé une fois vrai) — dépend de T013, T018, T019, T020.

**Checkpoint**: un opérateur voit immédiatement, dans le rapport, si une dégradation généralisée de l'hébergeur est probable — sans que ce signal n'ait jamais modifié la couverture obtenue par le run.

## Phase 5: Non-régression et documentation opérationnelle

- [ ] T022 Vérification de non-régression complète : `npx tsc -p backend/tsconfig.json --noEmit`, suite `backend/tests` complète (unit + intégration, hors `test:live-drift`) — 0 erreur, 0 régression (SC-003). Les tests `(a)`, `(a bis)`, `(a ter)`, `(a quater)`, `(c)`, `(e)`, `(e bis)`, `(f)`, `(f bis)`, `(f ter)`, `(f quater)` existants ne doivent nécessiter aucune modification (ils n'exercent pas la portée du circuit-breaker).
- [ ] T023 `claude/etat-connecteurs.md` : documenter ce changement (nouvelle portée du circuit-breaker, nouvelles variables d'environnement `BACKFILL_SEUIL_CONNECTEUR`/`BACKFILL_SEUIL_DEGRADATION`, suppression de `BACKFILL_SEUIL_CIRCUIT`) avant la prochaine campagne réelle, pour que SC-002 (couverture obtenue) soit mesurable et comparée en connaissance de cause à la campagne du 2026-09-02.

## Dependencies & Execution Order

- Phase 3 (US1) → Phase 4 (US2) : US2 s'accroche au même point de sortie du round-robin que celui modifié par T013 (US1).
- À l'intérieur de la Phase 3 : T009 → T010/T011 (parallèles) → T012 → T013 → T014/T015 (parallèles). T001-T008 (tests) en parallèle de l'implémentation correspondante, à faire passer au vert une fois T009-T015 posées.
- À l'intérieur de la Phase 4 : T018/T019/T020 indépendants (peuvent être menés en parallèle) → T021 dépend des trois et de T013. T016/T017 (tests) en parallèle de l'implémentation correspondante.
- Phase 5 ne démarre qu'après T021.

## Notes

- Aucune tâche de migration de données : `backfill-checkpoint.json` (feature 005) n'est ni lu ni écrit différemment par cette feature — seule la logique en mémoire qui décide quels couples (connecteur, mois) retenter dans le run courant change.
- `BACKFILL_SEUIL_CIRCUIT` (ancienne variable d'environnement) cesse d'avoir effet après cette feature — un opérateur qui la positionnait encore dans son environnement ne verra plus aucun effet ; à mentionner dans T023 si un script ou une doc opérationnelle la référence encore (aucune référence trouvée en dehors de `backfill-historique.ts` lui-même au moment de ce plan).
- Aucune modification de `hebergement.ts`, `volumetrie.ts`, `runner.ts`, ni d'aucun moteur de connecteur (hors périmètre, cf. spec.md Assumptions).
