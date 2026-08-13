# Implementation Plan: Connecteurs de collecte automatique des arrêtés préfectoraux

**Branch**: `002-connecteur-collecte-prefecture` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-connecteur-collecte-prefecture/spec.md`

## Summary

Extension du backend existant (specs/001) avec un sous-système de connecteurs pluggables, découpé en deux couches : un petit nombre de **moteurs génériques par type de source**, écrits une seule fois, et une **configuration déclarative par connecteur concret** (une préfecture ou un portail régional) qui paramètre le moteur de son type sans code additionnel. Seuls `page_web` et `pdf` sont retenus dès cette itération, imposés par le spec (FR-003/FR-004) ; l'inventaire complet des types dépend de l'analyse du registre des sources (US1) et s'étend au même patron si un besoin réel apparaît (research.md §1). Le moteur récupère la publication brute, en extrait référence/dates/autorité selon sa configuration, puis remet des candidats à un orchestrateur commun (`runner`), identique quel que soit le type sous-jacent. Celui-ci détecte les doublons potentiels, publie directement l'événement (`methode_collecte = automatique`) quand l'extraction est complète et non ambiguë, ou crée une anomalie de collecte sinon. Une collecte quotidienne planifiée (in-process) et un déclenchement manuel partagent le même chemin d'exécution. Un espace de résolution des anomalies, protégé par une authentification dédiée (HTTP Basic Auth, compte unique), permet à l'opérateur de confirmer ou rejeter chaque anomalie. Un registre des sources (fichier YAML tenu à jour manuellement) recense, département par département, où et sous quel format publier — indépendant du développement des connecteurs eux-mêmes.

## Technical Context

**Language/Version**: TypeScript 5.x sur Node.js 20 LTS (backend) — identique à specs/001, aucune nouvelle plateforme introduite.

**Primary Dependencies**:
- `fetch` natif Node 20 pour la récupération HTTP (pages HTML, fichiers PDF) — pas de nouvelle dépendance HTTP (research.md §2).
- `cheerio` pour l'extraction ciblée de contenu HTML (research.md §3).
- `pdf-parse` pour l'extraction de texte des PDF (research.md §4).
- `node-cron` pour l'ordonnancement quotidien in-process (research.md §6).
- `@fastify/basic-auth` pour l'authentification de l'espace de résolution (research.md §7).
- `js-yaml` (déjà présent en devDependency du backend) pour lire/valider le registre des sources et les configurations de connecteurs (research.md §8).
- `zod` (déjà présent) pour les nouveaux schémas (Anomalie de collecte, Exécution de collecte, Entrée du registre des sources, configuration par type de moteur — `contracts/connecteur-interface.md`).

**Storage**: Extension du stockage fichier JSON déjà en place : `backend/src/data/anomalies.json`, `backend/src/data/executions.json` (append-only), et un registre des sources au format YAML `backend/src/data/registre-sources.yaml` (research.md §8). Aucune base de données introduite.

**Testing**: Vitest (extraction HTML/PDF, dedupe, calcul d'anomalie), Supertest (contrat des nouveaux endpoints admin, y compris rejet 401 sans authentification), fixtures HTML/PDF statiques versionnées pour les connecteurs (research.md §9) — prolonge la stratégie de specs/001 sans nouvel outil.

**Target Platform**: Identique à specs/001 — backend Node.js (conteneur Linux) ; le scheduler tourne dans le même processus que l'API, pas de service séparé.

**Project Type**: Extension du projet web existant (Option 2, frontend + backend séparés déjà retenue en specs/001) — ajout d'un sous-module `connecteurs/` côté backend et d'une page admin côté frontend ; aucun nouveau projet.

**Performance Goals**: Une collecte par connecteur et par jour (traitement batch, pas de contrainte temps réel) ; le déclenchement manuel d'un connecteur doit répondre en moins de quelques secondes pour l'accusé de réception (l'exécution elle-même peut se poursuivre en tâche de fond) ; hors de ces cas, aucun objectif de performance additionnel à ceux déjà fixés par specs/001 pour l'API publique.

**Constraints**: Idempotence obligatoire (aucun événement dupliqué en cas de ré-exécution sur une source inchangée, FR-010 et Acceptance Scenario US3.3) ; aucune reconnaissance optique de caractères (OCR) — hors périmètre explicite (FR-005) ; l'espace de résolution DOIT être protégé par une authentification distincte et indépendante de l'API publique, qui reste elle-même sans authentification (FR-015) ; chaque anomalie rejetée reste tracée en interne mais ne DOIT jamais apparaître dans l'API publique ou la carte (FR-016).

**Scale/Scope**: Reprise progressive des 3 connecteurs déjà déclarés (`prefecture-77`, `prefecture-13`, `prefecture-33`) selon cette nouvelle architecture pluggable, plus la structure permettant d'en ajouter d'autres sans toucher au cœur applicatif ; registre des sources couvrant à terme les ~101 départements (identifiés ou explicitement "à investiguer", FR-017/SC-007).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Statut | Justification |
|---|---|---|
| 1. Fidélité et traçabilité à la source | PASS | Chaque événement automatique conserve `source_url`/document brut (entité Source brute) ; toute anomalie expose la source brute originale à l'opérateur (FR-009). |
| 2. Historisation immuable (append-only) | PASS | Les événements publiés par un connecteur suivent le même modèle append-only que specs/001 (FR-006) ; le journal des exécutions de collecte est lui-même append-only (research.md §8). |
| 3. Neutralité factuelle | PASS | Aucun changement sur la sémantique des états ; un connecteur désactivé ramène son département à "non couvert" (gris), jamais "vert" par défaut (FR-012). |
| 4. Accessibilité (couleur seule insuffisante) | PASS | Hors périmètre direct de cette feature (pas de nouvel élément d'UI publique) — la carte et sa légende ne sont pas modifiées. |
| 5. Simplicité d'architecture | PASS | Aucune base de données introduite (fichiers JSON/YAML) ; scheduler in-process plutôt qu'infrastructure de jobs séparée ; authentification minimale (Basic Auth, compte unique) réservée au seul espace de résolution, justifiée par un besoin concret (FR-015) sans toucher à l'API publique qui reste ouverte (research.md §6-8). |
| 6. Rigueur temporelle | PASS | Les événements produits par les connecteurs respectent le même format ISO 8601 UTC que le modèle existant ; aucune nouvelle règle temporelle introduite au-delà de `computeDepartementState` déjà spécifié en specs/001. |
| 7. Transparence et fraîcheur des données | PASS | Chaque exécution de collecte journalisée met à jour `derniere_collecte` du connecteur (FR-011), alimentant l'indicateur de fraîcheur déjà exposé par l'API (specs/001). |
| 8. Ne remplace pas une vérification officielle | PASS | Inchangé — aucune modification du message d'avertissement existant. |
| 9. Toutes les données accessibles via API | PASS | Les événements automatiques rejoignent l'API publique existante sans nouveau jeu de données parallèle ; seuls les endpoints d'administration (anomalies) sont nouveaux et distincts, non publics par nature (FR-015). |
| 10. Connecteurs indépendants et pluggables | PASS | Cœur de cette feature : interface `Connecteur` commune (research.md §1), ajout d'une source sans modification du runner, de l'API ou de la carte (FR-001, FR-002) ; l'ajout d'un connecteur d'un type déjà supporté ne requiert même aucun nouveau code (seulement une configuration), et chaque moteur reste testable isolément avec ses propres fixtures, indépendamment des autres. |

Aucune violation. Pas d'entrée requise dans Complexity Tracking.

**Re-check post Phase 1 (design)** : `data-model.md` confirme que les nouvelles entités (Exécution de collecte, Anomalie de collecte, Source brute, Entrée du registre des sources) sont additives — elles n'altèrent ni le schéma `Evenement` existant (seul un connecteur_id/méthode déjà prévus par specs/001 est utilisé) ni la logique `computeDepartementState`. `contracts/` documente l'interface `Connecteur` (aucune dépendance du cœur applicatif à une source concrète) ainsi que les endpoints admin, isolés sous `/api/v1/admin` et protégés par authentification, sans toucher aux endpoints publics de specs/001. Aucune violation introduite par le design — statut inchangé : **PASS** sur les 10 principes.

## Project Structure

### Documentation (this feature)

```text
specs/002-connecteur-collecte-prefecture/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   ├── connecteur-interface.md   # interface commune + les 3 schémas de configuration par type
│   ├── admin-api.yaml
│   └── registre-sources.schema.md
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── connecteurs/
│   │   ├── types.ts               # interface Connecteur commune (contracts/connecteur-interface.md), inchangée quel que soit le type
│   │   ├── registry.ts            # charge connecteurs.json + configs/<id>.yaml, instancie moteur(type).creerConnecteur(config)
│   │   ├── runner.ts              # orchestration : collecte → dedupe → publication/anomalie → journalisation (agnostique du type)
│   │   ├── scheduler.ts           # node-cron, déclenchement quotidien (FR-013)
│   │   ├── dedupe.ts              # détection de doublons potentiels (FR-010, research.md §5)
│   │   ├── extraction/
│   │   │   └── champsCommuns.ts   # regex/parsing partagés (dates FR, référence) réutilisés par plusieurs moteurs
│   │   ├── moteurs/               # un moteur générique par type de source (research.md §1) — écrit une seule fois
│   │   │   ├── pageWeb/
│   │   │   │   ├── moteur.ts        # scraping cheerio générique, piloté par sélecteurs de configuration
│   │   │   │   └── config.schema.ts # schéma zod de la configuration page_web
│   │   │   └── pdf/
│   │   │       ├── moteur.ts        # téléchargement + pdf-parse générique
│   │   │       └── config.schema.ts
│   │   │   # types supplémentaires ajoutés ici au même patron, uniquement si l'analyse
│   │   │   # du registre des sources (US1) en révèle le besoin (contracts/connecteur-interface.md §4)
│   │   └── configs/               # une configuration déclarative par connecteur concret — aucun code
│   │       ├── prefecture-77.yaml   # type: page_web
│   │       ├── prefecture-13.yaml
│   │       └── prefecture-33.yaml
│   ├── models/
│   │   ├── anomalieCollecte.ts   # + extension éventuelle des modèles existants (index.ts)
│   │   ├── executionCollecte.ts
│   │   └── sourceRegistre.ts
│   ├── data/
│   │   ├── anomalies.json
│   │   ├── executions.json
│   │   └── registre-sources.yaml
│   └── api/
│       └── routes/
│           └── admin/
│               ├── auth.ts           # enregistrement @fastify/basic-auth (FR-015)
│               ├── anomalies.ts      # GET liste + POST résolution (confirmer/rejeter) — FR-009
│               └── connecteurs.ts    # POST déclenchement manuel + PATCH actif/inactif (FR-014, FR-012)
└── tests/
    ├── contract/
    │   └── admin/                    # auth 401, résolution anomalie, déclenchement manuel
    ├── integration/
    │   └── connecteurs/              # runner de bout en bout avec un connecteur factice (research.md §9)
    ├── unit/
    │   └── connecteurs/              # moteurs/pageWeb, moteurs/pdf, dedupe — testés génériquement, pas par préfecture
    └── fixtures/
        └── connecteurs/<type>/       # pages HTML / PDF de test figées, réutilisées par plusieurs configurations de test

frontend/
├── src/
│   ├── pages/
│   │   └── AdminPage.tsx             # espace de résolution des anomalies (FR-009), route /admin
│   ├── components/
│   │   └── AnomalyResolution/        # liste + détail anomalie (champs partiels, source brute, actions)
│   └── services/
│       └── adminApiClient.ts         # client dédié, credentials Basic Auth — distinct de apiClient.ts (public)
└── tests/
    ├── unit/                          # composants AnomalyResolution
    └── e2e/                            # parcours résolution (confirmer / rejeter)
```

**Structure Decision**: Extension in-place du backend/frontend existants (pas de nouveau projet) — cohérent avec le Principe 5 et la Structure Decision de specs/001. Les connecteurs vivent dans leur propre sous-module (`backend/src/connecteurs/`), strictement découplé de `api/` et `models/` du cœur applicatif : le seul point de contact est la publication d'événements via le même modèle `Evenement` et la mise à jour de `Connecteur.derniere_collecte`, déjà prévus en specs/001. À l'intérieur de ce sous-module, `moteurs/` (code, un dossier par type, écrit une seule fois) est explicitement séparé de `configs/` (données déclaratives, un fichier par connecteur concret, sans code) — c'est ce découpage qui porte la généricité demandée : ajouter un connecteur d'un type déjà supporté se fait entièrement dans `configs/`, jamais dans `moteurs/`. L'espace admin est une extension additive de l'API (`/api/v1/admin/*`) et du frontend (`/admin`), sans modification des routes ni composants publics existants.

## Complexity Tracking

*Aucune violation du Constitution Check — section non applicable.*
