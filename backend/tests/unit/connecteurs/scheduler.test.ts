import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import {
  arreterScheduler,
  demarrerScheduler,
  executerConnecteursPlanifies,
  schedulerActif,
} from '../../../src/connecteurs/scheduler.js';
import type { Connecteur, ResultatCollecte } from '../../../src/connecteurs/types.js';

/**
 * Tests du scheduler (T040, FR-013, research.md §6).
 *
 * `executerConnecteursPlanifies` réutilise le `runner` réel (comme le
 * déclenchement manuel, T035) : mêmes conventions d'écriture temporaire
 * dans les vrais fichiers de données que `runnerJournalisation.test.ts`
 * (T020A), restaurées après chaque test. Départements de test `06`/`59`
 * (Alpes-Maritimes/Nord) : inutilisés par les autres suites touchant aux
 * vrais fichiers de données (seul `computeDepartementState.test.ts` les
 * référence, mais avec un store entièrement en mémoire — aucun conflit).
 */

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/data');
const CONNECTEURS_PATH = path.join(DATA_DIR, 'connecteurs.json');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_06_PATH = path.join(DATA_DIR, 'events', '06.json');
const EVENTS_59_PATH = path.join(DATA_DIR, 'events', '59.json');

const CONNECTEUR_OK_ID = 'test-scheduler-connecteur-ok';
const CONNECTEUR_KO_ID = 'test-scheduler-connecteur-ko';

async function lireOuAbsent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/** Restaure `filePath` par écriture (jamais par suppression — non permise sur ce point de montage). `null` = fichier absent à l'origine → restauré à `[]`, équivalent fonctionnel. */
async function restaurer(filePath: string, contenu: string | null): Promise<void> {
  await writeFile(filePath, contenu ?? '[]\n', 'utf-8');
}

let snapshotConnecteurs: string | null;
let snapshotExecutions: string | null;
let snapshotAnomalies: string | null;
let snapshotEvents06: string | null;
let snapshotEvents59: string | null;

beforeEach(async () => {
  snapshotConnecteurs = await lireOuAbsent(CONNECTEURS_PATH);
  snapshotExecutions = await lireOuAbsent(EXECUTIONS_PATH);
  snapshotAnomalies = await lireOuAbsent(ANOMALIES_PATH);
  snapshotEvents06 = await lireOuAbsent(EVENTS_06_PATH);
  snapshotEvents59 = await lireOuAbsent(EVENTS_59_PATH);

  const reels = JSON.parse(snapshotConnecteurs ?? '[]') as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = reels.map((c) => ({
    ...c,
    type_connecteur: c.type_connecteur ?? 'page_web',
  }));
  patches.push(
    {
      id: CONNECTEUR_OK_ID,
      nom: 'Connecteur factice (test scheduler, succès)',
      departements_couverts: ['06'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
    {
      id: CONNECTEUR_KO_ID,
      nom: 'Connecteur factice (test scheduler, échec inattendu)',
      departements_couverts: ['59'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
  );
  await writeFile(CONNECTEURS_PATH, JSON.stringify(patches, null, 2) + '\n', 'utf-8');
  await writeFile(EXECUTIONS_PATH, '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, '[]\n', 'utf-8');
  await writeFile(EVENTS_06_PATH, '[]\n', 'utf-8');
  await writeFile(EVENTS_59_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();
});

afterEach(async () => {
  arreterScheduler();
  await restaurer(CONNECTEURS_PATH, snapshotConnecteurs);
  await restaurer(EXECUTIONS_PATH, snapshotExecutions);
  await restaurer(ANOMALIES_PATH, snapshotAnomalies);
  await restaurer(EVENTS_06_PATH, snapshotEvents06);
  await restaurer(EVENTS_59_PATH, snapshotEvents59);
  resetDataStoreCache();
});

const sourceFactice = {
  type: 'page_web' as const,
  url: 'https://example.org/raa/test-scheduler',
  contenu_brut_reference: 'https://example.org/raa/test-scheduler',
  date_collecte: '2026-08-13T04:00:00.000Z',
};

function makeConnecteur(id: string, departement: string, collecter: () => Promise<ResultatCollecte>): Connecteur {
  return { id, departements: [departement], collecter };
}

describe('executerConnecteursPlanifies (FR-013)', () => {
  it('exécute chaque connecteur avec le déclenchement "planifie" et journalise une exécution par connecteur', async () => {
    const connecteurOk = makeConnecteur(CONNECTEUR_OK_ID, '06', async () => ({
      candidats: [
        {
          departement_code: '06',
          type_evenement: 'interdiction',
          reference_arrete: '2026-06-0001',
          date_debut: '2026-08-13T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet des Alpes-Maritimes',
          source: sourceFactice,
        },
      ],
    }));
    const connecteurSansCandidat = makeConnecteur(CONNECTEUR_KO_ID, '59', async () => ({ candidats: [] }));

    await executerConnecteursPlanifies([connecteurOk, connecteurSansCandidat]);

    const store = await loadDataStore(true);
    expect(store.executions).toHaveLength(2);
    expect(store.executions.every((e) => e.declenchement === 'planifie')).toBe(true);
    expect(store.evenementsByDepartement.get('06')).toHaveLength(1);
    const misAJourOk = store.connecteurs.find((c) => c.id === CONNECTEUR_OK_ID);
    expect(misAJourOk?.derniere_collecte).not.toBeNull();
  });

  it("isole une exception inattendue non capturée par executerConnecteur (ex. connecteur mal enregistré) sans interrompre les suivants", async () => {
    const erreurSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // `executerConnecteur` capture déjà toute erreur de `collecter()`
    // (contrat §5, règle 6) : pour simuler un bug réellement non
    // intercepté par le runner, on utilise un connecteur dont l'id n'a
    // pas d'entrée dans `connecteurs.json` (ex. connecteur mal enregistré
    // au boot) — `updateConnecteur()` lève alors après la collecte, en
    // dehors du try/catch interne de `executerConnecteur`.
    const connecteurNonEnregistre = makeConnecteur('id-jamais-enregistre-test-scheduler', '59', async () => ({
      candidats: [],
    }));
    const connecteurOk = makeConnecteur(CONNECTEUR_OK_ID, '06', async () => ({ candidats: [] }));

    await executerConnecteursPlanifies([connecteurNonEnregistre, connecteurOk]);

    const store = await loadDataStore(true);
    // La collecte du connecteur non enregistré a bien tourné et journalisé
    // son exécution (`appendExecution` précède la mise à jour en échec
    // dans `runner.ts`) ; c'est la mise à jour de `derniere_collecte` qui
    // échoue ensuite et remonte au scheduler. L'important (FR-012,
    // Principe 10) : le connecteur suivant s'exécute malgré tout — le
    // cycle ne s'arrête pas au premier échec.
    expect(store.executions).toHaveLength(2);
    const executionOk = store.executions.find((e) => e.connecteur_id === CONNECTEUR_OK_ID);
    expect(executionOk).toBeDefined();
    const misAJourOk = store.connecteurs.find((c) => c.id === CONNECTEUR_OK_ID);
    expect(misAJourOk?.derniere_collecte).not.toBeNull();
    expect(erreurSpy).toHaveBeenCalled();
    expect(erreurSpy.mock.calls.some((call) => String(call[0]).includes('id-jamais-enregistre-test-scheduler'))).toBe(
      true,
    );

    erreurSpy.mockRestore();
  });

  it('liste vide → aucun effet, ne lève pas', async () => {
    await expect(executerConnecteursPlanifies([])).resolves.toBeUndefined();
    const store = await loadDataStore(true);
    expect(store.executions).toHaveLength(0);
  });
});

describe('demarrerScheduler / arreterScheduler', () => {
  it('démarre une tâche cron planifiée à 05:00 Europe/Paris par défaut', () => {
    const tache = demarrerScheduler();
    expect(schedulerActif()).toBe(true);
    expect(tache.getPattern()).toBe('0 5 * * *');
  });

  it('est idempotent : un second appel sans arrêt préalable retourne la même tâche', () => {
    const premiere = demarrerScheduler();
    const seconde = demarrerScheduler();
    expect(seconde).toBe(premiere);
  });

  it('arreterScheduler stoppe la tâche et permet un redémarrage ultérieur (nouvelle tâche)', () => {
    const premiere = demarrerScheduler();
    arreterScheduler();
    expect(schedulerActif()).toBe(false);

    const seconde = demarrerScheduler();
    expect(seconde).not.toBe(premiere);
  });

  it('accepte une expression et un fuseau horaire personnalisés', () => {
    const tache = demarrerScheduler({ expression: '30 4 * * *', timezone: 'UTC' });
    expect(tache.getPattern()).toBe('30 4 * * *');
  });
});
