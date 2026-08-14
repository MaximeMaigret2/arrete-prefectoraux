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
 * V005 (Phase 5bis, 2026-08-13) — "mise à jour de la carte" pour le
 * connecteur RÉEL `prefecture-13` : pipeline complet
 * `executerConnecteur` (runner.ts) → publication → `GET /api/v1/departements`
 * / `computeDepartementState`, contre la même fixture réelle que
 * `reel-prefecture-13.test.ts` (V004), `fetch` mocké de la même façon.
 *
 * Contrairement à `runner.test.ts` (T045, connecteur factice sur le
 * département de test '15'), ce test exerce le VRAI connecteur
 * `prefecture-13` chargé depuis `configs/prefecture-13.yaml` +
 * `connecteurs.json`, sur le département '13' qu'il couvre réellement en
 * production — données existantes de '13' sauvegardées/restaurées comme
 * `idempotence.test.ts` (T046), jamais supprimées.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../src/data');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_13_PATH = path.join(DATA_DIR, 'events', '13.json');

const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-13');
const URL_LISTE = 'https://www.bouches-du-rhone.gouv.fr/Publications/RAA-et-Archives/RAA-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.bouches-du-rhone.gouv.fr/contenu/telechargement/65030/454163/file/recueil-13-2026-249-recueil-des-actes-administratifs-special-bis.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.bouches-du-rhone.gouv.fr/contenu/telechargement/65020/454100/file/recueil-13-2026-246-recueil-des-actes-administratifs-special.pdf';

// Comprise entre date_debut (13/08/2026) et date_fin (18/08/2026) du
// candidat extrait par la fixture — cf. reel-prefecture-13.test.ts (V004).
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
let snapshotEvents13: string | null;
let html: string;
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
  snapshotExecutions = await lireOuAbsent(EXECUTIONS_PATH);
  snapshotAnomalies = await lireOuAbsent(ANOMALIES_PATH);
  snapshotEvents13 = await lireOuAbsent(EVENTS_13_PATH);

  await writeFile(EXECUTIONS_PATH, snapshotExecutions ?? '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, snapshotAnomalies ?? '[]\n', 'utf-8');
  // Historique '13' vidé pour ce test (comme idempotence.test.ts/T046) :
  // les événements de seed existants (interdiction 2026-05 puis levée)
  // rendraient la détection de doublon/l'état "avant collecte" ambigus.
  await writeFile(EVENTS_13_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();

  html = await readFile(path.join(FIXTURES_DIR, 'liste.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_LISTE) return { ok: true, status: 200, text: async () => html } as unknown as Response;
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
  await restaurer(EXECUTIONS_PATH, snapshotExecutions);
  await restaurer(ANOMALIES_PATH, snapshotAnomalies);
  await restaurer(EVENTS_13_PATH, snapshotEvents13);
  resetDataStoreCache();
});

describe('Phase 5bis — connecteur réel prefecture-13 (V005, mise à jour de la carte)', () => {
  it("le département '13' est vert avant la collecte (couvert, sans événement actif à cette date)", async () => {
    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '13', DATE_APPLICABLE).etat).toBe('vert');
  });

  it("après collecte, l'événement extrait du PDF réel est publié directement et la carte passe au rouge pour '13'", async () => {
    const connecteur = await obtenirConnecteur('prefecture-13');
    expect(connecteur).not.toBeNull();

    const execution = await executerConnecteur(connecteur!, 'planifie');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_anomalies).toBe(0);

    // Service (computeDepartementState).
    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '13', DATE_APPLICABLE).etat).toBe('rouge');

    // API publique — carte : GET /api/v1/departements?date=...
    const resDepartements = await request(app.server).get('/api/v1/departements').query({ date: DATE_APPLICABLE });
    expect(resDepartements.status).toBe(200);
    const dept13 = resDepartements.body.departements.find((d: { code: string }) => d.code === '13');
    expect(dept13?.etat).toBe('rouge');
    expect(dept13?.evenement_applicable?.reference_arrete).toBe('13-2026-08-249');
    expect(dept13?.connecteur_id).toBe('prefecture-13');

    // API publique — historique : GET /api/v1/departements/13/evenements.
    const resHistorique = await request(app.server).get('/api/v1/departements/13/evenements');
    expect(resHistorique.status).toBe(200);
    expect(resHistorique.body.evenements).toHaveLength(1);
    expect(resHistorique.body.evenements[0].reference_arrete).toBe('13-2026-08-249');
    expect(resHistorique.body.evenements[0].source_url).toBe(URL_PDF_AVEC_ARRETE);
    expect(resHistorique.body.evenements[0].methode_collecte).toBe('automatique');
  });
});
