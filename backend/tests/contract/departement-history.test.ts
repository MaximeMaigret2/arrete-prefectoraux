import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';

describe('GET /api/v1/departements/:code/evenements', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("retourne l'historique chronologique complet d'un département couvert", async () => {
    const res = await request(app.server).get('/api/v1/departements/13/evenements');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: '13', nom: 'Bouches-du-Rhône', couvert: true });
    expect(res.body.evenements).toHaveLength(2);
    expect(res.body.evenements[0].type_evenement).toBe('interdiction');
    expect(res.body.evenements[1].type_evenement).toBe('levee');
    // ordre chronologique croissant
    expect(res.body.evenements[0].date_debut < res.body.evenements[1].date_debut).toBe(true);
  });

  it('retourne couvert:false et une liste vide pour un département non couvert', async () => {
    const res = await request(app.server).get('/api/v1/departements/2A/evenements');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ code: '2A', couvert: false, evenements: [] });
  });

  it('retourne 404 pour un code de département inconnu', async () => {
    const res = await request(app.server).get('/api/v1/departements/99/evenements');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
