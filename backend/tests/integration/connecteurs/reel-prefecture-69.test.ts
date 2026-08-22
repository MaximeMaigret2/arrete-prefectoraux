import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 67-71) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-69`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → carte de l'année → carte du mois,
 * motif "Recueils-d(e)?-{mois_fr_minuscule}$" couvrant l'élision devant
 * voyelle). Liste finale (mois d'août) : liste plate sans pagination,
 * même famille que 37/41/45/49/52/55/59/62/65/66.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-69');

const URL_RACINE = 'https://www.rhone.gouv.fr/Publications/Recueil-des-actes-administratifs-du-Rhone-RAA';
const URL_ANNEE = 'https://www.rhone.gouv.fr/Publications/Recueil-des-actes-administratifs-du-Rhone-RAA/Recueils-de-2026';
const URL_MOIS = 'https://www.rhone.gouv.fr/Publications/Recueil-des-actes-administratifs-du-Rhone-RAA/Recueils-de-2026/Recueils-d-aout';
const URL_PDF_248 = 'https://www.rhone.gouv.fr/contenu/telechargement/69937/471225/file/RAA_69-2026-248-190826.pdf';
const URL_PDF_249 = 'https://www.rhone.gouv.fr/contenu/telechargement/69945/471265/file/RAA_69-2026-249-200826.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdf248: Buffer;
let pdf249: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Recueils-de-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Recueils-d-aout.html'), 'utf-8');
  pdf248 = await readFile(path.join(FIXTURES_DIR, 'raa-69-248.pdf'));
  pdf249 = await readFile(path.join(FIXTURES_DIR, 'raa-69-249.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_PDF_248) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf248.buffer.slice(pdf248.byteOffset, pdf248.byteOffset + pdf248.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_249) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf249.buffer.slice(pdf249.byteOffset, pdf249.byteOffset + pdf249.byteLength),
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

describe('connecteur réel prefecture-69 (récupération + traitement)', () => {
  it("résout la navigation à deux niveaux (racine → année → mois, élision d'/de)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-69');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (249, pertinent), ignore le 248 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-69');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('69');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('69-2026-249-200826');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 26)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Rhône');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_249);
  });
});
