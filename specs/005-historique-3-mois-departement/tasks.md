# Tasks: Collecte historique sécurisée des 3 derniers mois par département

**Input**: Documents de conception depuis `specs/005-historique-3-mois-departement/`

**Prerequisites**: plan.md, spec.md

**Tests**: inclus — convention déjà en place depuis la feature 001.

**Organization**: 2 user stories, toutes deux P1 ; US2 dépend fonctionnellement de US1 (la capacité de ciblage de mois doit exister avant que l'orchestration puisse l'utiliser) mais chacune reste indépendamment testable (cf. spec.md, sections « Independent Test »).

## Format: `[ID] [P?] [US#] Description`

## Phase 1: Setup

Aucune nouvelle dépendance de production (plan.md, Primary Dependencies). Seule préparation nécessaire :

- [ ] T001 Créer le répertoire `backend/src/scripts/` (premier fichier de ce type dans le dépôt, plan.md Project Structure) et vérifier qu'il est bien couvert par la config `tsc`/ESLint existante (`tsconfig.json`, `.eslintrc`) sans ajustement de périmètre nécessaire.

## Phase 2: Foundational

Aucune tâche fondationnelle bloquante distincte des tâches de l'US1 : l'utilitaire de calcul de mois cible (T003) est un prérequis direct de l'US1 elle-même, pas une fondation séparée.

## Phase 3: User Story 1 - Le moteur peut collecter un mois cible passé (Priority: P1) 🎯 MVP technique

**Goal**: `collecter()` accepte un mois cible optionnel et résout `navigation` en conséquence, sans aucune régression du comportement par défaut ni modification des configurations déclaratives.

**Independent Test**: cf. spec.md, US1.

### Tests for User Story 1

- [ ] T002 [P] [US1] `backend/tests/unit/parisDate.test.ts` : ajouter les cas pour le nouvel utilitaire de mois cible — décalage simple dans la même année, franchissement de fin d'année (ex. courant = janvier, décalage -2 → novembre de l'année précédente), décalage nul (retourne le mois courant).
- [ ] T003 [P] [US1] `backend/tests/unit/moteurs/pageWeb/moteur.test.ts` (ou fichier équivalent déjà existant pour ce moteur) : ajouter des cas où `collecter()` est appelé avec un mois cible passé — navigation à motif `{annee}`/`{mois_numero}`, navigation à `periodes`, et le cas `prefecture-13`-like (sans `navigation`, le paramètre est sans effet) ; vérifier qu'un appel sans mois cible produit exactement les mêmes URLs résolues qu'avant cette feature (non-régression explicite, FR-002).

### Implementation for User Story 1

- [ ] T004 [US1] `backend/src/services/parisDate.ts` : ajouter l'utilitaire de calcul d'un mois cible décalé de N mois avant une date de référence (Europe/Paris), gérant le franchissement d'année. Aucune modification des fonctions existantes.
- [ ] T005 [US1] `backend/src/connecteurs/moteurs/pageWeb/moteur.ts` : `resoudreMotifEtape`, `substituerPlaceholdersDate` et `resoudreNavigation` acceptent la référence temporelle à utiliser (mois cible ou, par défaut, le comportement actuel `new Date()`) au lieu de la calculer elles-mêmes en dur — dépend de T004.
- [ ] T006 [US1] `backend/src/connecteurs/types.ts` : étendre `Connecteur.collecter()` avec un paramètre optionnel de mois cible (type explicite, ex. `{ annee: string; moisNumero: string } | undefined`) — dépend de T005.
- [ ] T007 [US1] `backend/src/connecteurs/moteurs/pageWeb/moteur.ts`, fonction `creerConnecteur` : `collecter(cible)` transmet la cible à `resoudreNavigation` si fournie, sinon comportement inchangé — dépend de T006.
- [ ] T008 [US1] `specs/002-connecteur-collecte-prefecture/contracts/connecteur-interface.md` : documenter le nouveau paramètre optionnel de `collecter()` et son comportement par défaut (rétrocompatibilité explicite).

**Checkpoint**: un connecteur à `navigation` peut être collecté pour un mois passé arbitraire, en isolation (tests unitaires, aucun réseau réel), sans changement de comportement par défaut.

## Phase 4: User Story 2 - Collecte historique sécurisée sur 3 mois, sans blocage IP (Priority: P1)

**Goal**: un opérateur peut lancer, en pilote puis en périmètre complet, une collecte historique des 2 mois passés manquants sur les 95 connecteurs concernés, de façon séquentielle par groupe d'hébergement, échelonnée, avec circuit breaker.

**Independent Test**: cf. spec.md, US2.

### Tests for User Story 2

- [ ] T009 [P] [US2] `backend/tests/unit/hebergement.test.ts` : la correspondance connecteur → groupe d'hébergement classe correctement les 94 connecteurs de l'IP mutualisée, Moselle et Île-de-France dans des groupes distincts (données figées, pas de résolution DNS réelle dans les tests).
- [ ] T010 [P] [US2] `backend/tests/integration/connecteurs/backfill-historique.test.ts` (connecteurs/hébergeurs simulés, aucun réseau réel) : (a) les requêtes d'un même groupe ne sont jamais concurrentes et respectent l'espacement minimum ; (b) le circuit breaker interrompt le reste d'une file après le seuil d'échecs réseau bas niveau consécutifs configuré, sans affecter les autres files ; (c) relancer la collecte sur un connecteur/mois déjà traité ne produit aucun événement dupliqué (réutilisation réelle de `dedupe.ts`, pas simulée) ; (d) un pilote restreint à un sous-ensemble explicite de connecteurs ne touche que ce sous-ensemble.

### Implementation for User Story 2

- [ ] T011 [US2] `backend/src/connecteurs/hebergement.ts` (nouveau) : correspondance statique et datée connecteur → groupe d'hébergement, dérivée de l'analyse DNS du 2026-08-29 (94 connecteurs → groupe « mutualisé », `prefecture-57` → groupe dédié, `prefecture-75` → groupe dédié) ; commentaire explicite indiquant que cette correspondance doit être revérifiée si un hébergement change.
- [ ] T012 [US2] `backend/src/models/executionCollecte.ts` : ajouter `'backfill'` à `DeclenchementSchema` ; répercuter dans `specs/001-carte-arretes-rave-teknival/contracts/openapi.yaml` et tout schéma admin (`admin-api.yaml`) référençant cette énumération.
- [ ] T013 [US2] `backend/src/connecteurs/runner.ts` : `executerConnecteur` accepte un paramètre optionnel de mois cible, transmis tel quel à `connecteur.collecter(cible)` — aucune autre modification de la logique de persistance/journalisation (dépend de T006, T012).
- [ ] T014 [US2] `backend/src/scripts/backfill-historique.ts` (nouveau) : orchestration — énumère les connecteurs actifs à `navigation` via `chargerConnecteursActifs()` (exclut `prefecture-13`, FR-013), les regroupe via `hebergement.ts`, exécute chaque file séquentiellement avec espacement minimum entre requêtes, applique le circuit breaker par file (FR-009), accepte une option de pilote (sous-ensemble explicite de connecteurs) et une option de périmètre complet — dépend de T011, T013.
- [ ] T015 [US2] `backend/package.json` : ajouter un script npm dédié (ex. `backfill:historique`) pour invoquer T014 avec ses options (pilote vs complet), documenté en commentaire dans le fichier lui-même plutôt que dans un nouveau document (cohérent avec l'absence de README dédié pour les autres scripts opérationnels du dépôt).
- [ ] T016 [US2] Vérification de non-régression : `npx tsc -p backend/tsconfig.json --noEmit`, suite `tests/unit` + `tests/contract` + `tests/integration` backend complète (hors `test:live-drift`) — 0 erreur, 0 régression, y compris sur les tests existants de `runner.ts`/`moteur.ts` qui n'utilisent pas de mois cible.

**Checkpoint**: la collecte historique peut être lancée en pilote sur quelques connecteurs, vérifiée, puis étendue au périmètre complet (96 connecteurs), sans jamais dépasser le débit de requêtes jugé sûr par connecteur/hébergeur.

## Phase 5: Exécution réelle (hors code, opérationnel)

Cette phase n'est pas du développement mais l'exécution du mécanisme livré par les phases précédentes — consignée ici car c'est l'objectif final de la feature (avoir réellement 3 mois d'historique en production), pas une simple capacité inerte.

- [ ] T017 Lancer le pilote (T014, option pilote) sur un petit sous-ensemble de connecteurs représentatif des 3 groupes d'hébergement (mutualisé, Moselle, Île-de-France) ; vérifier `executions.json`/`anomalies.json` avant toute extension.
- [ ] T018 Lancer la collecte historique sur le périmètre complet (95 connecteurs), échelonnée dans le temps selon le chiffrage retenu à l'implémentation (plusieurs lots/jours) ; surveiller l'absence de rafale d'anomalies réseau bas niveau corrélées (SC-004) entre chaque lot.
- [ ] T019 Documenter le résultat de l'exécution réelle (nombre d'événements historiques publiés par département, incidents éventuels et leur résolution) dans `claude/etat-connecteurs.md`, à la suite de la section consacrée à cette feature.

## Dependencies & Execution Order

- Phase 3 (US1) précède intégralement Phase 4 (US2) : l'orchestration (T014) ne peut appeler `collecter(cible)`/`executerConnecteur(..., cible)` qu'une fois T006/T013 livrées.
- À l'intérieur de la Phase 3 : T004 → T005 → T006 → T007 ; T002/T003 (tests) peuvent s'écrire en parallèle de l'implémentation correspondante, avant qu'elle ne les fasse passer au vert (TDD léger, convention déjà en place).
- À l'intérieur de la Phase 4 : T011 et T012 sont indépendants l'un de l'autre et peuvent être menés en parallèle ; T013 dépend des deux (T006 de la phase précédente, T012) ; T014 dépend de T011 et T013 ; T015 dépend de T014 ; T009/T010 (tests) peuvent s'écrire en parallèle de T011/T014.
- Phase 5 ne démarre qu'après T016 (non-régression complète validée) — jamais d'exécution réelle contre les 96 sites avant que la suite de tests automatisée ne soit intégralement verte.

## Notes

- Aucune tâche de migration de données : les entités persistées (`ExecutionCollecte`, `Evenement`, `AnomalieCollecte`) ne changent pas de forme, seule leur énumération `declenchement` gagne une valeur (T012).
- Les constantes numériques exactes (espacement entre requêtes, taille des lots, seuil du circuit breaker) sont fixées au moment de l'implémentation de T014, en cohérence avec plan.md (Performance Goals) — pas figées dans cette liste de tâches.
