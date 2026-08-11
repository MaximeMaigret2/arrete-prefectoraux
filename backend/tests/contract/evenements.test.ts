import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';

describe('GET /api/v1/evenements', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retourne tous les événements dont l’intervalle recoupe la période demandée', async () => {
    const res = await request(app.server).get('/api/v1/evenements?debut=2026-01-01&fin=2026-12-31');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('derniere_mise_a_jour');
    expect(Array.isArray(res.body.evenements)).toBe(true);
    // Les 5 événements du jeu de test (77:1, 13:2, 33:2) tombent tous dans 2026.
    expect(res.body.evenements.length).toBeGreaterThanOrEqual(5);
    const codes = new Set(res.body.evenements.map((e: { departement_code: string }) => e.departement_code));
    expect(codes.has('77')).toBe(true);
    expect(codes.has('13')).toBe(true);
    expect(codes.has('33')).toBe(true);
  });

  it('exclut les événements hors intervalle', async () => {
    const res = await request(app.server).get('/api/v1/evenements?debut=2020-01-01&fin=2020-01-31');
    expect(res.status).toBe(200);
    expect(res.body.evenements).toHaveLength(0);
  });

  it('retourne 400 si debut ou fin est manquant', async () => {
    const res = await request(app.server).get('/api/v1/evenements?debut=2026-01-01');
    expect(res.status).toBe(400);
  });

  it('retourne 400 si debut ou fin est mal formé', async () => {
    const res = await request(app.server).get('/api/v1/evenements?debut=2026-13-01&fin=2026-12-31');
    expect(res.status).toBe(400);
  });

  it('retourne 400 si fin est antérieure à debut', async () => {
    const res = await request(app.server).get('/api/v1/evenements?debut=2026-12-31&fin=2026-01-01');
    expect(res.status).toBe(400);
  });
});
