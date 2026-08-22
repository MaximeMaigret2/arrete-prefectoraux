import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';

describe('GET /api/v1/departements', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retourne les 96 départements avec un état pour la date du jour du jeu de test', async () => {
    const res = await request(app.server).get('/api/v1/departements?date=2026-08-11');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-08-11');
    expect(res.body.derniere_mise_a_jour).toBeTruthy();
    expect(Array.isArray(res.body.departements)).toBe(true);
    expect(res.body.departements).toHaveLength(96);

    const byCode = new Map(res.body.departements.map((d: { code: string }) => [d.code, d]));
    expect(byCode.get('77')).toMatchObject({ etat: 'rouge' });
    expect(byCode.get('13')).toMatchObject({ etat: 'vert' });
    // 57 (Moselle), toujours en statut `identifiee` au 2026-08-19 (le
    // lot 52-56 vient d'être déployé, 52 n'est donc plus un exemple valide de
    // département non couvert — même mécanique que
    // 2A→2B→21→26→31→37→42→47→52→57 au fil des sessions).
    expect(byCode.get('57')).toMatchObject({ etat: 'gris', connecteur_id: null });
  });

  it("n'inclut evenement_applicable que pour les départements rouges", async () => {
    const res = await request(app.server).get('/api/v1/departements?date=2026-08-11');
    for (const d of res.body.departements) {
      if (d.etat === 'rouge') {
        expect(d.evenement_applicable).not.toBeNull();
      } else {
        expect(d.evenement_applicable).toBeNull();
      }
    }
  });

  it('retourne 400 si le paramètre date est manquant', async () => {
    const res = await request(app.server).get('/api/v1/departements');
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
  });

  it('retourne 400 si le paramètre date est mal formé', async () => {
    const res = await request(app.server).get('/api/v1/departements?date=11-08-2026');
    expect(res.status).toBe(400);
  });
});
