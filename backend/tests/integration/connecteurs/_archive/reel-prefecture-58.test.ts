import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 58-61) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-58`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à un niveau (racine → carte de l'année), puis `page_detail`
 * (attribut par défaut `href`, l'élément est un `<a>`) — même famille que
 * prefecture-44/77/51/54.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-58');

const URL_RACINE = 'https://www.nievre.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.nievre.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-annee-2026';
const URL_DETAIL_274 =
  'https://www.nievre.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-annee-2026/recueil-58-2026-274-recueil-des-actes-administratifs-special';
const URL_DETAIL_271 =
  'https://www.nievre.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-annee-2026/n-58-2026-271-special-du-14-aout-2026';
const URL_PDF_274 =
  'https://www.nievre.gouv.fr/contenu/telechargement/25462/210711/file/recueil-58-2026-274-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_271 =
  'https://www.nievre.gouv.fr/contenu/telechargement/25459/210688/file/n-58-2026-271-special-du-14-aout-2026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail274: string;
let htmlDetail271: string;
let pdf274: Buffer;
let pdf271: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-annee-2026.html'), 'utf-8');
  htmlDetail274 = await readFile(path.join(FIXTURES_DIR, 'detail-274.html'), 'utf-8');
  htmlDetail271 = await readFile(path.join(FIXTURES_DIR, 'detail-271.html'), 'utf-8');
  pdf274 = await readFile(path.join(FIXTURES_DIR, 'raa-58-2026-274.pdf'));
  pdf271 = await readFile(path.join(FIXTURES_DIR, 'raa-58-2026-271.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_274) return { ok: true, status: 200, text: async () => htmlDetail274 } as unknown as Response;
      if (url === URL_DETAIL_271) return { ok: true, status: 200, text: async () => htmlDetail271 } as unknown as Response;
      if (url === URL_PDF_274) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf274.buffer.slice(pdf274.byteOffset, pdf274.byteOffset + pdf274.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_271) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf271.buffer.slice(pdf271.byteOffset, pdf271.byteOffset + pdf271.byteLength),
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

describe('connecteur réel prefecture-58 (récupération + traitement)', () => {
  it('résout la navigation (racine → année) et la page_detail (attribut href par défaut) vers le bon candidat', async () => {
    const connecteur = await obtenirConnecteur('prefecture-58');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (recueil 274, pertinent), ignore le 271 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-58');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('58');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('58-2026-274');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Nièvre');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_274);
  });
});
