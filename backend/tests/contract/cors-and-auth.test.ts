import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';

const ENDPOINTS = [
  '/api/v1/departements?date=2026-08-11',
  '/api/v1/departements/77/evenements',
  '/api/v1/evenements?debut=2026-01-01&fin=2026-12-31',
];

/**
 * Vérifie FR-008/Constraints (plan.md) : API strictement en lecture seule et
 * publique, sans authentification, CORS ouvert sur tous les endpoints v1.
 */
describe('Absence d’authentification et CORS ouvert sur /api/v1/*', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ENDPOINTS)('%s répond 200 sans aucun en-tête d’authentification', async (endpoint) => {
    const res = await request(app.server).get(endpoint);
    expect(res.status).toBe(200);
  });

  it.each(ENDPOINTS)('%s renvoie un en-tête CORS ouvert (Access-Control-Allow-Origin)', async (endpoint) => {
    const res = await request(app.server).get(endpoint).set('Origin', 'https://tiers-externe.example');
    expect(res.headers['access-control-allow-origin']).toBeTruthy();
  });

  it('les endpoints /api/v1/* ne définissent aucun schéma de sécurité (aucune authentification requise)', async () => {
    const doc = await request(app.server).get('/documentation/json');
    expect(doc.body.components?.securitySchemes ?? {}).toEqual({});
    expect(doc.body.security ?? []).toEqual([]);
  });
});
