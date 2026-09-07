# Implementation Plan: Un échec de téléchargement PDF ne doit plus jamais ressembler à « rien à signaler »

**Branch**: `007-fiabilisation-echec-telechargement-pdf` | **Date**: 2026-09-05 | **Spec**: `specs/007-fiabilisation-echec-telechargement-pdf/spec.md`

**Input**: Feature specification from `specs/007-fiabilisation-echec-telechargement-pdf/spec.md`

## Summary

Quatre volets, strictement dans l'ordre des User Stories du spec (P1 avant P2). (1) Le moteur `page_web` distingue désormais explicitement, pour chaque candidat dont le titre seul n'est pas pertinent, un échec de résolution (PDF ou `page_detail` inaccessible) d'un « non pertinent » réellement vérifié — nouveau champ `ResultatCollecte.candidatsNonResolus`. (2) Une nouvelle valeur d'anomalie (`candidat_non_resolu`) et un nouveau statut d'exécution (`incertain`, prioritaire sur `succes`/`partiel` dès qu'au moins un candidat non résolu existe) rendent ce signal visible sans ambiguïté dans les données persistées. (3) `backfill-historique.ts` ne retire jamais du checkpoint un mois (ni, pour un connecteur `granularite_liste: annuelle`, l'année entière) dont l'exécution comporte un candidat non résolu, et ce signal ne compte jamais dans le seuil du circuit-breaker. (4) Deux nouveaux scripts opérationnels (même famille que `backfill-historique.ts`) permettent de redésigner comme éligibles des mois déjà marqués « traités » avant ce correctif, avec une priorisation objectivable du périmètre à rejouer en premier.

## Technical Context

**Language/Version**: TypeScript (Node.js ≥20, ES modules) — identique à l'existant.

**Primary Dependencies**: Aucune nouvelle dépendance de production (Principe 5). Détection/statut/checkpoint restent de la logique de contrôle simple (compteurs, filtrage de tableaux) sur des structures déjà en place.

**Storage**: Aucun nouveau fichier de données applicatif. Extension de deux schémas existants (`ExecutionCollecteSchema`, `TypeAnomalieSchema`) et du contrat `ResultatCollecte` (déjà étendu deux fois par la feature 005) ; `backfill-checkpoint.json` (feature 005, hors modèle applicatif) reste le même artefact, seule la logique qui le met à jour change. Deux nouveaux scripts CLI, aucune nouvelle route API (cohérent avec le choix déjà fait par la feature 005 de garder l'orchestration hors du chemin HTTP).

**Testing**: Vitest côté backend. Tests unitaires pour la nouvelle branche de détection du moteur `page_web` (US1, les 4 Acceptance Scenarios + les edge cases scan-PDF et page_detail), pour `determinerStatut` (US2, les 4 scénarios), et pour la nouvelle branche de `executerBackfill` (US3, mois/année non retirés, pas de comptage circuit-breaker). Tests unitaires/intégration pour les deux nouveaux scripts (US4), aucun test contre les sites réels dans la suite automatisée (convention déjà établie, `test:live-drift`/réseau réel restent hors CI).

**Target Platform**: Backend Node.js existant. Les deux nouveaux scripts de remédiation (US4) sont des outils CLI opérateur, au même niveau que `backfill-historique.ts` — jamais appelés par le cycle planifié ni par une route API.

**Project Type**: Web application (`backend/` + `frontend/`), déjà en place. Cette feature ne touche QUE `backend/` — aucune donnée ni route nouvelle exposée au frontend (le statut `incertain` et `candidat_non_resolu` sont des artefacts opérationnels, pas des états affichés sur la carte ; la carte continue de résoudre l'état d'un département uniquement depuis `events/<code>.json`, non affecté par cette feature).

**Performance Goals**: Sans objectif de performance propre — le coût par candidat est inchangé (aucune requête réseau supplémentaire, uniquement une classification plus fine d'échecs déjà tentés aujourd'hui). Le rejeu de l'historique (US4) réutilise tel quel l'espacement/circuit-breaker déjà calibrés par la feature 005 (`ESPACEMENT_MINIMUM_MS_DEFAUT`, `SEUIL_CIRCUIT_BREAKER_DEFAUT`) — aucun nouveau chiffrage réseau introduit par cette feature.

**Constraints**: Ne jamais marquer non résolu un candidat dont le titre seul est déjà pertinent (FR-002) ; ne jamais marquer non résolu un candidat dont le PDF a été lu avec succès mais sans mot-clé (FR-003) ni un PDF lu mais sans texte extractible/scan (Edge Case dédié — cas déjà traité, distinct) ; ne jamais faire compter un candidat non résolu dans le seuil du circuit-breaker (FR-013) ; ne jamais modifier `dedupe.ts` ni la mécanique de résolution `champ_manquant`/`date_ambigue`/`doublon_potentiel` (hors périmètre, cf. spec « Ce qui n'est PAS en cause ») ; le rejeu de l'historique (US4) ne doit introduire aucun nouveau mécanisme de prudence réseau, seulement réutiliser ceux de la feature 005.

**Scale/Scope**: 96/96 connecteurs réels concernés par la détection (US1/US2, tous `page_web` avec `selecteur_lien_pdf`), dont 18 également par le volet `page_detail`. 91 connecteurs suivis par le checkpoint de backfill (US3/US4) au 2026-09-05 — le rejeu complet de tout l'historique déjà marqué « traité » avant ce correctif reste, comme pour la feature 005, une décision et un chiffrage laissés à l'opérateur (US4, FR-017), pas un lancement automatique.

## Constitution Check

*GATE: doit passer avant toute implémentation.*

- **Principe 5 (pas de dépendance externe superflue)** : respecté — aucune nouvelle bibliothèque ; nouvelle valeur d'énumération + un tableau optionnel + deux scripts CLI de la même famille que l'existant.
- **Principe 1/Principe 2 (traçabilité, historisation append-only)** : renforcé plutôt que menacé — c'est précisément l'absence de trace d'un candidat non résolu qui a permis au faux succès du Morbihan de passer inaperçu ; `AnomalieCollecte` (déjà append-only) porte désormais aussi ce cas.
- **Contrat connecteur (`connecteur-interface.md`), règle 1** (aucun effet de bord dans un moteur) : respectée — `candidatsNonResolus` reste une donnée retournée par `collecter()`, jamais une écriture directe vers `anomalies.json` (le `runner` reste seul responsable de la persistance, comme aujourd'hui pour `echec_global`).
- **Contrat connecteur, règle 6** (isolation des erreurs) : respectée et précisée — un candidat non résolu reste isolé à l'échelle du candidat (comme aujourd'hui), jamais promu en `echec_global` de tout le connecteur.
- **Contrat connecteur, règle 7** (aucune branche par connecteur) : respectée — la détection s'appuie uniquement sur la présence de `selecteur_lien_pdf`/`page_detail` déjà déclarative, aucune condition sur un `id` de connecteur.
- **Point d'attention (revue de cette feature)** : `StatutExecutionSchema` gagne une 4e valeur (`incertain`) sur un schéma jusqu'ici stable depuis la feature 002 — jugé nécessaire (US2 ne peut pas être satisfait par une simple métadonnée si l'objectif est qu'un opérateur distingue le cas au premier coup d'œil sur `statut`, cf. FR-006) et confiné (seule la fonction `determinerStatut` et les consommateurs explicites du statut sont à revoir — aucun consommateur existant ne fait de correspondance exhaustive non exhaustive sur `StatutExecutionSchema` en dehors de `runner.ts` lui-même, vérifié avant cette décision). Entrée en Complexity Tracking.
- Aucune violation bloquante — une entrée en Complexity Tracking (nouvelle valeur de statut).

## Project Structure

### Documentation (this feature)

```text
specs/007-fiabilisation-echec-telechargement-pdf/
├── spec.md    # Spécification (committée, 1abbbb2)
├── plan.md    # Ce fichier
└── tasks.md   # Détail des tâches (/speckit-tasks)
```

Pas de `research.md`/`data-model.md` dédiés : mêmes raisons que la feature 005 — toutes les inconnues techniques ont été levées par lecture complète du code concerné avant d'écrire ce plan (`types.ts`, `moteurs/pageWeb/moteur.ts`, `moteurs/pdf/moteur.ts`, `runner.ts`, `models/executionCollecte.ts`, `models/anomalieCollecte.ts`, `scripts/backfill-historique.ts`, `data/loader.ts` pour la rétrocompatibilité zod des exécutions déjà persistées). Le contrat `connecteur-interface.md` (feature 002, déjà mis à jour deux fois par la feature 005) est mis à jour en place — pas de nouveau document de contrat.

### Source Code (repository root)

```text
backend/
├── src/
│   ├── connecteurs/
│   │   ├── types.ts                              # ResultatCollecte.candidatsNonResolus?: CandidatNonResolu[] (nouveau type exporté)
│   │   ├── moteurs/pageWeb/moteur.ts             # Détection US1 : échec de résoudreUrlPdfPublication/téléchargement PDF distingué d'un "non pertinent" vérifié ; anneesCouvertes jamais émis si candidatsNonResolus non vide (défense en profondeur FR-011)
│   │   └── runner.ts                             # construireAnomalieNonResolu() (nouveau, parallèle à construireAnomalieEchecLecture) ; determinerStatut() gagne un 4e paramètre et la priorité 'incertain'
│   ├── models/
│   │   ├── executionCollecte.ts                  # StatutExecutionSchema += 'incertain' ; ExecutionCollecteSchema += nombre_candidats_non_resolus (default 0, rétrocompatible pour les exécutions déjà persistées)
│   │   └── anomalieCollecte.ts                   # TypeAnomalieSchema += 'candidat_non_resolu'
│   └── scripts/
│       ├── backfill-historique.ts                # executerBackfill() : 3e branche (nombre_candidats_non_resolus > 0) — jamais retiré du checkpoint, jamais compté dans echecsReseauConsecutifs ; RapportGroupe += moisNonResolus
│       ├── prioriser-remediation.ts              # NOUVEAU (US4, FR-017/FR-009) : lecture seule — classe les connecteurs déjà marqués "traités" par plausibilité (granularite_liste annuelle, exécutions succes à 0 évènement) et liste les candidats non résolus actuels (post-correctif)
│       └── reactiver-mois-checkpoint.ts          # NOUVEAU (US4, FR-014/FR-015) : réinsère dans `moisRestants` du checkpoint les mois cibles d'un périmètre explicite (connecteurs, éventuellement plage de mois) — union avec l'existant, jamais de perte de progression déjà acquise après ce correctif
└── tests/
    ├── unit/
    │   ├── connecteurs/moteurPageWeb.test.ts     # +tests US1 : page_detail/PDF en échec + titre non pertinent → candidatsNonResolus ; titre déjà pertinent + PDF en échec → inchangé (FR-002) ; PDF lu sans mot-clé → non pertinent, pas non résolu (FR-003) ; PDF scan illisible → inchangé, pas non résolu (edge case) ; granularite annuelle + candidat non résolu → pas d'anneesCouvertes
    │   └── runner.test.ts                        # +tests US2 : determinerStatut priorise 'incertain' (les 4 scénarios d'Acceptance de US2, y compris publiés>0 ET non résolu>0) ; construireAnomalieNonResolu
    └── integration/connecteurs/
        ├── backfill-historique.test.ts           # +tests US3 : mois/année non retiré du checkpoint si candidat non résolu ; pas de comptage circuit-breaker ; reprise ultérieure retente normalement
        ├── prioriser-remediation.test.ts         # NOUVEAU (US4) : priorisation sur données de checkpoint/executions/configs synthétiques
        └── reactiver-mois-checkpoint.test.ts     # NOUVEAU (US4) : réinsertion ciblée, jamais de perte de mois déjà en attente, jamais de doublon de mois dans moisRestants

specs/002-connecteur-collecte-prefecture/contracts/
└── connecteur-interface.md                        # Mise à jour : ResultatCollecte.candidatsNonResolus documenté (même section §1 que causeReseau/cible)
```

**Structure Decision**: Aucun nouveau répertoire — les deux nouveaux scripts rejoignent `backend/src/scripts/` (déjà introduit par la feature 005), suivant exactement le même patron (dépendances injectables pour les tests, CLI minimal, jamais appelé par le cycle planifié).

## Complexity Tracking

| Violation | Pourquoi nécessaire | Alternative plus simple rejetée |
|---|---|---|
| `StatutExecutionSchema` gagne une 4e valeur (`incertain`), schéma stable depuis la feature 002 | US2 exige qu'une exécution avec candidat non résolu soit reconnaissable "sans avoir à relire les journaux bruts" (FR-006) et distincte de `succes`/`partiel` même quand des événements ont été publiés (Acceptance Scenario 3) — un champ annexe non reflété dans `statut` obligerait tout consommateur futur à connaître ce champ en plus du statut pour ne pas se tromper | Ajouter seulement `nombre_candidats_non_resolus` sans toucher à l'énumération `statut` : rejeté — une exécution resterait affichée `succes`/`partiel` malgré l'incertitude, exactement le bug qui a permis au faux succès du Morbihan de passer inaperçu deux fois le même jour |
| Deux nouveaux scripts CLI (`prioriser-remediation.ts`, `reactiver-mois-checkpoint.ts`) plutôt qu'une extension de `backfill-historique.ts` | US4 est un besoin ponctuel et distinct (remédiation d'un historique déjà collecté avant un correctif) de l'orchestration normale (collecte en avant) — mélanger les deux dans un seul script à options multiples rendrait `backfill-historique.ts` plus difficile à auditer pour son usage principal, déjà sensible (production réelle, réseau réel) | Ajouter des flags à `backfill-historique.ts` (ex. `--rejouer-avant-correctif`) : rejeté — risquerait une régression sur le chemin de collecte normale pour un besoin transitoire (même logique que le rejet, en feature 005, d'ajouter le checkpoint à `ExecutionCollecte`) |
