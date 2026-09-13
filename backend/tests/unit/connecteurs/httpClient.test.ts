import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { EN_TETES_HTTP_DEFAUT, fetchAvecEnTetes, construireEnTeteCookie } from '../../../src/connecteurs/httpClient.js';

// Repli curl (2026-09-13) : `execFile`/`readFile` sont mockes globalement
// pour ce fichier (pas de vrai sous-processus ni de vrai fichier temporaire
// dans les tests unitaires) - seul `fetchAvecEnTetes` (le point d'entree
// public) est exerce, jamais les fonctions privees `requeteViaCurl()` /
// `estRefusParEgressSortant()` / `analyserEnTetesCurl()` directement.
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_fichier: string, _args: string[], callback: (err: null, res: { stdout: string; stderr: string }) => void) =>
    callback(null, { stdout: '', stderr: '' }),
  ),
}));

vi.mock('node:fs/promises', () => ({
  mkdtemp: vi.fn(async () => '/tmp/httpClient-curl-test'),
  readFile: vi.fn(async (chemin: string) =>
    String(chemin).endsWith('headers.txt')
      ? 'HTTP/1.1 200 OK\r\nContent-Type: application/pdf\r\n\r\n'
      : Buffer.from('contenu-pdf-simule'),
  ),
  rm: vi.fn(async () => undefined),
}));

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
 * Repli `curl` (2026-09-13, decision utilisateur, option 1) — quand
 * `fetch()` recoit la reponse synthetique du proxy de sortie reseau du
 * sandbox Cowork (403 + en-tete `x-deny-reason: host_not_allowed`, jamais
 * emise par un vrai serveur prefecture), `fetchAvecEnTetes` rejoue la
 * requete via `curl` plutot que de renvoyer ce faux 403 tel quel a
 * l'appelant.
 */
describe('fetchAvecEnTetes — repli curl sur refus du proxy d\'egress (2026-09-13)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("bascule sur curl quand fetch() renvoie le refus synthetique du proxy (403 + x-deny-reason: host_not_allowed)", async () => {
    let appelsFetch = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        appelsFetch++;
        return {
          ok: false,
          status: 403,
          headers: { get: (nom: string) => (nom === 'x-deny-reason' ? 'host_not_allowed' : null) },
        } as unknown as Response;
      }),
    );

    const reponse = await fetchAvecEnTetes('https://exemple.gouv.fr/arrete.pdf');

    expect(appelsFetch).toBe(1);
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toBe('application/pdf');
    expect(await reponse.text()).toBe('contenu-pdf-simule');
  });

  it('passe l\'URL et les en-tetes (dont le User-Agent par defaut) a curl', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: { get: (nom: string) => (nom === 'x-deny-reason' ? 'host_not_allowed' : null) },
      })) as unknown as typeof fetch,
    );

    await fetchAvecEnTetes('https://exemple.gouv.fr/arrete.pdf');

    expect(execFile).toHaveBeenCalledWith(
      'curl',
      expect.arrayContaining([
        '--http1.1',
        '-H',
        `User-Agent: ${EN_TETES_HTTP_DEFAUT['User-Agent']}`,
        'https://exemple.gouv.fr/arrete.pdf',
      ]),
      expect.any(Function),
    );
  });

  it("ne bascule PAS sur curl pour un vrai 403 sans l'en-tete x-deny-reason (reste une erreur metier normale, contrat §5, regle 6)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: { get: () => null },
        text: async () => 'Access Forbidden',
      })) as unknown as typeof fetch,
    );

    const reponse = await fetchAvecEnTetes('https://exemple.gouv.fr/page');

    expect(execFile).not.toHaveBeenCalled();
    expect(reponse.status).toBe(403);
    expect(await reponse.text()).toBe('Access Forbidden');
  });

  it("ne bascule PAS sur curl pour un 403 x-deny-reason d'une autre valeur (signature exacte requise)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: { get: (nom: string) => (nom === 'x-deny-reason' ? 'quota_exceeded' : null) },
      })) as unknown as typeof fetch,
    );

    await fetchAvecEnTetes('https://exemple.gouv.fr/page');

    expect(execFile).not.toHaveBeenCalled();
  });

  it("ne retient que le DERNIER bloc d'en-tetes curl (apres suivi de redirection -L)", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: { get: (nom: string) => (nom === 'x-deny-reason' ? 'host_not_allowed' : null) },
      })) as unknown as typeof fetch,
    );
    vi.mocked(readFile).mockImplementationOnce(
      async () =>
        'HTTP/1.1 301 Moved Permanently\r\nLocation: https://exemple.gouv.fr/nouvelle-page\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n',
    );

    const reponse = await fetchAvecEnTetes('https://exemple.gouv.fr/page');

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get('content-type')).toBe('text/html');
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
