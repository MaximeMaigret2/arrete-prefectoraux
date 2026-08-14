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
 * connecteur RÉEL `prefecture-77` : pipeline complet `executerConnecteur`
 * (runner.ts) → publication → `GET /api/v1/departements` /
 * `computeDepartementState`, contre la même fixture réelle que
 * `reel-prefecture-77.test.ts` (V004), `fetch` mocké de la même façon,
 * horloge figée au 13/08/2026 (`navigation` de `prefecture-77.yaml`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../src/data');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_77_PATH = path.join(DATA_DIR, 'events', '77.json');

const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-77');
const URL_RACINE = 'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA';
const URL_ANNEE = 'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-2026';
const URL_DETAIL_13 =
  'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-2026/RAA-n-D77-13-08-2026';
const URL_DETAIL_12_NOMINATIFS =
  'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-2026/RAA-n-D77-12-08-2026-nominatifs';
const URL_PDF_13 =
  'https://www.seine-et-marne.gouv.fr/contenu/telechargement/73282/594847/file/RAA%20n%C2%B0%20D77-13-08-2026.pdf';
const URL_PDF_12_NOMINATIFS =
  'https://www.seine-et-marne.gouv.fr/contenu/telechargement/73270/594769/file/RAA%20n%C2%B0D77-12-08-2026-nominatifs.pdf';

// Comprise entre date_debut (13/08/2026) et date_fin (16/08/2026) du
// candidat extrait par la fixture — cf. reel-prefecture-77.test.ts (V004).
const DATE_APPLICABLE = '2026-08-14';

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
let snapshotEvents77: string | null;
let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail13: string;
let htmlDetail12Nominatifs: string;
let pdf13: Buffer;
let pdf12Nominatifs: Buffer;

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
  snapshotEvents77 = await lireOuAbsent(EVENTS_77_PATH);

  await writeFile(EXECUTIONS_PATH, snapshotExecutions ?? '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, snapshotAnomalies ?? '[]\n', 'utf-8');
  // Historique '77' vidé pour ce test (même convention que reel-prefecture-13-carte.test.ts).
  await writeFile(EVENTS_77_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlDetail13 = await readFile(path.join(FIXTURES_DIR, 'detail-13-08-2026.html'), 'utf-8');
  htmlDetail12Nominatifs = await readFile(path.join(FIXTURES_DIR, 'detail-12-08-2026-nominatifs.html'), 'utf-8');
  pdf13 = await readFile(path.join(FIXTURES_DIR, 'RAA-n-D77-13-08-2026.pdf'));
  pdf12Nominatifs = await readFile(path.join(FIXTURES_DIR, 'RAA-n-D77-12-08-2026-nominatifs.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_13) return { ok: true, status: 200, text: async () => htmlDetail13 } as unknown as Response;
      if (url === URL_DETAIL_12_NOMINATIFS) {
        return { ok: true, status: 200, text: async () => htmlDetail12Nominatifs } as unknown as Response;
      }
      if (url === URL_PDF_13) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf13.buffer.slice(pdf13.byteOffset, pdf13.byteOffset + pdf13.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_12_NOMINATIFS) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdf12Nominatifs.buffer.slice(pdf12Nominatifs.byteOffset, pdf12Nominatifs.byteOffset + pdf12Nominatifs.byteLength),
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
  await restaurer(EVENTS_77_PATH, snapshotEvents77);
  resetDataStoreCache();
});

describe('Phase 5bis — connecteur réel prefecture-77 (V005/V001c, mise à jour de la carte)', () => {
  it("le département '77' est vert avant la collecte (couvert, sans événement actif à cette date)", async () => {
    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '77', DATE_APPLICABLE).etat).toBe('vert');
  });

  it("après collecte, l'événement extrait via navigation + page de détail est publié directement et la carte passe au rouge pour '77'", async () => {
    const connecteur = await obtenirConnecteur('prefecture-77');
    expect(connecteur).not.toBeNull();

    const execution = await executerConnecteur(connecteur!, 'planifie');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_anomalies).toBe(0);

    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '77', DATE_APPLICABLE).etat).toBe('rouge');

    const resDepartements = await request(app.server).get('/api/v1/departements').query({ date: DATE_APPLICABLE });
    expect(resDepartements.status).toBe(200);
    const dept77 = resDepartements.body.departements.find((d: { code: string }) => d.code === '77');
    expect(dept77?.etat).toBe('rouge');
    expect(dept77?.evenement_applicable?.reference_arrete).toBe('2026-77-0530');
    expect(dept77?.connecteur_id).toBe('prefecture-77');

    const resHistorique = await request(app.server).get('/api/v1/departements/77/evenements');
    expect(resHistorique.status).toBe(200);
    expect(resHistorique.body.evenements).toHaveLength(1);
    expect(resHistorique.body.evenements[0].reference_arrete).toBe('2026-77-0530');
    expect(resHistorique.body.evenements[0].source_url).toBe(URL_PDF_13);
    expect(resHistorique.body.evenements[0].methode_collecte).toBe('automatique');
  });
});
