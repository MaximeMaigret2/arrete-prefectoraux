import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/api/app.js';

describe('GET /api/v1/departements/etats', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retourne 400 si debut ou fin est manquant', async () => {
    const res1 = await request(app.server).get('/api/v1/departements/etats?fin=2026-05-31');
    expect(res1.status).toBe(400);
    expect(res1.body).toHaveProperty('error');

    const res2 = await request(app.server).get('/api/v1/departements/etats?debut=2026-05-01');
    expect(res2.status).toBe(400);
  });

  it('retourne 400 si debut ou fin est mal formé', async () => {
    const res = await request(app.server).get(
      '/api/v1/departements/etats?debut=01-05-2026&fin=2026-05-31',
    );
    expect(res.status).toBe(400);
  });

  it('retourne 400 si fin est antérieure à debut', async () => {
    const res = await request(app.server).get(
      '/api/v1/departements/etats?debut=2026-05-31&fin=2026-05-01',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_range');
  });

  it("retourne 400 si l'intervalle dépasse la limite de taille autorisée (FR-010)", async () => {
    const res = await request(app.server).get(
      '/api/v1/departements/etats?debut=2020-01-01&fin=2026-05-31',
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_range');
  });

  it('retourne 200 avec les 96 départements, segments contigus couvrant intégralement [debut, fin]', async () => {
    const debut = '2026-05-01';
    const fin = '2026-05-31';
    const res = await request(app.server).get(`/api/v1/departements/etats?debut=${debut}&fin=${fin}`);
    expect(res.status).toBe(200);
    expect(res.body.debut).toBe(debut);
    expect(res.body.fin).toBe(fin);
    expect(res.body.derniere_mise_a_jour).toBeTruthy();
    expect(res.body.departements).toHaveLength(96);

    for (const dept of res.body.departements) {
      expect(Array.isArray(dept.segments)).toBe(true);
      expect(dept.segments.length).toBeGreaterThan(0);
      // Bornes contiguës et couverture intégrale de [debut, fin] (FR-001).
      expect(dept.segments[0].date_debut).toBe(debut);
      expect(dept.segments[dept.segments.length - 1].date_fin).toBe(fin);
      for (let i = 1; i < dept.segments.length; i += 1) {
        const prevFin = new Date(`${dept.segments[i - 1].date_fin}T00:00:00Z`);
        const nextDebut = new Date(`${dept.segments[i].date_debut}T00:00:00Z`);
        expect(nextDebut.getTime() - prevFin.getTime()).toBe(24 * 60 * 60 * 1000);
      }
    }
  });

  it('connecteur_id/derniere_collecte présents une seule fois par département, jamais dupliqués par segment (FR-009)', async () => {
    const res = await request(app.server).get(
      '/api/v1/departements/etats?debut=2026-05-01&fin=2026-05-31',
    );
    for (const dept of res.body.departements) {
      expect(dept).toHaveProperty('connecteur_id');
      expect(dept).toHaveProperty('derniere_collecte');
      for (const segment of dept.segments) {
        expect(segment).not.toHaveProperty('connecteur_id');
        expect(segment).not.toHaveProperty('derniere_collecte');
      }
    }

    const dept77 = res.body.departements.find((d: { code: string }) => d.code === '77');
    expect(dept77.connecteur_id).toBe('prefecture-77');
  });

  it('un segment rouge (13, avant la levée) contient evenement_applicable, le segment vert suivant contient dernier_arrete_connu', async () => {
    // events/13.json (données réelles) : interdiction du 2026-05-01 sans
    // date_fin propre, levée le 2026-05-16 — même fixture que
    // computeDepartementStateSegments.test.ts et le test e2e existant.
    const res = await request(app.server).get(
      '/api/v1/departements/etats?debut=2026-05-01&fin=2026-05-31',
    );
    const dept13 = res.body.departements.find((d: { code: string }) => d.code === '13');
    const segmentRouge = dept13.segments.find((s: { etat: string }) => s.etat === 'rouge');
    expect(segmentRouge).toBeDefined();
    expect(segmentRouge.evenement_applicable).not.toBeNull();
    expect(segmentRouge.evenement_applicable.reference_arrete).toBe('AP-2026-0501');

    const dernierSegment13 = dept13.segments[dept13.segments.length - 1];
    expect(dernierSegment13.etat).toBe('vert');
    expect(dernierSegment13.dernier_arrete_connu).toMatchObject({ reference_arrete: 'AP-2026-0501' });
  });

  it('intervalle réduit à un seul jour : un unique segment par département, cohérent avec GET /departements?date=', async () => {
    const res = await request(app.server).get(
      '/api/v1/departements/etats?debut=2026-08-11&fin=2026-08-11',
    );
    const resDate = await request(app.server).get('/api/v1/departements?date=2026-08-11');
    const byCodeDate = new Map(resDate.body.departements.map((d: { code: string }) => [d.code, d]));

    for (const dept of res.body.departements) {
      expect(dept.segments).toHaveLength(1);
      expect(dept.segments[0].date_debut).toBe('2026-08-11');
      expect(dept.segments[0].date_fin).toBe('2026-08-11');
      const attendu = byCodeDate.get(dept.code) as { etat: string };
      expect(dept.segments[0].etat).toBe(attendu.etat);
    }
  });
});
