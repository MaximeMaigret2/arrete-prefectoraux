import { afterEach, describe, expect, it, vi } from 'vitest';
import { EN_TETES_HTTP_DEFAUT, fetchAvecEnTetes, construireEnTeteCookie } from '../../../src/connecteurs/httpClient.js';

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

  it('enTetesSupplementaires vient compléter (jamais remplacer) EN_TETES_HTTP_DEFAUT', async () => {
    let headersRecus: Record<string, string> | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { headers?: Record<string, string> }) => {
        headersRecus = init?.headers;
        return { ok: true, status: 200, text: async () => '' } as unknown as Response;
      }),
    );

    await fetchAvecEnTetes('https://exemple.gouv.fr/page', { enTetesSupplementaires: { Cookie: 'a=1; b=2' } });

    expect(headersRecus?.Cookie).toBe('a=1; b=2');
    expect(headersRecus?.['User-Agent']).toBe(EN_TETES_HTTP_DEFAUT['User-Agent']);
  });
});

/**
 * `construireEnTeteCookie` (V0xx, 2026-08-27, prefecture-57/Moselle) —
 * construit l'en-tête `Cookie` d'une requête à partir des `Set-Cookie`
 * d'une réponse d'amorçage de session (cf. `session_cookie` du moteur
 * `page_web`).
 */
describe('construireEnTeteCookie', () => {
  it('concatène plusieurs Set-Cookie en un seul en-tête Cookie, en ignorant leurs attributs', () => {
    const reponse = {
      headers: {
        getSetCookie: () => ['DIMSPHPSESSID=abc123; path=/; HttpOnly', 'nocache=1'],
      },
    } as unknown as Response;

    expect(construireEnTeteCookie(reponse)).toBe('DIMSPHPSESSID=abc123; nocache=1');
  });

  it("retourne null quand la réponse ne porte aucun Set-Cookie", () => {
    const reponse = { headers: { getSetCookie: () => [] } } as unknown as Response;
    expect(construireEnTeteCookie(reponse)).toBeNull();
  });
});
