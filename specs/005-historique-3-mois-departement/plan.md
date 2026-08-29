# Implementation Plan: Collecte historique sécurisée et la plus profonde possible par département

**Branch**: `005-historique-3-mois-departement` | **Date**: 2026-08-29 (révisé) | **Spec**: `specs/005-historique-3-mois-departement/spec.md`

**Input**: Feature specification from `specs/005-historique-3-mois-departement/spec.md`

## Summary

Trois volets. (1) Généraliser la capacité du moteur `page_web` à cibler un mois arbitrairement passé (pas seulement M-1/M-2) — extension du contrat `Connecteur.collecter()`, rétrocompatible. (2) Un audit de volume statique (présence de `page_detail`) puis échantillonné (pour les 18 connecteurs `page_detail`) qui décide, connecteur par connecteur, d'une profondeur cible entre 3 mois (plancher garanti) et 3 ans (cible par défaut pour les 77 connecteurs sans `page_detail`, dont le coût par mois est fixe). (3) Un script d'orchestration qui exécute cette campagne de façon strictement séquentielle par groupe d'hébergement, échelonnée sur plusieurs jours si nécessaire, avec un circuit-breaker par file et un mécanisme de checkpoint permettant d'interrompre et de reprendre sans jamais resolliciter un couple (connecteur, mois) déjà traité avec succès.

## Technical Context

**Language/Version**: TypeScript (Node.js ≥20, ES modules) — identique à l'existant.

**Primary Dependencies**: Aucune nouvelle dépendance de production (Principe 5). Le séquencement/espacement/circuit-breaker/checkpoint sont une logique de contrôle simple (compteurs, délais, un fichier d'état JSON local), implémentable sans bibliothèque tierce.

**Storage**: Aucun nouveau fichier de données *applicatif*. Réutilisation stricte de `events/<code>.json`, `executions.json`, `anomalies.json`, `connecteurs.json` via `runner.ts` inchangé. Un seul artefact nouveau, strictement opérationnel et hors modèle de données applicatif (spec.md, Key Entities) : un fichier d'état de campagne (checkpoint), lu/écrit uniquement par le script d'orchestration, jamais par l'API ni le frontend.

**Testing**: Vitest côté backend. Tests unitaires pour la résolution de mois cible arbitraire (US1), pour la classification statique + l'estimation par échantillon (US2), et pour le séquencement/groupement/circuit-breaker/checkpoint (US3) — hébergeurs et échecs réseau simulés, aucun test contre les sites réels dans la suite automatisée (cohérent avec la séparation déjà existante de `test:live-drift`, elle-même source des deux incidents documentés).

**Target Platform**: Exécution en ligne de commande (Node.js), déclenchée manuellement par un opérateur — pas un endpoint HTTP exposé publiquement (à la différence de `POST /admin/connecteurs/{id}/collecter`, conservé inchangé pour un connecteur isolé, mais non adapté à l'orchestration de 96 connecteurs × jusqu'à 36 mois avec throttling, audit de volume et reprise).

**Project Type**: Web application (`backend/` + `frontend/`), déjà en place — nouvelle catégorie de fichier au backend : `backend/src/scripts/` (voir Complexity Tracking).

**Performance Goals**: Objectif inversé par rapport à l'habituel — délibérément lent et séquentiel. Le chiffrage exact (espacement entre requêtes, taille des lots par jour, seuil du circuit-breaker, seuil de volume « raisonnable » pour étendre un connecteur `page_detail` au-delà de 3 mois) est déterminé à l'implémentation, informé par les incidents déjà documentés dans le journal du projet (blocage déclenché par une rafale concurrente le 2026-08-28, puis aggravé par un second run enchaîné sans délai le même jour ; blocage similaire le 2026-08-19/20, levé après ~1 jour) : ces précédents bornent empiriquement ce qu'il faut éviter (concurrence, enchaînement rapproché de runs complets), plus que la valeur exacte de l'espacement lui-même.

**Constraints**: Ne modifier aucune des 96 configurations déclaratives existantes (FR-001) ; ne modifier ni `dedupe.ts` ni `evaluerCandidat` (FR-003) ; ne jamais faire dépendre `scheduler.ts` de ce mécanisme (FR-019) ; comportement par défaut de `collecter()` (sans mois cible) strictement identique à l'existant (FR-002) ; ne jamais reprendre automatiquement après une interruption (FR-016) ; ne jamais compter une anomalie « page introuvable » (archives limitées) dans le seuil du circuit-breaker (FR-004, FR-014).

**Scale/Scope**: 96 connecteurs, dont 95 concernés par le ciblage temporel (1 exclu, `prefecture-13`). Parmi eux, 77 sans `page_detail` visent 3 ans (jusqu'à 36 mois × 77 ≈ 2 772 exécutions historiques potentielles, bornées en pratique par la limite réelle des archives de chaque site) et 18 avec `page_detail` visent un plancher de 3 mois (18 × 2 mois manquants = 36 exécutions), étendu au cas par cas selon l'audit de volume.

## Constitution Check

*GATE: doit passer avant toute implémentation.*

- **Principe 5 (pas de dépendance externe superflue)** : respecté — séquencement, délais, circuit-breaker et checkpoint sont une logique de contrôle simple, sans bibliothèque de file d'attente tierce.
- **Principe 6 (rigueur temporelle)** : respecté — le mois cible, quelle que soit sa profondeur, est résolu en Europe/Paris via `parisAnneeMoisCourant`, invoqué avec une date de référence décalée plutôt que `new Date()`.
- **Contrat connecteur (`connecteur-interface.md` §5), règle 8** (pas d'année/mois codé en dur en configuration) : respectée — aucune config modifiée ; le ciblage passe exclusivement par le paramètre d'exécution de `collecter()`.
- **Contrat connecteur, règle 1** (aucun effet de bord/lecture de stockage dans un moteur) : respectée — le moteur reste une fonction de résolution/extraction pure ; le paramètre de mois cible est une entrée, pas un accès à un état externe.
- **Contrat connecteur, règle 6** (isolation des erreurs) : respectée et précisée — le circuit-breaker (FR-014) opère au niveau de l'orchestration (le script), jamais dans `runner.ts`/`executerConnecteur`, qui continue d'isoler chaque connecteur indépendamment.
- **Point d'attention nouveau (revue du 2026-08-29)** : le mécanisme de checkpoint (FR-015) introduit un état persistant en dehors du modèle de données applicatif habituel (`data/loader.ts`). Confiné délibérément au script d'orchestration (Key Entities de spec.md) pour ne pas alourdir un contrat de données stable (`ExecutionCollecte`) pour un besoin de campagne ponctuel — voir Complexity Tracking.
- Aucune violation bloquante — deux entrées en Complexity Tracking (extension du contrat `collecter()`, nouveau répertoire `scripts/` + état de checkpoint hors modèle applicatif).

## Project Structure

### Documentation (this feature)

```text
specs/005-historique-3-mois-departement/
├── spec.md    # Spécification (révisée le 2026-08-29 : profondeur adaptative, audit de volume, reprise)
├── plan.md    # Ce fichier
└── tasks.md   # Détail des tâches
```

Pas de `research.md`/`data-model.md` dédiés : inconnues techniques déjà levées (lecture complète de `moteur.ts`, `runner.ts`, `dedupe.ts`, `registry.ts`, `types.ts`, `parisDate.ts`, `config.schema.ts` — comptage réel des 18 connecteurs `page_detail` sur les 96 configs — et analyse DNS réelle du 2026-08-29). Le contrat `connecteur-interface.md` (feature 002) est mis à jour en place.

### Source Code (repository root)

```text
backend/
├── src/
│   ├── services/parisDate.ts                    # Utilitaire : mois cible décalé de N mois avant une référence (franchissement d'année, N arbitraire)
│   ├── connecteurs/
│   │   ├── types.ts                              # Connecteur.collecter(cible?) — paramètre optionnel, rétrocompatible
│   │   ├── moteurs/pageWeb/moteur.ts             # resoudreNavigation/resoudreMotifEtape/substituerPlaceholdersDate acceptent la référence temporelle cible
│   │   ├── runner.ts                             # executerConnecteur(connecteur, declenchement, cible?) ; declenchement 'backfill' ajouté
│   │   ├── hebergement.ts                        # NOUVEAU : connecteur → groupe d'hébergement (mutualisé / Moselle / Île-de-France)
│   │   └── volumetrie.ts                         # NOUVEAU : classification page_detail (statique) + estimation par échantillon → profondeur cible par connecteur
│   ├── models/executionCollecte.ts               # DeclenchementSchema : ajout de 'backfill'
│   └── scripts/
│       ├── backfill-historique.ts                # NOUVEAU : orchestration (files séquentielles, espacement, circuit-breaker, checkpoint, pilote/complet)
│       └── backfill-checkpoint.json              # NOUVEAU, généré à l'exécution (gitignored) : état de progression par connecteur (dernier mois traité)
└── tests/
    ├── unit/
    │   ├── parisDate.test.ts                     # Franchissement d'année, décalage arbitraire
    │   ├── moteurs/pageWeb/moteur.test.ts         # Résolution contre un mois cible arbitrairement passé ; page introuvable ≠ échec réseau
    │   └── volumetrie.test.ts                     # Classification + décision de profondeur (échantillons simulés)
    └── integration/connecteurs/
        └── backfill-historique.test.ts            # Séquencement, groupement, circuit-breaker, checkpoint/reprise, non-duplication (simulé, sans réseau réel)

specs/002-connecteur-collecte-prefecture/contracts/
└── connecteur-interface.md                        # Mise à jour : paramètre optionnel de collecter(), nouvelle valeur de déclenchement
```

**Structure Decision**: Web application déjà en place. Deux ajouts à `backend/src/` : `scripts/` (opérationnel, absent jusqu'ici) et deux nouveaux modules de logique pure (`hebergement.ts`, `volumetrie.ts`) suivant la convention déjà en place (`dedupe.ts` à côté de `runner.ts`).

## Complexity Tracking

| Violation | Pourquoi nécessaire | Alternative plus simple rejetée |
|---|---|---|
| Extension du contrat `Connecteur.collecter()` (paramètre optionnel de mois cible) | Sans ce paramètre, aucune résolution de mois passé n'est possible sans dupliquer les configurations déclaratives (interdit par FR-001 et par la règle 8 du contrat) | Dupliquer chaque configuration YAML en variantes « mois codé en dur » : rejeté, violerait la règle 8 et multiplierait les fichiers pour un usage ponctuel |
| Nouveau répertoire `backend/src/scripts/`, absent du dépôt jusqu'ici | Outil opérationnel déclenché explicitement par un humain, à risque production réel (blocages IP déjà documentés) — à traiter hors du chemin HTTP habituel | Route admin HTTP (`POST /admin/backfill`) : rejetée — ajouterait une surface d'API pour un usage rare, coderait en dur des choix d'orchestration dans un contrat versionné pour rien |
| État de checkpoint hors modèle de données applicatif (fichier local au script, pas une entité `data/loader.ts`) | La reprise multi-jours (FR-015) exige un suivi de progression persistant, mais l'ajouter à `ExecutionCollecte` (schéma stable, utilisé par l'admin/la journalisation) pour un besoin de campagne ponctuel alourdirait un contrat de données au-delà de son usage réel | Ajouter un champ `mois_cible` à `ExecutionCollecte` pour dériver la reprise depuis `executions.json` : rejeté pour cette feature — touche un contrat stable pour un besoin transitoire ; resterait une évolution possible si un besoin d'audit détaillé post-campagne apparaissait |
