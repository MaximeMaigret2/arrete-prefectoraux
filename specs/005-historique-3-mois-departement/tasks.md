# Tasks: Collecte historique sécurisée et la plus profonde possible par département

**Input**: Documents de conception depuis `specs/005-historique-3-mois-departement/`

**Prerequisites**: plan.md, spec.md (révisés le 2026-08-29)

**Tests**: inclus — convention déjà en place depuis la feature 001.

**Organization**: 3 user stories, toutes P1, dépendance stricte US1 → US2 → US3 (chacune indépendamment testable, cf. spec.md « Independent Test »).

## Format: `[ID] [P?] [US#] Description`

## Phase 1: Setup

- [x] T001 Créer le répertoire `backend/src/scripts/` et l'ajouter au `.gitignore` pour son futur fichier d'état (`backfill-checkpoint.json` — généré à l'exécution, jamais commité) ; vérifier la couverture `tsc`/ESLint existante sans ajustement de périmètre nécessaire.

## Phase 2: Foundational

Aucune tâche fondationnelle bloquante distincte de T004 (US1) : l'utilitaire de calcul de mois cible est un prérequis direct de l'US1, pas une fondation séparée.

## Phase 3: User Story 1 - Le moteur peut collecter un mois cible arbitrairement passé (Priority: P1) 🎯 MVP technique

**Goal**: `collecter()` accepte un mois cible optionnel et arbitrairement éloigné, résout `navigation` en conséquence, distingue « page introuvable » (archives limitées) d'un échec réseau, sans régression du comportement par défaut.

**Independent Test**: cf. spec.md, US1.

### Tests for User Story 1

- [x] T002 [P] [US1] `backend/tests/unit/parisDate.test.ts` : décalage simple, décalage arbitraire (ex. -30 mois), franchissement d'une ou plusieurs frontières d'année, décalage nul (retourne le mois courant).
- [x] T003 [P] [US1] `backend/tests/unit/moteurs/pageWeb/moteur.test.ts` : `collecter(cible)` avec un mois arbitrairement passé (navigation à motif, à `periodes`) ; cas `prefecture-13`-like (sans `navigation`, sans effet) ; appel sans mois cible produit exactement les mêmes URLs qu'avant cette feature (FR-002) ; une page cible absente (fixture 404) produit une anomalie de lecture ordinaire, distincte d'une erreur réseau (fixture socket fermé) — assertion explicite sur la distinction des deux (FR-004).

### Implementation for User Story 1

- [x] T004 [US1] `backend/src/services/parisDate.ts` : utilitaire de calcul d'un mois cible décalé de N mois (N arbitraire) avant une date de référence (Europe/Paris), gérant le franchissement d'année. Aucune modification des fonctions existantes.
- [x] T005 [US1] `backend/src/connecteurs/moteurs/pageWeb/moteur.ts` : `resoudreMotifEtape`, `substituerPlaceholdersDate`, `resoudreNavigation` acceptent la référence temporelle cible au lieu de la calculer en dur — dépend de T004.
- [x] T006 [US1] `backend/src/connecteurs/moteurs/pageWeb/moteur.ts` : distinguer explicitement, dans le traitement des échecs de résolution de `navigation`, une page introuvable (statut HTTP de type 404, ou équivalent propre) d'un échec réseau bas niveau — porté jusqu'à `ResultatCollecte` de façon exploitable par le runner (FR-004).
- [x] T007 [US1] `backend/src/connecteurs/types.ts` : étendre `Connecteur.collecter()` avec un paramètre optionnel de mois cible (`{ annee: string; moisNumero: string } | undefined`) — dépend de T005.
- [x] T008 [US1] `backend/src/connecteurs/moteurs/pageWeb/moteur.ts`, `creerConnecteur` : `collecter(cible)` transmet la cible si fournie, sinon comportement inchangé — dépend de T006, T007.
- [x] T009 [US1] `specs/002-connecteur-collecte-prefecture/contracts/connecteur-interface.md` : documenter le nouveau paramètre optionnel de `collecter()`, son comportement par défaut, et la distinction page-introuvable/échec-réseau.

**Checkpoint**: un connecteur à `navigation` peut être collecté pour un mois passé arbitraire, en isolation, sans changement de comportement par défaut, avec une distinction fiable entre « archives épuisées » et « échec réseau ».

## Phase 4: User Story 2 - Décider objectivement de la profondeur atteignable par connecteur (Priority: P1)

**Goal**: chaque connecteur à `navigation` se voit attribuer une profondeur cible (3 mois à 3 ans) fondée sur son coût réel, consultable avant tout lancement à grande échelle.

**Independent Test**: cf. spec.md, US2.

### Tests for User Story 2

- [x] T010 [P] [US2] `backend/tests/unit/volumetrie.test.ts` : classification statique correcte des 96 configs réelles (77 sans `page_detail` → cible 3 ans ; 18 avec `page_detail` → plancher 3 mois ; `prefecture-13` → hors périmètre) ; pour un connecteur `page_detail` simulé avec un échantillon à fort volume, la profondeur décidée reste au plancher de 3 mois ; pour un échantillon à faible volume, elle peut être étendue.

### Implementation for User Story 2

- [x] T011 [US2] `backend/src/connecteurs/volumetrie.ts` (nouveau) : classification statique (lecture de la présence de `page_detail` dans chaque config, réutilisant la lecture déjà faite par `registry.ts`) ; pour les connecteurs `page_detail`, estimation par échantillon (nombre de publications sur les mois déjà atteignables) projetée sur une profondeur candidate, comparée à un seuil configurable ; retourne, par connecteur, la profondeur cible retenue (FR-005 à FR-009) — dépend de T007/T008 (US1) pour pouvoir échantillonner via `collecter(cible)`.
- [x] T012 [US2] `backend/src/scripts/backfill-historique.ts` (créé ici, complété en Phase 5) : sous-commande ou option dédiée affichant, pour chaque connecteur, la profondeur cible retenue par `volumetrie.ts` — consultable avant tout lancement réel (FR-008).

**Checkpoint**: la profondeur cible de chacun des 95 connecteurs concernés est connue et consultable avant tout lancement à grande échelle, sans avoir exécuté la moindre collecte historique réelle.

## Phase 5: User Story 3 - Collecte historique sécurisée, échelonnée et reprise sans perte (Priority: P1)

**Goal**: un opérateur peut lancer, en pilote puis en périmètre complet, la collecte jusqu'à la profondeur cible de chaque connecteur, de façon séquentielle par groupe d'hébergement, échelonnée sur plusieurs jours si nécessaire, avec circuit-breaker et reprise sans perte.

**Independent Test**: cf. spec.md, US3.

### Tests for User Story 3

- [x] T013 [P] [US3] `backend/tests/unit/hebergement.test.ts` : classification correcte des 94 connecteurs de l'IP mutualisée, Moselle et Île-de-France en groupes distincts (données figées, pas de résolution DNS réelle dans les tests).
- [x] T014 [P] [US3] `backend/tests/integration/connecteurs/backfill-historique.test.ts` (connecteurs/hébergeurs simulés, aucun réseau réel) : (a) séquentialité et espacement minimum au sein d'un groupe ; (b) le circuit-breaker interrompt uniquement la file concernée après le seuil d'échecs réseau bas niveau consécutifs, sans affecter les autres files, et n'est jamais déclenché par une anomalie « page introuvable » (FR-004/FR-014) ; (c) après une interruption (simulée : arrêt volontaire puis circuit-breaker), une reprise ne resollicite aucun couple (connecteur, mois) déjà marqué traité avec succès dans le checkpoint ; (d) relancer un couple déjà traité (resollicitation volontaire) ne produit aucun événement dupliqué (réutilisation réelle de `dedupe.ts`) ; (e) un pilote restreint à un sous-ensemble explicite ne touche que ce sous-ensemble.

### Implementation for User Story 3

- [x] T015 [US3] `backend/src/connecteurs/hebergement.ts` (nouveau) : correspondance statique et datée connecteur → groupe d'hébergement, dérivée de l'analyse DNS du 2026-08-29 (94 → « mutualisé », `prefecture-57` → groupe dédié, `prefecture-75` → groupe dédié) ; commentaire indiquant la nécessité de revérifier si l'hébergement change.
- [x] T016 [US3] `backend/src/models/executionCollecte.ts` : ajouter `'backfill'` à `DeclenchementSchema` ; répercuter dans `specs/001-carte-arretes-rave-teknival/contracts/openapi.yaml` et tout schéma admin référençant cette énumération.
- [x] T017 [US3] `backend/src/connecteurs/runner.ts` : `executerConnecteur` accepte un paramètre optionnel de mois cible, transmis à `connecteur.collecter(cible)` — dépend de T007, T016.
- [x] T018 [US3] `backend/src/scripts/backfill-historique.ts` : format et gestion du fichier de checkpoint (lecture au démarrage, écriture après chaque couple connecteur/mois traité avec succès, jamais après un échec) — dépend de T001.
- [x] T019 [US3] `backend/src/scripts/backfill-historique.ts` : orchestration complète — énumère les connecteurs actifs à `navigation` via `chargerConnecteursActifs()` (exclut `prefecture-13`), applique la profondeur cible de `volumetrie.ts` (US2), regroupe via `hebergement.ts`, exécute chaque file séquentiellement avec espacement minimum, applique le circuit-breaker par file (interruption + arrêt propre, jamais de reprise automatique), consulte/écrit le checkpoint (T018) pour ignorer les couples déjà faits au démarrage, accepte une option de pilote et une option de périmètre complet — dépend de T011, T015, T017, T018.
- [x] T020 [US3] `backend/package.json` : script npm dédié (ex. `backfill:historique`) pour invoquer T019 avec ses options (audit seul / pilote / complet / reprise), documenté en commentaire dans le fichier lui-même.
- [x] T021 [US3] Vérification de non-régression : `npx tsc -p backend/tsconfig.json --noEmit`, suite `tests/unit` + `tests/contract` + `tests/integration` backend complète (hors `test:live-drift`) — 0 erreur, 0 régression sur les tests existants de `runner.ts`/`moteur.ts` qui n'utilisent pas de mois cible.

**Checkpoint**: la collecte historique peut être lancée en pilote, interrompue, reprise sans perte, puis étendue au périmètre complet, sans jamais dépasser le débit de requêtes jugé sûr ni resolliciter un couple déjà traité.

## Phase 6: Exécution réelle (hors code, opérationnel)

Cette phase n'est pas du développement mais l'exécution du mécanisme livré par les phases précédentes.

- [ ] T022 Lancer l'audit de volume seul (T012) sur les 95 connecteurs concernés et faire valider par l'opérateur les profondeurs cibles retenues avant tout lancement réel.
- [ ] T023 Lancer le pilote (T019, option pilote) sur un petit sous-ensemble représentatif des 3 groupes d'hébergement (mutualisé, Moselle, Île-de-France) et des deux familles de coût (avec/sans `page_detail`) ; vérifier `executions.json`/`anomalies.json` et le checkpoint avant toute extension.
- [ ] T024 Lancer la collecte historique sur le périmètre complet (95 connecteurs), échelonnée sur plusieurs jours selon le chiffrage retenu à l'implémentation, en s'appuyant sur la reprise (T018) entre chaque session ; surveiller l'absence de rafale d'anomalies réseau bas niveau corrélées (SC-005) entre chaque lot.
- [ ] T025 Documenter le résultat de l'exécution réelle (profondeur effectivement atteinte par département, nombre d'événements historiques publiés, incidents éventuels et leur résolution) dans `claude/etat-connecteurs.md`.

## Dependencies & Execution Order

- Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3), strictement : `volumetrie.ts` (T011) a besoin de `collecter(cible)` (T007/T008) pour échantillonner ; l'orchestration (T019) a besoin des deux précédentes.
- À l'intérieur de la Phase 3 : T004 → T005 → T006 → T007 → T008 → T009 ; T002/T003 en parallèle de l'implémentation correspondante.
- À l'intérieur de la Phase 5 : T015 et T016 sont indépendants et peuvent être menés en parallèle ; T017 dépend des deux ; T018 est indépendant (peut être écrit en parallèle) mais T019 dépend de T011, T015, T017, T018 ; T020 dépend de T019 ; T013/T014 en parallèle de T015/T019.
- Phase 6 ne démarre qu'après T021 (non-régression complète validée) — jamais d'exécution réelle contre les 96 sites avant que la suite de tests automatisée ne soit intégralement verte. T022 précède T023, qui précède T024.

## Notes

- Aucune tâche de migration de données applicative : les entités persistées (`ExecutionCollecte`, `Evenement`, `AnomalieCollecte`) ne changent pas de forme, seule leur énumération `declenchement` gagne une valeur (T016). Le fichier de checkpoint (T018) est un artefact opérationnel hors modèle applicatif (plan.md, Complexity Tracking).
- Les constantes numériques exactes (espacement entre requêtes, seuil du circuit-breaker, seuil de volume « raisonnable ») sont fixées à l'implémentation de T011/T019, informées par les incidents déjà documentés dans le journal du projet — pas figées dans cette liste de tâches.
