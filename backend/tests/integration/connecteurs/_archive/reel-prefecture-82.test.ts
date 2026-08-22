import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 78-82) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-82`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → année "RAA-de-{annee}$" → mois
 * "RAA-d(e)?-{mois_fr}-{annee}$", élision d/de comme prefecture-69/Rhône).
 * Liste finale : liste plate sans pagination,
 * `div[class='']:has(a.fr-link--download)`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-82');

const URL_RACINE = 'https://www.tarn-et-garonne.gouv.fr/Publications/Recueils-des-actes-administratifs';
const URL_ANNEE_2026 = 'https://www.tarn-et-garonne.gouv.fr/Publications/Recueils-des-actes-administratifs/RAA-de-2026';
const URL_AOUT =
  'https://www.tarn-et-garonne.gouv.fr/Publications/Recueils-des-actes-administratifs/RAA-de-2026/RAA-d-Aout-2026';
const URL_PDF_2 = 'https://www.tarn-et-garonne.gouv.fr/telechargement/RAA_special_n2_aout_2026.pdf';
const URL_PDF_1 = 'https://www.tarn-et-garonne.gouv.fr/telechargement/RAA_special_n1_aout_2026.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let htmlAout: string;
let pdf2: Buffer;
let pdf1: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  pdf2 = await readFile(path.join(FIXTURES_DIR, 'raa-82-2026-special-2.pdf'));
  pdf1 = await readFile(path.join(FIXTURES_DIR, 'raa-82-2026-special-1.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_PDF_2) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf2.buffer.slice(pdf2.byteOffset, pdf2.byteOffset + pdf2.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_1) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf1.buffer.slice(pdf1.byteOffset, pdf1.byteOffset + pdf1.byteLength),
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

describe('connecteur réel prefecture-82 (récupération + traitement)', () => {
  it('résout les 2 publications du mois courant via le motif "RAA-d(e)?-{mois_fr}-{annee}" (élision)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-82');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (spécial n°2, pertinent), ignore le n°1 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-82');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('82');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('82-2026-08-06-002');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 26)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de Tarn-et-Garonne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_2);
  });
});
