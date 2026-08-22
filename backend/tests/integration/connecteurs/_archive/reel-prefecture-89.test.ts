import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 88-92) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-89`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif "RAA-{annee}$").
 * Liste finale : liste plate sans pagination,
 * `div[class='']:has(a.fr-link--download)`, même famille que
 * 37/41/45/49/52/55/59/62/65/66/69/72/73/76/78/79/87/90.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-89');

const URL_RACINE = 'https://www.yonne.gouv.fr/Publications/Publications-legales/Recueil-des-actes-administratifs';
const URL_ANNEE_2026 =
  'https://www.yonne.gouv.fr/Publications/Publications-legales/Recueil-des-actes-administratifs/RAA-2026';
const URL_PDF_215 =
  'https://www.yonne.gouv.fr/contenu/telechargement/48215/305215/file/recueil-89-2026-215-recueil-des-actes-administratifs.pdf';
const URL_PDF_198 =
  'https://www.yonne.gouv.fr/contenu/telechargement/48198/305198/file/recueil-89-2026-198-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let pdf215: Buffer;
let pdf198: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdf215 = await readFile(path.join(FIXTURES_DIR, 'recueil-89-2026-215-recueil-des-actes-administratifs.pdf'));
  pdf198 = await readFile(path.join(FIXTURES_DIR, 'recueil-89-2026-198-recueil-des-actes-administratifs.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_PDF_215) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf215.buffer.slice(pdf215.byteOffset, pdf215.byteOffset + pdf215.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_198) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf198.buffer.slice(pdf198.byteOffset, pdf198.byteOffset + pdf198.byteLength),
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

describe('connecteur réel prefecture-89 (récupération + traitement)', () => {
  it('résout les 2 publications de la liste plate (sans pagination)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-89');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (215, pertinent), ignore le 198 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-89');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('89');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('89-2026-215');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le préfet de l'Yonne");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_215);
  });
});
