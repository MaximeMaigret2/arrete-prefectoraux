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
    // 57 (Moselle) a reçu son connecteur réel le 2026-08-27 (chantier 57) :
    // c'était le dernier des 96 départements du périmètre encore non
    // couvert, il n'en reste donc plus aucun à utiliser comme exemple
    // "gris / non couvert" contre les vraies données (cette règle pure
    // reste couverte indépendamment, avec des données synthétiques, par
    // `tests/unit/computeDepartementState.test.ts`). Aucun arrêté
    // rave-party n'a encore été observé/collecté pour la Moselle au
    // 2026-08-11 (date figée de ce test) : dossier "propre" → vert, comme
    // tout département couvert sans historique.
    expect(byCode.get('57')).toMatchObject({ etat: 'vert', connecteur_id: 'prefecture-57' });
    // Feature 004 (FR-001) : derniere_collecte exposée par département, issue
    // du connecteur qui le couvre — valeurs réelles de connecteurs.json.
    expect(byCode.get('77')).toMatchObject({ derniere_collecte: '2026-08-13T10:00:00.000Z' });
    expect(byCode.get('13')).toMatchObject({ derniere_collecte: '2026-08-20T20:11:35.805Z' });
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

  it('derniere_collecte (FR-001/FR-002, feature 004) : toujours null pour gris ; string ou null pour vert/rouge selon si le connecteur a déjà collecté', async () => {
    const res = await request(app.server).get('/api/v1/departements?date=2026-08-11');
    let nonNullCount = 0;
    for (const d of res.body.departements) {
      if (d.etat === 'gris') {
        expect(d.derniere_collecte).toBeNull();
      } else {
        // FR-002 : un connecteur jamais encore exécuté avec succès a
        // legitimement derniere_collecte = null (edge case 4 de spec.md) —
        // seule la valeur 'object' inattendue (autre que null) serait une
        // régression ; on vérifie donc le type effectif plutôt que la
        // seule non-nullité.
        expect(d.derniere_collecte === null || typeof d.derniere_collecte === 'string').toBe(true);
        if (d.derniere_collecte !== null) nonNullCount += 1;
      }
    }
    // Au moins les connecteurs 77/13 (vérifiés ci-dessus) ont déjà collecté.
    expect(nonNullCount).toBeGreaterThan(0);
  });

  it("n'inclut dernier_arrete_connu que pour les départements verts", async () => {
    const res = await request(app.server).get('/api/v1/departements?date=2026-08-11');
    for (const d of res.body.departements) {
      if (d.etat === 'vert') {
        expect(d.dernier_arrete_connu === null || typeof d.dernier_arrete_connu === 'object').toBe(true);
      } else {
        expect(d.dernier_arrete_connu).toBeNull();
      }
    }
  });

  it('dernier_arrete_connu (idée n°2 du backlog produit) : département 13, interdiction levée le 16/05/2026, redevenu vert', async () => {
    // events/13.json (données réelles) : interdiction du 2026-05-01 sans
    // date_fin propre, levée le 2026-05-16 — exactement le cas "date_fin
    // brute null, fin affichée = date de la levée" verrouillé par
    // tests/unit/computeDepartementState.test.ts. Au 2026-08-11 (date figée
    // de ce fichier), le département 13 est vert (déjà vérifié plus haut).
    const res = await request(app.server).get('/api/v1/departements?date=2026-08-11');
    const dept13 = res.body.departements.find((d: { code: string }) => d.code === '13');
    expect(dept13.etat).toBe('vert');
    expect(dept13.dernier_arrete_connu).toMatchObject({
      reference_arrete: 'AP-2026-0501',
      date_debut: '2026-05-01T00:00:00Z',
      date_fin: '2026-05-16T00:00:00Z',
    });
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
