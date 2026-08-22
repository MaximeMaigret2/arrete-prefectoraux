import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 67-71) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-70`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * PAS de navigation : `url_liste` est directement la liste paginée (page 1
 * = plus récent). Piège `page_detail` sur carte DSFR (même famille que
 * 58/60) : `selecteur_publications` est l'`<a>` (`.fr-card__title a`,
 * porteur du href), pas le conteneur `.fr-card`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-70');

const URL_RACINE = 'https://www.haute-saone.gouv.fr/Publications/RAA';
const URL_DETAIL_SPECIAL = 'https://www.haute-saone.gouv.fr/Publications/RAA/RAA-Special-nominatif-publie-le-18-aout-2026';
const URL_DETAIL_157 = 'https://www.haute-saone.gouv.fr/Publications/RAA/RAA-70-2026-157-publie-le-18-aout-2026';
const URL_PDF_SPECIAL =
  'https://www.haute-saone.gouv.fr/contenu/telechargement/47980/383172/file/RAA%20Sp%C3%A9cial%20(nominatifs)%2070-2026-158.pdf';
const URL_PDF_157 = 'https://www.haute-saone.gouv.fr/contenu/telechargement/47978/383151/file/RAA%2070-2026-157.pdf';

let htmlRacine: string;
let htmlDetailSpecial: string;
let htmlDetail157: string;
let pdfSpecial: Buffer;
let pdf157: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlDetailSpecial = await readFile(path.join(FIXTURES_DIR, 'detail-special.html'), 'utf-8');
  htmlDetail157 = await readFile(path.join(FIXTURES_DIR, 'detail-157.html'), 'utf-8');
  pdfSpecial = await readFile(path.join(FIXTURES_DIR, 'raa-70-special.pdf'));
  pdf157 = await readFile(path.join(FIXTURES_DIR, 'raa-70-157.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_DETAIL_SPECIAL)
        return { ok: true, status: 200, text: async () => htmlDetailSpecial } as unknown as Response;
      if (url === URL_DETAIL_157)
        return { ok: true, status: 200, text: async () => htmlDetail157 } as unknown as Response;
      if (url === URL_PDF_SPECIAL) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdfSpecial.buffer.slice(pdfSpecial.byteOffset, pdfSpecial.byteOffset + pdfSpecial.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_157) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf157.buffer.slice(pdf157.byteOffset, pdf157.byteOffset + pdf157.byteLength),
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

describe('connecteur réel prefecture-70 (récupération + traitement)', () => {
  it('résout les 2 publications de la page 1 (liste paginée, sans navigation) via page_detail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-70');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (157, pertinent), ignore le spécial nominatif (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-70');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('70');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('70-2026-157');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Haute-Saône');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_157);
  });
});
