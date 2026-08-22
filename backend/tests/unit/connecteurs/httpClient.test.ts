import { afterEach, describe, expect, it, vi } from 'vitest';
import { EN_TETES_HTTP_DEFAUT, fetchAvecEnTetes } from '../../../src/connecteurs/httpClient.js';

/**
 * Q-007 (lot Qualité — Durcissement, 2026-08-22) — `fetchAvecEnTetes()`
 * remplace les appels `fetch()` nus dispersés dans les 3 moteurs
 * (`moteurs/{pageWeb,pdf,rss}/moteur.ts`) : timeout, retry avec backoff
 * exponentiel sur erreur réseau transitoire (type `SocketError`, déjà
 * observé sur 01/03/12), et systématiquement `EN_TETES_HTTP_DEFAUT`.
 */

describe('fetchAvecEnTetes (Q-007)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retente après un échec réseau transitoire et renvoie la réponse de la tentative suivante qui réussit', async () => {
    let appels = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appels++;
        if (appels === 1) throw new Error('SocketError: other side closed');
        return { ok: true, status: 200, text: async () => 'contenu' } as unknown as Response;
      }),
    );

    const reponse = await fetchAvecEnTetes('https://exemple.gouv.fr/page');

    expect(appels).toBe(2);
    expect(reponse.ok).toBe(true);
    expect(await reponse.text()).toBe('contenu');
  });

  it('abandonne après épuisement des tentatives et relance la dernière erreur réseau rencontrée', async () => {
    let appels = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appels++;
        throw new Error('SocketError: other side closed');
      }),
    );

    await expect(
      fetchAvecEnTetes('https://exemple.gouv.fr/page', { tentativesSupplementaires: 1 }),
    ).rejects.toThrow('SocketError');
    // 1 tentative initiale + 1 retry (tentativesSupplementaires: 1), puis abandon.
    expect(appels).toBe(2);
  });

  it("n'effectue aucune retentative sur une réponse HTTP reçue mais non-2xx (erreur métier, pas transport — contrat §5, règle 6)", async () => {
    let appels = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appels++;
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const reponse = await fetchAvecEnTetes('https://exemple.gouv.fr/page');

    expect(appels).toBe(1);
    expect(reponse.ok).toBe(false);
    expect(reponse.status).toBe(404);
  });

  it('applique systématiquement EN_TETES_HTTP_DEFAUT (User-Agent avec contact) à chaque appel', async () => {
    let headersRecus: Record<string, string> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
        headersRecus = init?.headers;
        return { ok: true, status: 200, text: async () => '' } as unknown as Response;
      }),
    );

    await fetchAvecEnTetes('https://exemple.gouv.fr/page');

    expect(headersRecus).toEqual(EN_TETES_HTTP_DEFAUT);
    expect(headersRecus?.['User-Agent']).toContain('mailto:');
  });
});
