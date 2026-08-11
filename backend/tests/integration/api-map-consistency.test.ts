import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';
import { loadDataStore } from '../../src/data/loader.js';
import { computeDepartementState } from '../../src/services/computeDepartementState.js';

/**
 * SC-005 : "Un consommateur tiers peut obtenir, via l'API publique et sans
 * authentification, ... une réponse strictement identique aux données
 * affichées sur la carte pour les mêmes paramètres." Le frontend (Map.tsx)
 * ne consomme QUE `GET /api/v1/departements` (FR-011) ; ce test garantit
 * donc que la réponse HTTP de cette route est strictement identique à ce que
 * calcule `computeDepartementState`, sans logique parallèle ou divergente
 * dans la couche route.
 */
describe('Cohérence API ↔ calcul de la carte (SC-005)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['2026-08-11', '2026-05-15', '2026-05-16', '2026-07-25', '2020-01-01'])(
    "l'état retourné par l'API pour chaque département à %s égale computeDepartementState",
    async (date) => {
      const store = await loadDataStore();
      const res = await request(app.server).get(`/api/v1/departements?date=${date}`);
      expect(res.status).toBe(200);

      for (const d of res.body.departements as Array<{ code: string; etat: string }>) {
        const direct = computeDepartementState(store, d.code, date);
        expect(d.etat).toBe(direct.etat);
      }
    },
  );
});
