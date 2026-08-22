import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 47-51) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-50`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké —
 * aucun appel réseau réel.
 *
 * Navigation à TROIS niveaux (racine → année → [pagination CONDITIONNELLE,
 * nouvelle technique cette session : `periodes` appliquée à l'étape de
 * pagination elle-même, motif inatteignable pour janvier-septembre] →
 * mois) puis publications `p:not([class]):has(a.fr-link)`.
 *
 * DEUX scénarios de date système pour couvrir les deux branches de la
 * pagination conditionnelle : août (mois déjà présent page 1, aucun saut
 * de pagination) et novembre (mois présent uniquement page 2, saut requis).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-50');

const URL_RACINE = 'https://www.manche.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.manche.gouv.fr/Publications/Recueil-des-actes-administratifs/2026';
const URL_ANNEE_PAGE2 = 'https://www.manche.gouv.fr/Publications/Recueil-des-actes-administratifs/2026/(offset)/10';
const URL_MOIS_AOUT = 'https://www.manche.gouv.fr/Publications/Recueil-des-actes-administratifs/2026/9.-Aout';
const URL_MOIS_NOVEMBRE = 'https://www.manche.gouv.fr/Publications/Recueil-des-actes-administratifs/2026/13.-Novembre';
const URL_PDF_AOUT_AVEC = 'https://www.manche.gouv.fr/contenu/telechargement/71855/550077/file/RAA-50-2026-146.pdf';
const URL_PDF_AOUT_SANS = 'https://www.manche.gouv.fr/contenu/telechargement/71592/547919/file/RAA-50-2026-142.pdf';
const URL_PDF_NOVEMBRE_AVEC = 'https://www.manche.gouv.fr/contenu/telechargement/80100/600100/file/RAA-50-2026-201.pdf';
const URL_PDF_NOVEMBRE_SANS = 'https://www.manche.gouv.fr/contenu/telechargement/80090/600050/file/RAA-50-2026-200.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlAnneePage2: string;
let htmlMoisAout: string;
let htmlMoisNovembre: string;
let pdfAoutAvec: Buffer;
let pdfAoutSans: Buffer;
let pdfNovembreAvec: Buffer;
let pdfNovembreSans: Buffer;

beforeEach(async () => {
  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026.html'), 'utf-8');
  htmlAnneePage2 = await readFile(path.join(FIXTURES_DIR, 'offset-10.html'), 'utf-8');
  htmlMoisAout = await readFile(path.join(FIXTURES_DIR, '9.-Aout.html'), 'utf-8');
  htmlMoisNovembre = await readFile(path.join(FIXTURES_DIR, '13.-Novembre.html'), 'utf-8');
  pdfAoutAvec = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfAoutSans = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));
  pdfNovembreAvec = await readFile(path.join(FIXTURES_DIR, 'bulletin-novembre-avec-arrete.pdf'));
  pdfNovembreSans = await readFile(path.join(FIXTURES_DIR, 'bulletin-novembre-sans-arrete.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_ANNEE_PAGE2) return { ok: true, status: 200, text: async () => htmlAnneePage2 } as unknown as Response;
      if (url === URL_MOIS_AOUT) return { ok: true, status: 200, text: async () => htmlMoisAout } as unknown as Response;
      if (url === URL_MOIS_NOVEMBRE) return { ok: true, status: 200, text: async () => htmlMoisNovembre } as unknown as Response;
      const pdfs: Record<string, Buffer> = {
        [URL_PDF_AOUT_AVEC]: pdfAoutAvec,
        [URL_PDF_AOUT_SANS]: pdfAoutSans,
        [URL_PDF_NOVEMBRE_AVEC]: pdfNovembreAvec,
        [URL_PDF_NOVEMBRE_SANS]: pdfNovembreSans,
      };
      const pdf = pdfs[url];
      if (pdf) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength),
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

describe('connecteur réel prefecture-50 (récupération + traitement)', () => {
  describe('mois déjà présent sur la page 1 (août — aucun saut de pagination)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 18, 10, 0, 0)));
    });

    it("résout la navigation SANS suivre la pagination (le motif de l'étape periodes janvier-septembre est délibérément inatteignable) et ignore le bulletin sans arrêté", async () => {
      const connecteur = await obtenirConnecteur('prefecture-50');
      const resultat = await connecteur!.collecter();

      expect(resultat.echec_global).toBeUndefined();
      expect(resultat.candidats).toHaveLength(1);
      expect(resultat.candidats[0].reference_arrete).toBe('50-2026-146');
      expect(resultat.candidats[0].source.url).toBe(URL_PDF_AOUT_AVEC);
      expect(resultat.candidats[0].autorite_signataire).toBe('Le préfet de la Manche');
    });
  });

  describe('mois présent uniquement page 2 (novembre — saut de pagination requis)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(Date.UTC(2026, 10, 6, 10, 0, 0)));
    });

    it('résout la navigation EN suivant la pagination vers la dernière page puis trouve le mois de novembre', async () => {
      const connecteur = await obtenirConnecteur('prefecture-50');
      const resultat = await connecteur!.collecter();

      expect(resultat.echec_global).toBeUndefined();
      expect(resultat.candidats).toHaveLength(1);
      expect(resultat.candidats[0].reference_arrete).toBe('50-2026-201');
      expect(resultat.candidats[0].date_debut).toBe(new Date(Date.UTC(2026, 10, 5)).toISOString());
      expect(resultat.candidats[0].date_fin).toBe(new Date(Date.UTC(2026, 10, 8)).toISOString());
      expect(resultat.candidats[0].source.url).toBe(URL_PDF_NOVEMBRE_AVEC);
    });
  });
});
