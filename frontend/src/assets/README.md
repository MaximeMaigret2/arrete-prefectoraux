# departements.topojson

Fond de carte des départements français (101 entités), au format TopoJSON,
consommé par `frontend/src/components/Map/Map.tsx` via `topojson-client`.

**Origine prévue (research.md §1)** : `gregoiredavid/france-geojson`
(`departements-version-simplifiee.geojson`, Licence Ouverte Etalab), converti
en TopoJSON.

**Historique** : ce fichier a d'abord été un placeholder généré
programmatiquement (grille 11×10 de polygones carrés), le réseau de
l'environnement d'exécution initial ne permettant pas d'atteindre
`raw.githubusercontent.com`. Ce placeholder produisait des géométries qui se
chevauchaient à l'écran (les carrés adjacents de la grille se superposaient
selon la projection utilisée par `Map.tsx`), ce qui faisait échouer les
tests e2e Playwright (`tooltip.spec.ts`, `slider-history.spec.ts`) : le
survol d'un département donné déclenchait les événements pointeur d'un
département voisin.

**État actuel** : régénéré via `npm run generate:topojson`
(`frontend/scripts/generate-departements-topojson.mjs`), qui télécharge
`departements-version-simplifiee.geojson` et le convertit avec
`topology()` de `topojson-server`, en conservant les propriétés `code`/`nom`
attendues par `Map.tsx`. Nécessite un accès réseau à
`raw.githubusercontent.com`.

**Pour régénérer** :

```bash
cd frontend
npm run generate:topojson
```

Le script vérifie que 101 départements sont bien présents et avertit en cas
d'écart avec `backend/src/data/departements.json` (T009/T011).
