import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerAdminAuth } from '../../../src/api/routes/admin/auth.js';

/**
 * Vérifie le mécanisme d'authentification admin (T017, FR-015,
 * research.md §7) indépendamment de toute route métier réelle (anomalies :
 * T051-T054, connecteurs : T035/T063, pas encore implémentées) : un
 * contexte Fastify minimal, protégé par `registerAdminAuth`, avec une
 * unique route de test ajoutée dans ce même contexte pour vérifier que la
 * protection s'applique bien à "tout ce qui est enregistré dedans".
 */

const ORIGINAL_USERNAME = process.env.ADMIN_USERNAME;
const ORIGINAL_PASSWORD = process.env.ADMIN_PASSWORD;

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

describe('registerAdminAuth', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env.ADMIN_USERNAME = ORIGINAL_USERNAME;
    process.env.ADMIN_PASSWORD = ORIGINAL_PASSWORD;
  });

  it("échoue explicitement si ADMIN_USERNAME/ADMIN_PASSWORD ne sont pas configurés", async () => {
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;

    app = Fastify();
    await expect(registerAdminAuth(app)).rejects.toThrow(/ADMIN_USERNAME et ADMIN_PASSWORD/);
  });

  describe('avec des identifiants configurés', () => {
    beforeEach(async () => {
      process.env.ADMIN_USERNAME = 'op-test';
      process.env.ADMIN_PASSWORD = 'mot-de-passe-test';

      app = Fastify();
      await registerAdminAuth(app);
      app.get('/protege', async () => ({ ok: true }));
      await app.ready();
    });

    it('rejette une requête sans en-tête Authorization (401)', async () => {
      const res = await app!.inject({ method: 'GET', url: '/protege' });
      expect(res.statusCode).toBe(401);
    });

    it('rejette des identifiants invalides (401)', async () => {
      const res = await app!.inject({
        method: 'GET',
        url: '/protege',
        headers: { authorization: basicAuthHeader('op-test', 'mauvais-mot-de-passe') },
      });
      expect(res.statusCode).toBe(401);
    });

    it('accepte les identifiants configurés (200)', async () => {
      const res = await app!.inject({
        method: 'GET',
        url: '/protege',
        headers: { authorization: basicAuthHeader('op-test', 'mot-de-passe-test') },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
    });
  });
});
