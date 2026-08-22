import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 52-56) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-55`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Racine sans carte DSFR : sélecteur d'année en `<select>` dès la
 * première étape de navigation (`attribut_lien: "value"`, même idiome
 * que prefecture-17), puis liste plate `div[class='']` — même famille
 * que prefecture-37/41/45/49. Pas de `page_detail`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-55');

const URL_RACINE = 'https://www.meuse.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA';
const URL_ANNEE = 'https://www.meuse.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA/RAA-annee-2026';
const URL_PDF_108 = 'https://www.meuse.gouv.fr/contenu/telechargement/36999/259900/file/RAA%20n%C2%B0108%20du%2018%20ao%C3%BBt%202026.pdf';
const URL_PDF_107 = 'https://www.meuse.gouv.fr/contenu/telechargement/36990/259850/file/RAA%20n%C2%B0107%20du%2017%20ao%C3%BBt%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf108: Buffer;
let pdf107: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-annee-2026.html'), 'utf-8');
  pdf108 = await readFile(path.join(FIXTURES_DIR, 'raa-n-108.pdf'));
  pdf107 = await readFile(path.join(FIXTURES_DIR, 'raa-n-107.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_108) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf108.buffer.slice(pdf108.byteOffset, pdf108.byteOffset + pdf108.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_107) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf107.buffer.slice(pdf107.byteOffset, pdf107.byteOffset + pdf107.byteLength),
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

describe('connecteur réel prefecture-55 (récupération + traitement)', () => {
  it('résout la navigation (racine sans carte, sélecteur en <select>) vers la liste plate de l’année', async () => {
    const connecteur = await obtenirConnecteur('prefecture-55');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF', async () => {
    const connecteur = await obtenirConnecteur('prefecture-55');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('55');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('55-2026-108');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète de la Meuse');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_108);
  });
});
