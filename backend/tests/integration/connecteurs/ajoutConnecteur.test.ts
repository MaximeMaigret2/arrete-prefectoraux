import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';
import { executerConnecteur } from '../../../src/connecteurs/runner.js';
import { computeDepartementState } from '../../../src/services/computeDepartementState.js';

/**
 * T038 — Test d'intégration US2 (Acceptance Scenarios US2.1, US2.2) :
 * ajouter un connecteur pour un département actuellement gris (non
 * couvert), déclencher une collecte manuelle, et vérifier qu'un événement
 * publié directement (`methode_collecte: automatique`, aucune anomalie
 * intermédiaire) fait passer ce département hors du gris — sans toucher au
 * code cœur (API, calcul d'état, carte : ce test n'utilise que
 * `registry.ts`/`runner.ts`/`computeDepartementState.ts` tels quels).
 *
 * Département de test : '57' (Moselle), non couvert par aucun
 * connecteur réel
 * (`connecteurs.json`) ni par les autres suites de tests
 * (`registry.test.ts`/`runnerJournalisation.test.ts` utilisent '2A' ;
 * `tests/contract/admin/connecteurs.test.ts`, T039, utilise '04'/'05').
 * Basculé de '52' à '57' le 2026-08-19 (lot 52-56) : '52' vient de recevoir
 * son propre connecteur réel — même mécanique que
 * 2A→2B→21→26→31→37→42→47→52→57 au fil des sessions précédentes.
 *
 * Même convention que `runnerJournalisation.test.ts`/`registry.test.ts` :
 * `data/loader.ts` n'a pas d'indirection de répertoire testable, donc ce
 * test écrit temporairement dans les vrais fichiers
 * `connecteurs.json`/`events/57.json`/`configs/<id>.yaml` et restaure
 * l'état d'origine (par écriture, la suppression de fichier n'étant pas
 * permise sur ce point de montage) dans `afterEach`.
 *
 * `beforeEach` ne fait que capturer un instantané de l'état initial (le
 * département '57' doit rester réellement gris — non couvert — au moment
 * où le premier test le vérifie) ; l'ajout effectif du connecteur est
 * déclenché explicitement par `ajouterConnecteurDeTest()`, appelée à
 * l'intérieur des tests qui en ont besoin.
 *
 * `anomalies.json`/`executions.json` (journaux globaux, pas par
 * département) sont aussi sauvegardés/restaurés ici, comme dans
 * `runnerJournalisation.test.ts`/T020A et `scheduler.test.ts`/T040 — absent
 * jusqu'ici (constaté après coup, T042-047) : la 3ᵉ publication de
 * `publication-propre.html` ('2026-77-0520', sans PDF suivi dans
 * `config-test.yaml`) produit une anomalie `champ_manquant` à chaque
 * exécution de ce test, qui restait donc dans les vrais fichiers au lieu
 * d'être nettoyée.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../src/data');
const CONFIGS_DIR = path.join(__dirname, '../../../src/connecteurs/configs');
const CONNECTEURS_PATH = path.join(DATA_DIR, 'connecteurs.json');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_57_PATH = path.join(DATA_DIR, 'events', '57.json');
const FIXTURE_CONFIG_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/config-test.yaml');
const FIXTURE_HTML_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-propre.html');

const CONNECTEUR_ID = 'test-ajout-connecteur-56';
const CONFIG_PATH = path.join(CONFIGS_DIR, `${CONNECTEUR_ID}.yaml`);
const URL_LISTE = 'https://exemple-test.gouv.fr/Publications/RAA';

async function lireOuAbsent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

let snapshotConnecteurs: string | null;
let snapshotConfig: string | null;
let snapshotExecutions: string | null;
let snapshotAnomalies: string | null;
let snapshotEvents57: string | null;
let html: string;

beforeEach(async () => {
  snapshotConnecteurs = await lireOuAbsent(CONNECTEURS_PATH);
  snapshotConfig = await lireOuAbsent(CONFIG_PATH);
  snapshotExecutions = await lireOuAbsent(EXECUTIONS_PATH);
  snapshotAnomalies = await lireOuAbsent(ANOMALIES_PATH);
  snapshotEvents57 = await lireOuAbsent(EVENTS_57_PATH);
  html = await readFile(FIXTURE_HTML_PATH, 'utf-8');
  resetDataStoreCache();

  // Stub `fetch` : ne répond qu'à `URL_LISTE` (contenu de la fixture
  // `publication-propre.html`, T036) — jamais de véritable accès réseau,
  // même convention que `tests/unit/connecteurs/moteurPageWeb.test.ts`. Le
  // lien PDF joint (troisième publication de la fixture) échoue donc au
  // téléchargement (404) : le moteur retombe sur le texte du titre seul
  // pour ce candidat (isolation à l'échelle du candidat, cf. moteur.ts),
  // sans affecter le candidat "2026-77-0512" testé ici.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_LISTE) {
        return { ok: true, status: 200, text: async () => html } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(async () => {
  await writeFile(CONNECTEURS_PATH, snapshotConnecteurs ?? '[]\n', 'utf-8');
  await writeFile(
    CONFIG_PATH,
    snapshotConfig ?? '# fixture de test (ajoutConnecteur.test.ts), inutilisée\n',
    'utf-8',
  );
  await writeFile(EXECUTIONS_PATH, snapshotExecutions ?? '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, snapshotAnomalies ?? '[]\n', 'utf-8');
  await writeFile(EVENTS_57_PATH, snapshotEvents57 ?? '[]\n', 'utf-8');
  resetDataStoreCache();
  vi.unstubAllGlobals();
});

/**
 * Simule l'opérateur "ajoutant un connecteur" pour '57' (US2) : une entrée
 * `connecteurs.json` + une configuration déclarative
 * (`configs/<id>.yaml`), sans toucher au code cœur — exactement ce que
 * font T032-T034 pour les connecteurs réels.
 */
async function ajouterConnecteurDeTest(): Promise<void> {
  const reels = JSON.parse(snapshotConnecteurs ?? '[]') as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = [
    ...reels,
    {
      id: CONNECTEUR_ID,
      nom: 'Connecteur de test (ajout, US2, T038)',
      departements_couverts: ['57'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
  ];
  await writeFile(CONNECTEURS_PATH, JSON.stringify(patches, null, 2) + '\n', 'utf-8');

  const configYaml = await readFile(FIXTURE_CONFIG_PATH, 'utf-8');
  await writeFile(CONFIG_PATH, configYaml, 'utf-8');

  await writeFile(EVENTS_57_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();
}

describe('US2 — ajouter un connecteur pour un département gris (T038)', () => {
  it("le département '57' est gris avant l'ajout de tout connecteur (non couvert)", async () => {
    const store = await loadDataStore(true);
    expect(store.departementsCouverts.has('57')).toBe(false);
    const etatAvant = computeDepartementState(store, '57', '2026-08-13');
    expect(etatAvant.etat).toBe('gris');
  });

  it('un déclenchement manuel publie directement un événement complet et non ambigu, sans anomalie', async () => {
    await ajouterConnecteurDeTest();

    const connecteur = await obtenirConnecteur(CONNECTEUR_ID);
    expect(connecteur).not.toBeNull();

    const execution = await executerConnecteur(connecteur!, 'manuel');

    expect(execution.declenchement).toBe('manuel');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.statut).not.toBe('echec');

    const store = await loadDataStore(true);
    const evenements = store.evenementsByDepartement.get('57') ?? [];
    expect(evenements).toHaveLength(1);
    expect(evenements[0].reference_arrete).toBe('2026-77-0512');
    expect(evenements[0].methode_collecte).toBe('automatique');
    expect(evenements[0].connecteur_id).toBe(CONNECTEUR_ID);
    expect(evenements[0].source_url).toBe(URL_LISTE);
  });

  it("après ajout du connecteur et collecte, le département n'est plus gris à une date couverte par l'événement publié (US2.1, US2.2)", async () => {
    await ajouterConnecteurDeTest();

    const connecteur = await obtenirConnecteur(CONNECTEUR_ID);
    await executerConnecteur(connecteur!, 'manuel');

    const store = await loadDataStore(true);
    const etatApres = computeDepartementState(store, '57', '2026-08-13');

    expect(etatApres.etat).not.toBe('gris');
    expect(etatApres.etat).toBe('rouge');
    expect(etatApres.evenement_applicable?.reference_arrete).toBe('2026-77-0512');
  });
});
