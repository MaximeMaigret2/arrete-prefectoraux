import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 67-71) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-71`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * PAS de navigation : `url_liste` est directement la liste paginée (page 1
 * = plus récent), même famille que prefecture-70. Piège `page_detail` sur
 * carte DSFR : `selecteur_publications` est l'`<a>`, pas le conteneur
 * `.fr-card`. PARTICULARITÉ : le lien PDF de la page de détail n'a pas la
 * classe `fr-link--download` habituelle — `selecteur_lien_pdf` cible le
 * `href` directement.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-71');

const URL_RACINE = 'https://www.saone-et-loire.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_DETAIL_245 =
  'https://www.saone-et-loire.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-SPECIAL-NOMINATIFS-N-71-2026-245';
const URL_DETAIL_244 =
  'https://www.saone-et-loire.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-SPECIAL-N-71-2026-244';
const URL_PDF_245 =
  'https://www.saone-et-loire.gouv.fr/contenu/telechargement/38378/321055/file/recueil-71-2026-245-recueil-des-actes-administratifs-nominatifs.pdf';
const URL_PDF_244 =
  'https://www.saone-et-loire.gouv.fr/contenu/telechargement/38376/321034/file/recueil-71-2026-244-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlDetail245: string;
let htmlDetail244: string;
let pdf245: Buffer;
let pdf244: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlDetail245 = await readFile(path.join(FIXTURES_DIR, 'detail-245.html'), 'utf-8');
  htmlDetail244 = await readFile(path.join(FIXTURES_DIR, 'detail-244.html'), 'utf-8');
  pdf245 = await readFile(path.join(FIXTURES_DIR, 'raa-71-245.pdf'));
  pdf244 = await readFile(path.join(FIXTURES_DIR, 'raa-71-244.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_DETAIL_245)
        return { ok: true, status: 200, text: async () => htmlDetail245 } as unknown as Response;
      if (url === URL_DETAIL_244)
        return { ok: true, status: 200, text: async () => htmlDetail244 } as unknown as Response;
      if (url === URL_PDF_245) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf245.buffer.slice(pdf245.byteOffset, pdf245.byteOffset + pdf245.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_244) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf244.buffer.slice(pdf244.byteOffset, pdf244.byteOffset + pdf244.byteLength),
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

describe('connecteur réel prefecture-71 (récupération + traitement)', () => {
  it('résout les 2 publications de la page 1 (liste paginée, sans navigation) via page_detail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-71');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (244, pertinent), ignore le 245 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-71');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('71');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('71-2026-08-20-018');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de Saône-et-Loire');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_244);
  });
});
