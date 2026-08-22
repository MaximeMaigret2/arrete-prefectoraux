import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 52-56) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-54`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Navigation à UN niveau (racine → année, motif "annee-" en minuscule)
 * vers un unique `<select id="Liste-liste-docs">` (id non dupliqué ici,
 * à la différence de prefecture-51) ; chaque `<option value="...">` mène
 * à une page de détail avant le PDF réel — même famille `page_detail`
 * que prefecture-77/51.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-54');

const URL_RACINE = 'https://www.meurthe-et-moselle.gouv.fr/Publications/Recueils-des-actes-administratifs';
const URL_ANNEE =
  'https://www.meurthe-et-moselle.gouv.fr/Publications/Recueils-des-actes-administratifs/Recueils-des-actes-administratifs-annee-2026';
const URL_DETAIL_101 =
  'https://www.meurthe-et-moselle.gouv.fr/Publications/Recueils-des-actes-administratifs/Recueils-des-actes-administratifs-annee-2026/Numero-101-du-14-aout-2026';
const URL_DETAIL_102 =
  'https://www.meurthe-et-moselle.gouv.fr/Publications/Recueils-des-actes-administratifs/Recueils-des-actes-administratifs-annee-2026/Numero-102-du-17-aout-2026';
const URL_PDF_101 =
  'https://www.meurthe-et-moselle.gouv.fr/contenu/telechargement/36940/278300/file/Num%C3%A9ro%20101%20du%2014%20ao%C3%BBt%202026.pdf';
const URL_PDF_102 =
  'https://www.meurthe-et-moselle.gouv.fr/contenu/telechargement/36954/278454/file/Num%C3%A9ro%20102%20du%2017%20ao%C3%BBt%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail101: string;
let htmlDetail102: string;
let pdf101: Buffer;
let pdf102: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Recueils-des-actes-administratifs-annee-2026.html'), 'utf-8');
  htmlDetail101 = await readFile(path.join(FIXTURES_DIR, 'detail-101.html'), 'utf-8');
  htmlDetail102 = await readFile(path.join(FIXTURES_DIR, 'detail-102.html'), 'utf-8');
  pdf101 = await readFile(path.join(FIXTURES_DIR, 'numero-101.pdf'));
  pdf102 = await readFile(path.join(FIXTURES_DIR, 'numero-102.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_101) return { ok: true, status: 200, text: async () => htmlDetail101 } as unknown as Response;
      if (url === URL_DETAIL_102) return { ok: true, status: 200, text: async () => htmlDetail102 } as unknown as Response;
      if (url === URL_PDF_101) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf101.buffer.slice(pdf101.byteOffset, pdf101.byteOffset + pdf101.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_102) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf102.buffer.slice(pdf102.byteOffset, pdf102.byteOffset + pdf102.byteLength),
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

describe('connecteur réel prefecture-54 (récupération + traitement)', () => {
  it('résout la navigation (racine → année, motif en minuscule) et la page de détail par option (value)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-54');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-54');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('54');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('54-2026-102');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 19)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de Meurthe-et-Moselle');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_102);
  });
});
