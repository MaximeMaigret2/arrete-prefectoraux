import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { registerAdminAuth } from '../../../src/api/routes/admin/auth.js';

/**
 * T020 — Contrat FR-015/research.md §7 : toute route sous `/api/v1/admin/*`
 * exige une authentification HTTP Basic valide, faute de quoi elle répond
 * 401.
 *
 * Aucune route métier admin n'est encore câblée dans `app.ts` à ce stade
 * (anomalies : T051-T054 ; connecteurs : T035/T063). On reproduit donc ici
 * exactement l'imbrication de contexte utilisée par `buildApp()`
 * (`/api/v1` → `/admin`, protégé par `registerAdminAuth`) avec une route de
 * sonde représentative, afin de vérifier au niveau HTTP/contrat — pas
 * seulement unitaire (cf. `tests/unit/api/adminAuth.test.ts`, qui couvre le
 * mécanisme `registerAdminAuth` isolément) — que la protection s'applique
 * bien à « toute route » enregistrée dans ce contexte, avant même que les
 * routes réelles n'existent. Ces dernières hériteront de la même
 * protection sans rien dupliquer (cf. commentaire dans `app.ts`).
 */

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe("Authentification requise sur '/api/v1/admin/*'", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.ADMIN_USERNAME = 'test-admin';
    process.env.ADMIN_PASSWORD = 'test-admin-password-not-for-production';

    app = Fastify();
    await app.register(
      async (v1) => {
        await v1.register(
          async (admin) => {
            await registerAdminAuth(admin);
            // Route de sonde : représentative de n'importe quelle route
            // admin future (anomalies, connecteurs) — toutes enregistrées
            // dans ce même contexte protégé.
            admin.get('/probe', async () => ({ ok: true }));
          },
          { prefix: '/admin' },
        );
      },
      { prefix: '/api/v1' },
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('401 sans en-tête Authorization', async () => {
    const res = await request(app.server).get('/api/v1/admin/probe');
    expect(res.status).toBe(401);
  });

  it('401 avec des identifiants invalides', async () => {
    const res = await request(app.server)
      .get('/api/v1/admin/probe')
      .set('Authorization', basicAuthHeader('test-admin', 'mauvais-mot-de-passe'));
    expect(res.status).toBe(401);
  });

  it('renvoie un en-tête WWW-Authenticate (Basic) sur un 401', async () => {
    const res = await request(app.server).get('/api/v1/admin/probe');
    expect(res.headers['www-authenticate']).toMatch(/^Basic /);
  });

  it('200 avec les identifiants configurés (protection non bloquante quand valide)', async () => {
    const res = await request(app.server)
      .get('/api/v1/admin/probe')
      .set('Authorization', basicAuthHeader('test-admin', 'test-admin-password-not-for-production'));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
