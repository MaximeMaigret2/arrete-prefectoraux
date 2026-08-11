# Implementation Plan: Carte interactive des arrêtés d'interdiction de rassemblements musicaux non déclarés

**Branch**: `001-carte-arretes-rave-teknival` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-carte-arretes-rave-teknival/spec.md`

## Summary

Application web affichant une carte des départements français coloriée en 3 états (vert / rouge / gris) calculés dynamiquement à partir d'un historique d'événements append-only, navigable via un calendrier (date unique ou intervalle) et une réglette jour-par-jour, avec infobulle de détail. L'ensemble des données est servi par une API publique en lecture seule, versionnée et documentée (OpenAPI), consommée par le frontend comme n'importe quel client tiers. Approche retenue : application web classique frontend/backend séparés, stockage fichier JSON (pas de base de données au lancement), calcul d'état effectué côté backend et exposé tel quel.

## Technical Context

**Language/Version**: TypeScript 5.x sur Node.js 20 LTS (backend et frontend)

**Primary Dependencies**:
- Backend : Fastify 4.x (serveur HTTP + plugin `@fastify/swagger` pour l'OpenAPI + `@fastify/cors`), `zod` pour la validation des paramètres de requête.
- Frontend : React 18 + Vite, `react-simple-maps` (wrapper `d3-geo` + `topojson-client`) pour le rendu de la carte, `date-fns` + `date-fns-tz` pour la gestion des dates/fuseaux, un composant calendrier (`react-day-picker`) et une réglette accessible (`@radix-ui/react-slider`).

**Storage**: Fichiers JSON versionnés dans le dépôt (un fichier d'événements par département, plus un registre des connecteurs), chargés en mémoire au démarrage du serveur et recalculés à la demande — pas de base de données (conforme au Principe 5 de la constitution tant que le volume reste faible).

**Testing**: Vitest (unitaire, logique de calcul d'état et composants React) + Supertest (tests de contrat de l'API) + Playwright (parcours de bout en bout : sélection de date, réglette, survol).

**Target Platform**: Application web servie par un backend Node.js (conteneur Linux) ; frontend statique buildé (déployable sur tout hébergeur de fichiers statiques ou servi par le même backend).

**Project Type**: Application web (frontend + backend séparés — Option 2)

**Performance Goals**: Calcul de l'état des ~101 départements à une date donnée en moins de 100 ms côté serveur ; chargement initial de la page en moins de 2 s sur connexion large bande standard ; recalcul de la carte à chaque pas de réglette perçu comme instantané (< 100 ms).

**Constraints**: API strictement en lecture seule et publique (pas d'authentification), CORS ouvert ; dates stockées en ISO 8601 UTC, affichées en Europe/Paris ; conformité WCAG 2.1 AA (aucun état porté par la seule couleur) ; pas de support hors-ligne requis.

**Scale/Scope**: 101 départements, couverture par connecteurs potentiellement nulle ou partielle au lancement, volume d'événements de l'ordre de quelques centaines à quelques milliers par an, interface en français uniquement pour cette itération.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principe | Statut | Justification |
|---|---|---|
| 1. Fidélité et traçabilité à la source | PASS | Le modèle de données (Événement) impose référence d'arrêté, dates, connecteur ; FR-005, FR-013. |
| 2. Historisation immuable (append-only) | PASS | L'état est calculé depuis l'historique des événements, jamais stocké comme champ muté (FR-007) ; stockage fichier append-only par construction du modèle. |
| 3. Neutralité factuelle | PASS | Distinction stricte vert/rouge/gris avec libellés neutres ; gris ≠ vert par défaut (FR-016). |
| 4. Accessibilité (couleur seule insuffisante) | PASS | FR-002 impose un indicateur redondant non-couleur ; validé dans Success Criteria SC-002. |
| 5. Simplicité d'architecture | PASS | Stockage fichiers JSON retenu (pas de base de données) tant que le volume reste faible ; voir research.md pour la justification. |
| 6. Rigueur temporelle | PASS | ISO 8601 UTC en stockage, Europe/Paris en affichage (FR-015) ; cas limites de bornes/chevauchements couverts par les Edge Cases du spec et testés unitairement. |
| 7. Transparence et fraîcheur des données | PASS | FR-012 (date de dernière mise à jour), FR-013 (date de saisie distincte de la date de l'arrêté). |
| 8. Ne remplace pas une vérification officielle | PASS | FR-014 (mention explicite dans l'UI). |
| 9. Toutes les données accessibles via API | PASS | FR-008 à FR-011 ; endpoints détaillés dans contracts/openapi.yaml. |
| 10. Connecteurs indépendants et pluggables | PASS | Hors périmètre d'implémentation de cette feature (assumption du spec) mais le modèle de données (Connecteur, `connecteur_id`) ne présuppose aucune source unique ; le cœur applicatif ne dépend d'aucun connecteur concret. |

Aucune violation. Pas d'entrée requise dans Complexity Tracking.

**Re-check post Phase 1 (design)** : `data-model.md` confirme un stockage fichier append-only sans champ de statut muté (Principe 2), une entité `Connecteur` générique ne présupposant aucune source unique (Principe 10), et une fonction de calcul d'état isolée et testable couvrant tous les cas limites du Principe 6. `contracts/openapi.yaml` expose les 3 endpoints minimaux requis par le Principe 9, en lecture seule, sans authentification. Aucune violation introduite par le design — statut inchangé : **PASS** sur les 10 principes.

## Project Structure

### Documentation (this feature)

```text
specs/001-carte-arretes-rave-teknival/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/            # Phase 1 output (/speckit-plan command)
│   └── openapi.yaml
└── tasks.md              # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/          # Departement, Evenement, Connecteur (types + validation zod)
│   ├── services/         # computeDepartementState.ts (logique de calcul d'état à une date T)
│   ├── data/              # events/<code_departement>.json, connecteurs.json, loader.ts
│   └── api/               # routes v1 : departements, departements/:code/evenements, evenements
├── openapi/               # génération/exposition du schéma OpenAPI (servi par @fastify/swagger)
└── tests/
    ├── contract/          # tests de contrat des endpoints (Supertest)
    ├── integration/       # scénarios multi-endpoints (ex. cohérence carte/API)
    └── unit/               # computeDepartementState : chevauchement, sans fin, bornes exactes

frontend/
├── src/
│   ├── components/
│   │   ├── Map/            # rendu SVG des départements (react-simple-maps), Tooltip
│   │   ├── Calendar/        # sélection date unique / intervalle
│   │   ├── Slider/           # réglette jour-par-jour
│   │   └── Legend/            # légende accessible (couleur + motif/icône + texte)
│   ├── pages/                 # page principale de l'application
│   ├── services/               # apiClient.ts (unique point de consommation de l'API)
│   └── assets/                   # departements.topojson (dérivé de france-geojson)
└── tests/
    ├── unit/                     # composants (Vitest + Testing Library)
    └── e2e/                        # parcours calendrier → réglette → survol (Playwright)
```

**Structure Decision**: Option 2 (frontend + backend séparés) retenue car le Principe 9/10 de la constitution impose une API publique indépendante consommée par le frontend comme un client parmi d'autres — un monolithe SSR ou une app 100% statique embarquant les données violerait FR-011. Le backend reste volontairement minimal (pas de base de données, pas de couche service superflue) conformément au Principe 5.

## Complexity Tracking

*Aucune violation du Constitution Check — section non applicable.*
