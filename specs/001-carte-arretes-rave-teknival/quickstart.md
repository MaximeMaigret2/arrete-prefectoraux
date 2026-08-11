# Quickstart — Validation de bout en bout

Guide de validation manuelle/scriptée prouvant que la feature fonctionne de bout en bout, sans détail d'implémentation (voir `data-model.md` et `contracts/openapi.yaml` pour les spécifications complètes).

## Prérequis

- Node.js 20 LTS installé.
- Dépôt cloné, dépendances installées (`npm install` à la racine de `backend/` et de `frontend/`).
- Un jeu de données de test minimal chargé dans `backend/src/data/` couvrant au moins :
  - un département avec un arrêté `interdiction` actif sans `date_fin` (ex. code `77`),
  - un département avec un arrêté levé (une `interdiction` suivie d'une `levee`) (ex. code `13`),
  - un département sans connecteur (`gris`) (ex. code `2A`),
  - un événement chevauchant un autre (`prolongation` posée avant l'expiration d'un `interdiction` existant).

## Démarrage

```bash
# Backend (API publique en lecture seule)
cd backend && npm run dev   # démarre sur http://localhost:3000

# Frontend (dans un autre terminal)
cd frontend && npm run dev  # démarre sur http://localhost:5173, consomme l'API ci-dessus
```

## Scénarios de validation (référence : spec.md, Acceptance Scenarios)

### 1. Carte à la date du jour (US1)

- Ouvrir `http://localhost:5173`.
- **Attendu** : le département `77` apparaît en rouge, `13` en vert (si la date du jour est postérieure à sa levée), `2A` en gris — chacun avec un indicateur non-couleur visible (motif/icône/texte au survol ou dans la légende).

### 2. Réglette et calendrier (US2)

- Sélectionner un intervalle de dates couvrant la pose et la levée de l'arrêté du département `13`.
- Déplacer la réglette jour par jour jusqu'à la date de levée.
- **Attendu** : `13` passe de rouge à vert exactement le lendemain de la `date_fin` de l'arrêté ; aucun rechargement de page.
- Sélectionner une date antérieure à toute donnée collectée.
- **Attendu** : tous les départements concernés s'affichent en gris, jamais en vert par défaut.

### 3. Infobulle (US3)

- Survoler `77` : l'infobulle affiche la référence de l'arrêté et sa date de début (fin = "en cours").
- Survoler `13` à une date postérieure à la levée : l'infobulle indique explicitement l'absence d'interdiction en vigueur.
- Survoler `2A` : l'infobulle affiche la mention explicite "non couvert".

### 4. API publique indépendante (US4)

```bash
# État de tous les départements à une date donnée
curl "http://localhost:3000/api/v1/departements?date=2026-08-10"

# Historique complet d'un département
curl "http://localhost:3000/api/v1/departements/77/evenements"

# Historique d'un département non couvert
curl "http://localhost:3000/api/v1/departements/2A/evenements"
# Attendu : "couvert": false, "evenements": []

# Tous les événements sur un intervalle
curl "http://localhost:3000/api/v1/evenements?debut=2026-01-01&fin=2026-12-31"
```

- **Attendu** : chaque appel réussit sans en-tête d'authentification ; l'état retourné par `/departements?date=...` correspond exactement à ce qu'affiche la carte pour la même date (SC-005).
- Vérifier que le schéma OpenAPI est accessible publiquement (ex. `http://localhost:3000/documentation/json` selon la configuration `@fastify/swagger`) et correspond à `contracts/openapi.yaml`.

## Tests automatisés correspondants

```bash
# Backend : logique de calcul d'état + contrats API
cd backend && npm run test:unit && npm run test:contract

# Frontend : composants + parcours e2e
cd frontend && npm run test:unit && npm run test:e2e
```

**Critère de sortie de ce quickstart** : les 4 scénarios ci-dessus passent manuellement, et les suites `test:unit` / `test:contract` / `test:e2e` sont vertes.
