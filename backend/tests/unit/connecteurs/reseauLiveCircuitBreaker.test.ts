import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * Circuit-breaker de `tests/live/support/reseauLive.ts` (2026-08-30, cf.
 * `claude/etat-connecteurs.md` du projet Cowork associé, section "Quatrième
 * run réel", pour l'investigation qui l'a motivé) : un throttle de 2s entre
 * requêtes s'est révélé insuffisant pour éviter le blocage de l'hébergeur
 * mutualisé (18/96 puis 78/96 échoués, motif quasiment identique à un run
 * sans throttle) — ce test verrouille le comportement de repli qui arrête
 * d'envoyer des requêtes dès que le blocage est détecté, au lieu de
 * marteler l'hôte déjà bloqué pour tous les fichiers restants.
 *
 * Placé dans `tests/unit/` (et non `tests/live/`, exclu de `npm test` —
 * cf. `vitest.config.ts`) pour tourner automatiquement sans jamais faire de
 * VRAI appel réseau : `fetchAvecEnTetes` est intégralement simulé.
 */

const THROTTLE_PATH = path.join(os.tmpdir(), 'arretes-rave-teknival-live-drift-throttle.json');
const CIRCUIT_PATH = path.join(os.tmpdir(), 'arretes-rave-teknival-live-drift-circuit.json');

async function nettoyerEtatDisque(): Promise<void> {
  await Promise.all([
    rm(THROTTLE_PATH, { force: true }),
    rm(CIRCUIT_PATH, { force: true }),
  ]);
}

describe('reseauLive — circuit-breaker', () => {
  beforeEach(async () => {
    await nettoyerEtatDisque();
    vi.resetModules();
    vi.stubEnv('LIVE_DRIFT_DELAI_MS', '0'); // pas de throttle réel dans ces tests
    vi.stubEnv('LIVE_DRIFT_SEUIL_CIRCUIT', '3');
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.doUnmock('../../../src/connecteurs/httpClient.js');
    await nettoyerEtatDisque();
  });

  it("s'ouvre après le nombre d'échecs consécutifs configuré et abandonne alors SANS tenter de nouvel appel réseau", async () => {
    let appelsReseau = 0;
    vi.doMock('../../../src/connecteurs/httpClient.js', () => ({
      fetchAvecEnTetes: vi.fn(async () => {
        appelsReseau++;
        throw new Error('SocketError: other side closed');
      }),
    }));

    const { fetchAvecSession, CircuitOuvertError } = await import('../../live/support/reseauLive.js');

    // 3 échecs consécutifs, chacun tentant réellement le réseau simulé.
    await expect(fetchAvecSession('https://exemple.gouv.fr/1')).rejects.toThrow('SocketError');
    await expect(fetchAvecSession('https://exemple.gouv.fr/2')).rejects.toThrow('SocketError');
    await expect(fetchAvecSession('https://exemple.gouv.fr/3')).rejects.toThrow('SocketError');
    expect(appelsReseau).toBe(3);

    // Le circuit est désormais ouvert : l'appel suivant échoue immédiatement,
    // avec une erreur distincte, et NE TENTE AUCUN appel réseau supplémentaire.
    await expect(fetchAvecSession('https://exemple.gouv.fr/4')).rejects.toBeInstanceOf(CircuitOuvertError);
    expect(appelsReseau).toBe(3);
  });

  it('un succès réinitialise le compteur — deux blips isolés ne doivent jamais ouvrir le circuit à tort', async () => {
    let appelsReseau = 0;
    vi.doMock('../../../src/connecteurs/httpClient.js', () => ({
      fetchAvecEnTetes: vi.fn(async () => {
        appelsReseau++;
        // Échecs aux appels 1, 2, 4, 5 — succès aux appels 3 et 6.
        // Jamais 3 échecs D'AFFILÉE malgré 4 échecs au total.
        if (appelsReseau === 3 || appelsReseau === 6) return { ok: true } as Response;
        throw new Error('SocketError: other side closed');
      }),
    }));

    const { fetchAvecSession } = await import('../../live/support/reseauLive.js');

    await expect(fetchAvecSession('https://exemple.gouv.fr/1')).rejects.toThrow('SocketError');
    await expect(fetchAvecSession('https://exemple.gouv.fr/2')).rejects.toThrow('SocketError');
    await expect(fetchAvecSession('https://exemple.gouv.fr/3')).resolves.toMatchObject({ ok: true });
    await expect(fetchAvecSession('https://exemple.gouv.fr/4')).rejects.toThrow('SocketError');
    await expect(fetchAvecSession('https://exemple.gouv.fr/5')).rejects.toThrow('SocketError');
    // Toujours seulement 2 échecs consécutifs (4 et 5) : le 6e appel doit
    // encore tenter le réseau (pas de CircuitOuvertError) et réussir.
    await expect(fetchAvecSession('https://exemple.gouv.fr/6')).resolves.toMatchObject({ ok: true });
    expect(appelsReseau).toBe(6);
  });

  it('une réponse non-2xx (ex. HTTP 403) ne compte jamais comme un échec réseau pour le circuit', async () => {
    let appelsReseau = 0;
    vi.doMock('../../../src/connecteurs/httpClient.js', () => ({
      // `fetchAvecEnTetes` ne lève JAMAIS sur une réponse non-2xx reçue
      // (contrat §5 règle 6) — seulement sur un échec de transport. On
      // simule ici une vraie réponse HTTP 403 (Cloudflare), jamais une
      // exception, pour vérifier que le circuit-breaker ne réagit pas à ce
      // type d'échec métier.
      fetchAvecEnTetes: vi.fn(async () => {
        appelsReseau++;
        return { ok: false, status: 403 } as Response;
      }),
    }));

    const { fetchAvecSession } = await import('../../live/support/reseauLive.js');

    for (let i = 0; i < 5; i++) {
      const reponse = await fetchAvecSession(`https://exemple.gouv.fr/${i}`);
      expect(reponse.ok).toBe(false);
    }
    expect(appelsReseau).toBe(5);
  });
});
