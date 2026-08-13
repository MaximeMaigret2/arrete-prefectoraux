# Quickstart — Validation de bout en bout

Guide de validation manuelle/scriptée prouvant que la feature fonctionne de bout en bout, sans détail d'implémentation (voir `data-model.md` et `contracts/` pour les spécifications complètes). Complète le quickstart de `specs/001-carte-arretes-rave-teknival/quickstart.md`, toujours valide pour la carte/API publique.

## Prérequis

- Node.js 20 LTS installé, dépendances installées (`npm install` dans `backend/`).
- Variables d'environnement d'authentification admin définies (ex. `ADMIN_USER`, `ADMIN_PASSWORD` — research.md §7) pour accéder aux routes `/api/v1/admin/*`.
- Un connecteur de test pointant vers des fixtures HTML/PDF locales figées (`backend/tests/fixtures/connecteurs/<id>/`), couvrant :
  - une publication propre (référence, dates, autorité tous lisibles) → doit produire un événement automatique,
  - une publication avec un champ manquant (ex. autorité absente) → doit produire une anomalie `champ_manquant`,
  - une publication en doublon d'un événement déjà publié (même département, référence proche) → doit produire une anomalie `doublon_potentiel`,
  - un PDF sans texte extractible (image) → doit produire une anomalie `echec_lecture_source`, sans OCR.
- Le registre des sources (`backend/src/data/registre-sources.yaml`) contient au moins une entrée par statut (`identifiee`, `connecteur_developpe`, `a_investiguer`).

## Démarrage

```bash
cd backend && npm run dev   # démarre l'API sur http://localhost:3000, scheduler in-process actif
```

## Scénarios de validation (référence : spec.md, Acceptance Scenarios)

### 1. Ajouter un connecteur sans toucher au cœur applicatif (US2)

- **Cas courant (type déjà supporté)** : ajouter une entrée dans `connecteurs.json` (`type_connecteur: page_web`, par exemple) et un fichier de configuration déclarative `backend/src/connecteurs/configs/<nouveau-departement>.yaml` (cf. exemple dans `contracts/connecteur-interface.md`) — aucun fichier sous `connecteurs/moteurs/` n'est modifié ni créé.
- **Cas rare (nouveau type de source)** : si aucun moteur existant ne convient, ajouter un nouveau dossier sous `backend/src/connecteurs/moteurs/<nouveau-type>/` — reste isolé du reste du cœur applicatif (`api/`, `models/`, carte).
- Déclencher sa collecte manuellement (§4 ci-dessous).
- **Attendu** : au moins un événement publié pour ce département sans qu'aucune ligne de `api/`, `services/computeDepartementState.ts`, `connecteurs/runner.ts`, `connecteurs/registry.ts` ou des composants carte du frontend n'ait été modifiée ; le département passe de gris à rouge/vert sur la carte à la prochaine consultation (SC-001). Un second connecteur du même `type_connecteur` (ex. une autre préfecture en `page_web`) ne diffère que par son fichier de configuration.

### 2. Collecte propre → publication directe, sans anomalie (US3)

```bash
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -X POST \
  http://localhost:3000/api/v1/admin/connecteurs/<id-connecteur-test>/collecter
```

- **Attendu** : réponse `200` avec `statut: "succes"`, `nombre_evenements_publies >= 1`, `nombre_anomalies: 0` pour la fixture "propre". L'événement apparaît immédiatement via `GET /api/v1/departements/<code>/evenements` (API publique, aucune authentification requise), avec `methode_collecte: "automatique"`.
- Relancer la même collecte immédiatement après : **attendu** aucun nouvel événement publié (idempotence, Acceptance Scenario US3.3).

### 3. Anomalie → aucune publication automatique, résolution manuelle (US4)

```bash
# Lister les anomalies en attente
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" http://localhost:3000/api/v1/admin/anomalies

# Confirmer une anomalie (avec correction si besoin)
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -X POST \
  -H "Content-Type: application/json" \
  -d '{"departement_code":"..","type_evenement":"interdiction","date_debut":"...","reference_arrete":"..."}' \
  http://localhost:3000/api/v1/admin/anomalies/<id>/confirmer

# Rejeter une anomalie
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -X POST \
  http://localhost:3000/api/v1/admin/anomalies/<id>/rejeter
```

- **Attendu (fixture avec champ manquant/doublon)** : après la collecte, `GET /api/v1/admin/anomalies` liste l'anomalie avec `champs_extraits` partiels et `source_brute` accessible ; aucun événement correspondant n'apparaît dans l'API publique tant qu'elle est `en_attente` (FR-008, SC-003).
- Après confirmation : l'événement apparaît dans l'API publique avec `methode_collecte: "manuelle_verifiee"`.
- Après rejet : aucun événement n'apparaît jamais dans l'API publique ni sur la carte, même en relistant les anomalies avec `?statut=rejetee` (FR-016).
- **Attendu (fixture PDF sans texte extractible)** : anomalie `type_anomalie: "echec_lecture_source"`, jamais de tentative d'extraction OCR côté connecteur ni de publication.
- Vérifier que `GET /api/v1/admin/anomalies` sans en-tête d'authentification retourne `401`.

### 4. Désactivation d'un connecteur sans impact sur les autres (US5)

```bash
curl -u "$ADMIN_USER:$ADMIN_PASSWORD" -X PATCH \
  -H "Content-Type: application/json" -d '{"actif": false}' \
  http://localhost:3000/api/v1/admin/connecteurs/<id>
```

- **Attendu** : le département concerné affiche "non couvert" (gris) sur `GET /api/v1/departements?date=<date-posterieure>`, mais les événements déjà publiés avant la désactivation restent consultables sur `GET /api/v1/departements/<code>/evenements`. Les autres connecteurs continuent de fonctionner normalement lors du cycle planifié suivant.

### 5. Registre des sources consultable indépendamment (US1)

- Ouvrir `backend/src/data/registre-sources.yaml` directement (aucun serveur requis).
- **Attendu** : chaque département y figure avec soit une source identifiée (`autorite`, `point_acces`, `format_attendu`), soit `statut: a_investiguer` explicite — jamais d'absence silencieuse (SC-007).

## Tests automatisés correspondants

```bash
cd backend
npm run test:unit         # extraction html/pdf, dedupe, logique de décision publier/anomalie
npm run test:contract     # endpoints admin (auth 401, confirmer/rejeter, déclenchement manuel)
npm run test:integration  # runner de bout en bout avec un connecteur factice
```

**Critère de sortie de ce quickstart** : les 5 scénarios ci-dessus passent manuellement, et les suites `test:unit` / `test:contract` / `test:integration` sont vertes, sans régression sur les suites existantes de `specs/001` (`npm run test` complet côté backend, `npm run test:e2e` côté frontend pour la carte publique).
