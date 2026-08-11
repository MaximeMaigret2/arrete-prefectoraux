// Génère frontend/src/assets/departements.topojson à partir de la source
// gregoiredavid/france-geojson (research.md §1), en remplaçant le
// placeholder programmatique (grille 11×10) documenté dans
// frontend/src/assets/README.md.
//
// Usage : npm run generate:topojson   (depuis frontend/)
//
// Prérequis réseau : accès à raw.githubusercontent.com. Ce script a été
// écrit et validé (structure TopoJSON) dans un environnement où ce domaine
// était bloqué par un allowlist réseau ; il doit être exécuté sur une
// machine avec un accès internet standard.

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { topology } from 'topojson-server';

const SOURCE_URL =
  'https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'assets', 'departements.topojson');

// Codes INSEE attendus (101 départements, y compris Corse 2A/2B et DOM
// 971-976) — sert uniquement de garde-fou pour détecter un écart avec
// backend/src/data/departements.json (T009/T011).
const EXPECTED_DEPARTEMENT_COUNT = 101;

async function main() {
  console.log(`Téléchargement de ${SOURCE_URL}…`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Échec du téléchargement : HTTP ${response.status} ${response.statusText}`);
  }
  const geojson = await response.json();

  if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
    throw new Error('Le fichier téléchargé ne ressemble pas à une FeatureCollection GeoJSON valide.');
  }

  console.log(`${geojson.features.length} départements trouvés dans la source.`);
  if (geojson.features.length !== EXPECTED_DEPARTEMENT_COUNT) {
    console.warn(
      `Avertissement : ${geojson.features.length} entités trouvées, ${EXPECTED_DEPARTEMENT_COUNT} attendues. ` +
        `Vérifier la cohérence avec backend/src/data/departements.json avant de committer.`,
    );
  }

  // Normalise les propriétés attendues par Map.tsx (`geo.properties.code` /
  // `geo.properties.nom`) — la source gregoiredavid les fournit déjà sous
  // ces noms, ce mapping est un garde-fou explicite plutôt qu'une confiance
  // aveugle dans le format amont.
  for (const feature of geojson.features) {
    const props = feature.properties ?? {};
    if (!props.code || !props.nom) {
      throw new Error(`Feature sans "code"/"nom" exploitable : ${JSON.stringify(props)}`);
    }
    feature.properties = { code: String(props.code), nom: String(props.nom) };
  }

  const topo = topology({ departements: geojson });

  await writeFile(OUTPUT_PATH, JSON.stringify(topo));
  console.log(`Écrit : ${OUTPUT_PATH}`);
  console.log(
    'Étape suivante : vérifier que les 101 codes de departements.topojson correspondent à ' +
      'backend/src/data/departements.json (T009/T011), puis relancer `npm run test:e2e`.',
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
