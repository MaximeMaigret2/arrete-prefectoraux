import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../../src/api/app.js';
import { resetDataStoreCache } from '../../../src/data/loader.js';

/**
 * T039 — Contrat `POST /api/v1/admin/connecteurs/{id}/collecter`
 * (contracts/admin-api.yaml, FR-014) : 200 + `ExecutionCollecte` pour un id
 * valide, 404 pour un id inconnu, 409 pour un connecteur désactivé
 * (`actif: false`), 401 sans authentification (T020 couvre déjà "toute
 * route admin", ce test le revérifie spécifiquement sur cette route
 * réelle, cf. remediation finding F1).
 *
 * Même convention que `tests/unit/connecteurs/registry.test.ts`/
 * `tests/unit/connecteurs/runnerJournalisation.test.ts` : écriture
 * temporaire dans les vrais fichiers de données, restaurés (par écriture,
 * jamais par suppression) dans `afterEach`. Départements de test : '04'
 * (actif) et '05' (désactivé) — inutilisés par les autres suites de tests
 * (cf. '2A'/'2B' dans les tests unitaires, '2B' dans
 * `tests/integration/connecteurs/ajoutConnecteur.test.ts`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../src/data');
const CONFIGS_DIR = path.join(__dirname, '../../../src/connecteurs/configs');
const CONNECTEURS_PATH = path.join(DATA_DIR, 'connecteurs.json');
const EVENTS_04_PATH = path.join(DATA_DIR, 'events', '04.json');
const FIXTURE_CONFIG_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/config-test.yaml');
const FIXTURE_HTML_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-propre.html');

const CONNECTEUR_ACTIF_ID = 'test-contract-connecteur-actif';
const CONNECTEUR_INACTIF_ID = 'test-contract-connecteur-inactif';
const CONFIG_ACTIF_PATH = path.join(CONFIGS_DIR, `${CONNECTEUR_ACTIF_ID}.yaml`);
const URL_LISTE = 'https://exemple-test.gouv.fr/Publications/RAA';
const ID_INCONNU = 'connecteur-totalement-inexistant';

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function lireOuAbsent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

let app: FastifyInstance;
let snapshotConnecteurs: string | null;
let snapshotConfigActif: string | null;
let snapshotEvents04: string | null;
let html: string;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  snapshotConnecteurs = await lireOuAbsent(CONNECTEURS_PATH);
  snapshotConfigActif = await lireOuAbsent(CONFIG_ACTIF_PATH);
  snapshotEvents04 = await lireOuAbsent(EVENTS_04_PATH);
  html = await readFile(FIXTURE_HTML_PATH, 'utf-8');

  const reels = JSON.parse(snapshotConnecteurs ?? '[]') as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = [
    ...reels,
    {
      id: CONNECTEUR_ACTIF_ID,
      nom: 'Connecteur de test actif (contrat, T039)',
      departements_couverts: ['04'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
    {
      id: CONNECTEUR_INACTIF_ID,
      nom: 'Connecteur de test désactivé (contrat, T039)',
      departements_couverts: ['05'],
      actif: false,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
  ];
  await writeFile(CONNECTEURS_PATH, JSON.stringify(patches, null, 2) + '\n', 'utf-8');

  const configYaml = await readFile(FIXTURE_CONFIG_PATH, 'utf-8');
  await writeFile(CONFIG_ACTIF_PATH, configYaml, 'utf-8');

  await writeFile(EVENTS_04_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();

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
    CONFIG_ACTIF_PATH,
    snapshotConfigActif ?? '# fixture de test (contract/admin/connecteurs.test.ts), inutilisée\n',
    'utf-8',
  );
  await writeFile(EVENTS_04_PATH, snapshotEvents04 ?? '[]\n', 'utf-8');
  resetDataStoreCache();
  vi.unstubAllGlobals();
});

describe("POST /api/v1/admin/connecteurs/{id}/collecter", () => {
  it('401 sans authentification', async () => {
    const res = await request(app.server).post(`/api/v1/admin/connecteurs/${CONNECTEUR_ACTIF_ID}/collecter`);
    expect(res.status).toBe(401);
  });

  it('404 pour un connecteur inconnu', async () => {
    const res = await request(app.server)
      .post(`/api/v1/admin/connecteurs/${ID_INCONNU}/collecter`)
      .set('Authorization', basicAuthHeader('test-admin', 'test-admin-password-not-for-production'));

    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });

  it('409 pour un connecteur désactivé (actif: false)', async () => {
    const res = await request(app.server)
      .post(`/api/v1/admin/connecteurs/${CONNECTEUR_INACTIF_ID}/collecter`)
      .set('Authorization', basicAuthHeader('test-admin', 'test-admin-password-not-for-production'));

    expect(res.status).toBe(409);
    expect(res.body.error).toBeTruthy();
  });

  it('200 avec une ExecutionCollecte pour un connecteur actif valide', async () => {
    const res = await request(app.server)
      .post(`/api/v1/admin/connecteurs/${CONNECTEUR_ACTIF_ID}/collecter`)
      .set('Authorization', basicAuthHeader('test-admin', 'test-admin-password-not-for-production'));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      connecteur_id: CONNECTEUR_ACTIF_ID,
      declenchement: 'manuel',
    });
    expect(['succes', 'echec', 'partiel']).toContain(res.body.statut);
    expect(typeof res.body.id).toBe('string');
    expect(typeof res.body.date_execution).toBe('string');
    expect(typeof res.body.nombre_evenements_publies).toBe('number');
    expect(typeof res.body.nombre_anomalies).toBe('number');
  });
});
