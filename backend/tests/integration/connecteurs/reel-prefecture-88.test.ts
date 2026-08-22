import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 88-92) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-88`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif "{annee}$").
 * Liste finale PAGINÉE (13 pages de 10 .fr-card, page 1 = plus récent),
 * chaque `.fr-card__title a` pointe DIRECTEMENT vers le PDF — même famille
 * que prefecture-13/33/68/74/92 : PAS de `page_detail`, `selecteur_publications`
 * est le conteneur `.fr-card`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-88');

const URL_RACINE = 'https://www.vosges.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA';
const URL_ANNEE_2026 = 'https://www.vosges.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA/2026';
const URL_PDF_410 = 'https://www.vosges.gouv.fr/contenu/telechargement/62410/412410/file/RAA_88_20260820_410.pdf';
const URL_PDF_409 = 'https://www.vosges.gouv.fr/contenu/telechargement/62409/412405/file/RAA_88_20260818_409.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let pdf410: Buffer;
let pdf409: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdf410 = await readFile(path.join(FIXTURES_DIR, 'RAA_88_20260820_410.pdf'));
  pdf409 = await readFile(path.join(FIXTURES_DIR, 'RAA_88_20260818_409.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_PDF_410) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf410.buffer.slice(pdf410.byteOffset, pdf410.byteOffset + pdf410.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_409) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf409.buffer.slice(pdf409.byteOffset, pdf409.byteOffset + pdf409.byteLength),
        } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connecteur réel prefecture-88 (récupération + traitement)', () => {
  it('résout les 2 publications de la page 1 (liste paginée, lien PDF direct sur .fr-card)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-88');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (410, pertinent), ignore le 409 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-88');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('88');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('88-2026-08-20-410');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet des Vosges');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_410);
  });
});
