import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import request from 'supertest';
import { buildApp } from '../../../src/api/app.js';
import { loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import { executerConnecteur } from '../../../src/connecteurs/runner.js';
import { computeDepartementState } from '../../../src/services/computeDepartementState.js';
import type { Connecteur, ResultatCollecte } from '../../../src/connecteurs/types.js';

/**
 * T045 (US3, Acceptance Scenarios US3.1, US3.2) — un connecteur factice
 * (« fake Connecteur », research.md §9, même patron que
 * `tests/unit/connecteurs/runnerJournalisation.test.ts`, T020A) exécuté via
 * `runner.ts` publie directement un candidat complet et non ambigu (aucune
 * anomalie créée), et l'API/la carte reflètent l'événement immédiatement,
 * sans étape intermédiaire (pas de résolution d'anomalie requise) :
 * - au niveau service (`computeDepartementState`, comme `ajoutConnecteur.test.ts`, T038) ;
 * - au niveau API HTTP réelle (`GET /api/v1/departements?date=...` et
 *   `GET /api/v1/departements/{code}/evenements`, via `buildApp()` +
 *   `supertest`, comme `tests/contract/admin/connecteurs.test.ts`, T039) —
 *   c'est cette seconde vérification qui distingue ce test de T020A/T038 :
 *   aucun des deux n'exerce la route HTTP publique après une collecte.
 *
 * Département de test : '15' (Cantal), inutilisé par les autres suites
 * (`2A`/`2B` : unitaires/T038 ; `04`/`05` : T039 ; `06`/`59` : scheduler ;
 * `77`/`13`/`33` : connecteurs réels).
 *
 * Même convention que les autres tests de ce répertoire :
 * `data/loader.ts` n'a pas d'indirection de répertoire testable → écriture
 * temporaire dans les vrais fichiers, restaurés (par écriture, jamais par
 * suppression) dans `afterEach`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../src/data');
const CONNECTEURS_PATH = path.join(DATA_DIR, 'connecteurs.json');
const EXECUTIONS_PATH = path.join(DATA_DIR, 'executions.json');
const ANOMALIES_PATH = path.join(DATA_DIR, 'anomalies.json');
const EVENTS_15_PATH = path.join(DATA_DIR, 'events', '15.json');

const FAKE_CONNECTEUR_ID = 'test-fake-connecteur-runner-integration';
const DATE_APPLICABLE = '2026-08-13'; // couverte par date_debut ci-dessous, sans date_fin.

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

function makeFakeConnecteur(collecter: () => Promise<ResultatCollecte>): Connecteur {
  return { id: FAKE_CONNECTEUR_ID, departements: ['15'], collecter };
}

const sourceFactice = {
  type: 'page_web' as const,
  url: 'https://exemple.gouv.fr/raa/15',
  contenu_brut_reference: 'https://exemple.gouv.fr/raa/15',
  date_collecte: '2026-08-13T05:00:00.000Z',
};

let app: FastifyInstance;
let snapshotConnecteurs: string | null;
let snapshotExecutions: string | null;
let snapshotAnomalies: string | null;
let snapshotEvents15: string | null;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  snapshotConnecteurs = await lireOuAbsent(CONNECTEURS_PATH);
  snapshotExecutions = await lireOuAbsent(EXECUTIONS_PATH);
  snapshotAnomalies = await lireOuAbsent(ANOMALIES_PATH);
  snapshotEvents15 = await lireOuAbsent(EVENTS_15_PATH);

  const reels = JSON.parse(snapshotConnecteurs ?? '[]') as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = [
    ...reels,
    {
      id: FAKE_CONNECTEUR_ID,
      nom: 'Connecteur factice (test intégration runner, T045)',
      departements_couverts: ['15'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
  ];
  await writeFile(CONNECTEURS_PATH, JSON.stringify(patches, null, 2) + '\n', 'utf-8');
  await writeFile(EXECUTIONS_PATH, snapshotExecutions ?? '[]\n', 'utf-8');
  await writeFile(ANOMALIES_PATH, snapshotAnomalies ?? '[]\n', 'utf-8');
  await writeFile(EVENTS_15_PATH, '[]\n', 'utf-8');
  resetDataStoreCache();
});

afterEach(async () => {
  await restaurer(CONNECTEURS_PATH, snapshotConnecteurs);
  await restaurer(EXECUTIONS_PATH, snapshotExecutions);
  await restaurer(ANOMALIES_PATH, snapshotAnomalies);
  await restaurer(EVENTS_15_PATH, snapshotEvents15);
  resetDataStoreCache();
});

describe("US3 — publication directe d'un candidat complet et non ambigu (T045)", () => {
  it("le département '15' est vert (couvert, sans événement actif) avant toute collecte (computeDepartementState et API HTTP)", async () => {
    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '15', DATE_APPLICABLE).etat).toBe('vert');

    const res = await request(app.server).get('/api/v1/departements').query({ date: DATE_APPLICABLE });
    expect(res.status).toBe(200);
    const dept15 = res.body.departements.find((d: { code: string }) => d.code === '15');
    expect(dept15?.etat).toBe('vert');
  });

  it('un candidat complet et non ambigu est publié directement, sans aucune anomalie (US3.1)', async () => {
    const connecteur = makeFakeConnecteur(async () => ({
      candidats: [
        {
          departement_code: '15',
          type_evenement: 'interdiction',
          reference_arrete: '2026-15-0001',
          date_debut: '2026-08-13T00:00:00.000Z',
          date_fin: null,
          autorite_signataire: 'Le Préfet du Cantal',
          source: sourceFactice,
        },
      ],
    }));

    const execution = await executerConnecteur(connecteur, 'planifie');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.nombre_anomalies).toBe(0);

    const store = await loadDataStore(true);
    // Filtré sur ce connecteur plutôt que `store.anomalies` en entier :
    // `anomalies.json` est un fichier réel partagé par toutes les suites de
    // tests de ce répertoire, potentiellement exécutées en parallèle par
    // vitest (fichiers de test distincts = processus/workers distincts) —
    // seules les anomalies produites par CE connecteur concernent cette
    // assertion.
    const anomaliesDeCeConnecteur = store.anomalies.filter((a) => a.connecteur_id === FAKE_CONNECTEUR_ID);
    expect(anomaliesDeCeConnecteur).toHaveLength(0);
    const evenements = store.evenementsByDepartement.get('15') ?? [];
    expect(evenements).toHaveLength(1);
    expect(evenements[0].methode_collecte).toBe('automatique');
    expect(evenements[0].reference_arrete).toBe('2026-15-0001');
  });

  it(
    "l'API publique (carte) reflète l'événement immédiatement après la collecte, sans étape intermédiaire (US3.1, US3.2)",
    async () => {
      const connecteur = makeFakeConnecteur(async () => ({
        candidats: [
          {
            departement_code: '15',
            type_evenement: 'interdiction',
            reference_arrete: '2026-15-0002',
            date_debut: '2026-08-13T00:00:00.000Z',
            date_fin: null,
            autorite_signataire: 'Le Préfet du Cantal',
            source: sourceFactice,
          },
        ],
      }));

      await executerConnecteur(connecteur, 'planifie');

      // Carte : GET /api/v1/departements?date=...
      const resDepartements = await request(app.server).get('/api/v1/departements').query({ date: DATE_APPLICABLE });
      expect(resDepartements.status).toBe(200);
      const dept15 = resDepartements.body.departements.find((d: { code: string }) => d.code === '15');
      expect(dept15?.etat).toBe('rouge');
      expect(dept15?.evenement_applicable?.reference_arrete).toBe('2026-15-0002');
      expect(dept15?.connecteur_id).toBe(FAKE_CONNECTEUR_ID);

      // Historique : GET /api/v1/departements/{code}/evenements
      const resHistorique = await request(app.server).get('/api/v1/departements/15/evenements');
      expect(resHistorique.status).toBe(200);
      expect(resHistorique.body.couvert).toBe(true);
      expect(resHistorique.body.evenements).toHaveLength(1);
      expect(resHistorique.body.evenements[0].reference_arrete).toBe('2026-15-0002');
      expect(resHistorique.body.evenements[0].methode_collecte).toBe('automatique');
    },
  );

  it('liste de candidats vide (US3.3, aucune nouvelle publication) → statut succès, département inchangé (vert)', async () => {
    const connecteur = makeFakeConnecteur(async () => ({ candidats: [] }));

    const execution = await executerConnecteur(connecteur, 'planifie');

    expect(execution.statut).toBe('succes');
    expect(execution.nombre_evenements_publies).toBe(0);
    expect(execution.nombre_anomalies).toBe(0);

    const store = await loadDataStore(true);
    expect(computeDepartementState(store, '15', DATE_APPLICABLE).etat).toBe('vert');
  });
});
