import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { buildApp } from '../../../src/api/app.js';
import { loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import { executerConnecteur } from '../../../src/connecteurs/runner.js';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';
import { computeDepartementState } from '../../../src/services/computeDepartementState.js';

/**
 * V005/V001c (Phase 5bis, 2026-08-13) — "mise à jour de la carte" pour le
 * connecteur RÉEL `prefecture-33` : pipeline complet `executerConnecteur`
 * (runner.ts) → publication → `GET /api/v1/departements` /
 * `computeDepartementState`, contre la même fixture réelle que
 * `reel-prefecture-33.test.ts` (V004), `fetch` mocké de la même façon,
 * horloge figée au 13/08/2026 (la `navigation` de `prefecture-33.yaml`
 * dépend de la date système).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../src/data');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_33_PATH = path.join(DATA_DIR, 'events', '33.json');

const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-33');
const URL_RACINE = 'https://www.gironde.gouv.fr/Publications/Recueil-des-Actes-Administratifs';
const URL_ANNEE =
  'https://www.gironde.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-de-l-annee-2026';
const URL_MOIS =
  'https://www.gironde.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-de-l-annee-2026/Aout-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.gironde.gouv.fr/contenu/telechargement/87963/661802/file/RAA%2033%20SPECIAL%20N%C2%B0%202026-243.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.gironde.gouv.fr/contenu/telechargement/87951/661682/file/recueil-33-2026-242-recueil-des-actes-administratifs-special-1.pdf';

// Comprise entre date_debut (03/08/2026) et date_fin (05/08/2026) du
// candidat extrait par la fixture — cf. reel-prefecture-33.test.ts (V004).
const DATE_APPLICABLE = '2026-08-04';

async function lireOuAbsent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function restaurer(filePath: string, contenu: string | null): Promise<void> {
  await writeFile(filePath, contenu ?? '[]\n', 'utf-8');
}

let app: FastifyInstance;
let snapshotExecutions: string | null;
let snapshotAnomalies: string | null;
let snapshotEvents33: string | null;
let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  snapshotExecutions = await lireOuAbsent(EXECUTIONS_PATH);
  snapshotAnomalies = await lireOuAbsent(ANOMALIES_PATH);
  snapshotEvents33 = await lireOuAbsent(EVENTS_33_PATH);

  await writeFile(EXECUTIONS_PATH, snapshotExecutions ?? '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, snapshotAnomalies ?? '[]\n', 'utf-8');
  // Historique '33' vidé pour ce test (même convention que reel-prefecture-13-carte.test.ts).
  await writeFile(EVENTS_33_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'aout-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_PDF_AVEC_ARRETE) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdfAvecArrete.buffer.slice(pdfAvecArrete.byteOffset, pdfAvecArrete.byteOffset + pdfAvecArrete.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_SANS_ARRETE) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdfSansArrete.buffer.slice(pdfSansArrete.byteOffset, pdfSansArrete.byteOffset + pdfSansArrete.byteLength),
        } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  await restaurer(EXECUTIONS_PATH, snapshotExecutions);
  await restaurer(ANOMALIES_PATH, snapshotAnomalies);
  await restaurer(EVENTS_33_PATH, snapshotEvents33);
  resetDataStoreCache();
});

describe('Phase 5bis — connecteur réel prefecture-33 (V005/V001c, mise à jour de la carte)', () => {
  it("le département '33' est vert avant la collecte (couvert, sans événement actif à cette date)", async () => {
    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '33', DATE_APPLICABLE).etat).toBe('vert');
  });

  it("après collecte, l'événement extrait du PDF réel (via navigation année → mois) est publié directement et la carte passe au rouge pour '33'", async () => {
    const connecteur = await obtenirConnecteur('prefecture-33');
    expect(connecteur).not.toBeNull();

    const execution = await executerConnecteur(connecteur!, 'planifie');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_anomalies).toBe(0);

    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '33', DATE_APPLICABLE).etat).toBe('rouge');

    const resDepartements = await request(app.server).get('/api/v1/departements').query({ date: DATE_APPLICABLE });
    expect(resDepartements.status).toBe(200);
    const dept33 = resDepartements.body.departements.find((d: { code: string }) => d.code === '33');
    expect(dept33?.etat).toBe('rouge');
    expect(dept33?.evenement_applicable?.reference_arrete).toBe('33-2026-08-243');
    expect(dept33?.connecteur_id).toBe('prefecture-33');

    const resHistorique = await request(app.server).get('/api/v1/departements/33/evenements');
    expect(resHistorique.status).toBe(200);
    expect(resHistorique.body.evenements).toHaveLength(1);
    expect(resHistorique.body.evenements[0].reference_arrete).toBe('33-2026-08-243');
    expect(resHistorique.body.evenements[0].source_url).toBe(URL_PDF_AVEC_ARRETE);
    expect(resHistorique.body.evenements[0].methode_collecte).toBe('automatique');
  });
});
