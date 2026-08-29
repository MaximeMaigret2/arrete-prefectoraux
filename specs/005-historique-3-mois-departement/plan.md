# Implementation Plan: Collecte historique sécurisée des 3 derniers mois par département

**Branch**: `005-historique-3-mois-departement` | **Date**: 2026-08-29 | **Spec**: `specs/005-historique-3-mois-departement/spec.md`

**Input**: Feature specification from `specs/005-historique-3-mois-departement/spec.md`

## Summary

Deux volets indissociables : (1) donner au moteur `page_web` la capacité de résoudre une `navigation` existante contre un mois cible passé plutôt que le seul mois courant (extension du contrat `Connecteur.collecter()`, rétrocompatible), et (2) un script opérationnel de collecte historique ponctuelle qui, en réutilisant cette capacité et le `runner.ts` existant sans les modifier, exécute pour chaque connecteur à `navigation` (95/96) les 2 mois passés manquants — de façon strictement séquentielle par groupe d'hébergement, échelonnée dans le temps, avec circuit breaker et pilote préalable, afin de ne jamais reproduire les blocages IP déjà documentés (2026-08-19/20, 2026-08-28) sur l'hébergeur mutualisé (`77.159.252.140`, 94/96 connecteurs).

## Technical Context

**Language/Version**: TypeScript (Node.js ≥20, ES modules) — identique à l'existant.

**Primary Dependencies**: Aucune nouvelle dépendance de production. `node-cron` (déjà présent) n'est pas utilisé ici — la collecte historique est un déclenchement explicite, pas planifié (FR-012). Un simple `setTimeout`/boucle asynchrone séquentielle suffit à l'espacement des requêtes (Principe 5 : pas de dépendance externe pour une fonctionnalité aussi simple qu'une file d'attente séquentielle avec délai).

**Storage**: Aucun nouveau fichier de données. Réutilisation stricte de `events/<code>.json`, `executions.json`, `anomalies.json`, `connecteurs.json` — exactement les mêmes qu'une collecte ordinaire, via `runner.ts` inchangé dans sa logique de persistance.

**Testing**: Vitest côté backend. Tests unitaires pour la résolution de mois cible (US1, fixtures HTTP simulées comme les tests existants du moteur `page_web`) ; tests unitaires pour la logique de séquencement/groupement par hébergeur et le circuit breaker (US2, sans réseau réel — hébergeurs simulés). Aucun test contre les sites réels dans la suite automatisée (cohérent avec `test:live-drift`, déjà séparé et déjà source des deux incidents documentés).

**Target Platform**: Exécution en ligne de commande (Node.js), déclenchée manuellement par un opérateur depuis le poste où tourne le backend — pas un endpoint HTTP exposé publiquement (à la différence de `POST /admin/connecteurs/{id}/collecter`, FR-014 feature 002, conservé inchangé et réutilisable pour un connecteur isolé si besoin, mais non adapté à l'orchestration de 96 connecteurs × 2 mois avec throttling).

**Project Type**: Web application (`backend/` + `frontend/`), déjà en place — cette feature ajoute une nouvelle catégorie de fichier au backend : un script opérationnel (`backend/scripts/`), absente jusqu'ici du dépôt (voir Complexity Tracking).

**Performance Goals**: Non applicable au sens habituel (latence utilisateur) — l'objectif de performance ici est inversé : DÉLIBÉRÉMENT lent et séquentiel, pour ne jamais dépasser un débit de requêtes jugé sûr vis-à-vis de l'hébergeur mutualisé. Le chiffrage exact (délai entre requêtes, nombre de connecteurs par lot/jour) est déterminé lors de l'implémentation, en cohérence avec les seuils qui ont déclenché les incidents déjà documentés (rafale concurrente lors d'un run `vitest` sans `fileParallelism: false`, puis un second run enchaîné sans délai).

**Constraints**: Ne modifier aucune des 96 configurations déclarative existantes (`backend/src/connecteurs/configs/*.yaml`, spec.md FR-001) ; ne modifier ni `dedupe.ts` ni la logique d'`evaluerCandidat` (FR-003) ; ne jamais faire dépendre le cycle planifié quotidien (`scheduler.ts`) de ce mécanisme (FR-012) ; le comportement par défaut de `collecter()` (sans mois cible) doit rester bit-à-bit identique à l'existant (FR-002, non-régression).

**Scale/Scope**: 96 connecteurs, dont 95 concernés (1 exclu, `prefecture-13`) × 2 mois cibles passés = jusqu'à 190 exécutions de collecte historique au total, étalées dans le temps.

## Constitution Check

*GATE: doit passer avant toute implémentation.*

- **Principe 5 (pas de dépendance externe superflue)** : respecté — le séquencement/espacement/circuit breaker sont une logique de contrôle simple (compteurs, délais), implémentable sans bibliothèque de gestion de file d'attente tierce.
- **Principe 6 (rigueur temporelle)** : respecté — le mois cible est résolu en Europe/Paris via l'utilitaire existant `parisAnneeMoisCourant` (déjà paramétré par une `Date`, jamais modifié dans sa signature), simplement invoqué avec une date de référence décalée plutôt qu'avec `new Date()`.
- **Contrat connecteur (`connecteur-interface.md` §5)** : point d'attention — **règle 8** documentée dans `config.schema.ts` interdit une année/un mois codé en dur dans la *configuration déclarative* ; cette feature respecte cette règle (aucune config modifiée) mais **étend le contrat d'exécution lui-même** (`Connecteur.collecter()` gagne un paramètre optionnel). C'est un changement de contrat documenté, pas une violation — voir Complexity Tracking pour sa justification et son confinement.
- **Contrat connecteur, règle 1 (aucun effet de bord/lecture de stockage dans un moteur)** : respecté — le moteur reste une fonction de résolution/extraction pure vis-à-vis du stockage ; le paramètre de mois cible est une entrée supplémentaire, pas un accès à un état externe.
- **Contrat connecteur, règle 6 (isolation des erreurs)** : respecté et renforcé — le circuit breaker (FR-009) opère au niveau de l'orchestration (le script), jamais à l'intérieur de `runner.ts`/`executerConnecteur`, qui continue d'isoler chaque connecteur indépendamment comme aujourd'hui.
- Aucune violation bloquante identifiée — une entrée en Complexity Tracking documente l'extension du contrat `collecter()`.

## Project Structure

### Documentation (this feature)

```text
specs/005-historique-3-mois-departement/
├── spec.md    # Spécification (ce dossier)
├── plan.md    # Ce fichier
└── tasks.md   # Détail des tâches
```

Pas de `research.md`/`data-model.md` dédiés : les inconnues techniques ont déjà été levées en amont de cette spec (lecture complète de `moteur.ts`, `runner.ts`, `dedupe.ts`, `registry.ts`, `types.ts`, `parisDate.ts`, et analyse DNS réelle du 2026-08-29) — Technical Context ci-dessus entièrement renseigné sans `NEEDS CLARIFICATION`. Un `contracts/` dédié n'est pas nécessaire : aucune route HTTP publique nouvelle (ce mécanisme est un script, FR différent d'un endpoint API) ; le contrat `connecteur-interface.md` existant (feature 002) est mis à jour en place pour documenter le nouveau paramètre optionnel de `collecter()`.

### Source Code (repository root)

```text
backend/
├── src/
│   ├── services/parisDate.ts                    # Nouvel utilitaire : mois cible N mois avant une référence (gestion du franchissement d'année)
│   ├── connecteurs/
│   │   ├── types.ts                              # Connecteur.collecter(cible?) — paramètre optionnel, rétrocompatible
│   │   ├── moteurs/pageWeb/moteur.ts             # resoudreNavigation/resoudreMotifEtape/substituerPlaceholdersDate : acceptent la référence temporelle cible au lieu de `new Date()` codé en dur
│   │   ├── runner.ts                             # executerConnecteur(connecteur, declenchement, cible?) — transmet la cible à collecter(), déclenchement 'backfill' ajouté
│   │   └── hebergement.ts                        # NOUVEAU : correspondance connecteur → groupe d'hébergement (IP mutualisée vs Moselle vs Île-de-France), donnée de configuration statique datée
│   ├── models/executionCollecte.ts               # DeclenchementSchema : ajout de la valeur 'backfill'
│   └── scripts/
│       └── backfill-historique.ts                # NOUVEAU : orchestration (files séquentielles par groupe, espacement, circuit breaker, pilote/périmètre complet)
└── tests/
    ├── unit/
    │   ├── parisDate.test.ts                     # Cas de franchissement d'année pour le nouvel utilitaire
    │   └── moteurs/pageWeb/moteur.test.ts         # Résolution contre un mois cible passé (navigation à motif, à periodes)
    └── integration/connecteurs/
        └── backfill-historique.test.ts           # Séquencement, groupement, circuit breaker, non-duplication (fixtures simulées, sans réseau réel)

specs/002-connecteur-collecte-prefecture/contracts/
└── connecteur-interface.md                        # Mise à jour : paramètre optionnel de collecter(), nouvelle valeur de déclenchement
```

**Structure Decision**: Web application déjà en place. Premier ajout d'un répertoire `backend/src/scripts/` (aucun précédent dans le dépôt — jusqu'ici uniquement `src/`, `tests/`) : justifié par la nature ponctuelle/opérationnelle du mécanisme (spec.md, Assumptions — pas une fonctionnalité utilisateur, pas un endpoint API).

## Complexity Tracking

| Violation | Pourquoi nécessaire | Alternative plus simple rejetée |
|---|---|---|
| Extension du contrat `Connecteur.collecter()` (paramètre optionnel de mois cible) — contrat documenté depuis la feature 002 comme stable (« interface commune », `types.ts`) | Sans ce paramètre, aucune résolution de mois passé n'est possible : la contrainte FR-001 (aucune configuration déclarative modifiée) exige que la variation soit portée par l'appel à `collecter()`, pas par la configuration | Dupliquer chaque configuration YAML en une variante « mois cible codé en dur » : rejeté — violerait la règle 8 du contrat (pas d'année/mois codé en dur) et multiplierait les fichiers de configuration sans aucun bénéfice, pour un usage strictement ponctuel |
| Nouveau répertoire `backend/src/scripts/`, absent du dépôt jusqu'ici | Le mécanisme est un outil opérationnel déclenché explicitement par un humain, pas une route API ni une tâche planifiée récurrente (spec.md Assumptions) — measurable danger production réel (blocages IP déjà documentés) à traiter hors du chemin HTTP habituel | Exposer l'orchestration via une route admin HTTP (`POST /admin/backfill`) : rejeté — ajouterait une surface d'API pour un usage unique/rare, sans bénéfice, et coderait en dur des choix d'orchestration (délais, lots) dans un contrat HTTP versionné pour rien |
