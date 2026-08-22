import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-18, lot 37-41) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-40`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, 2026-08-18 — cf.
 * SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel.
 *
 * Navigation à DEUX niveaux (racine → année, segment nu "/2026" → dernière
 * page de pagination) ; chaque publication mène à une page de DÉTAIL HTML
 * où le lien de téléchargement vit dans `.fr-downloads-group` (PAS
 * `a.fr-link--download`, classe absente en pratique sur ce site — piège
 * confirmé en live) — même famille `page_detail` que prefecture-02/77,
 * pagination confirmée comme prefecture-02/39.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-40');

const URL_RACINE = 'https://www.landes.gouv.fr/Publications/Publications-legales/Le-Recueil-des-Actes-Administratifs-RAA';
const URL_ANNEE = 'https://www.landes.gouv.fr/Publications/Publications-legales/Le-Recueil-des-Actes-Administratifs-RAA/2026';
const URL_ANNEE_DERNIERE_PAGE =
  'https://www.landes.gouv.fr/Publications/Publications-legales/Le-Recueil-des-Actes-Administratifs-RAA/2026/(offset)/260';
const URL_DETAIL_SANS =
  'https://www.landes.gouv.fr/Publications/Publications-legales/Le-Recueil-des-Actes-Administratifs-RAA/2026/RAA-n-231-du-12-aout';
const URL_DETAIL_AVEC =
  'https://www.landes.gouv.fr/Publications/Publications-legales/Le-Recueil-des-Actes-Administratifs-RAA/2026/RAAS-n-73-du-14-aout';
const URL_PDF_SANS_ARRETE =
  'https://www.landes.gouv.fr/contenu/telechargement/33220/275610/file/recueil-40-2026-08-12-00231-recueil-des-actes-administratifs.pdf';
const URL_PDF_AVEC_ARRETE =
  'https://www.landes.gouv.fr/contenu/telechargement/33221/275611/file/recueil-40-2026-08-14-00071-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlAnneeDernierePage: string;
let htmlDetailAvec: string;
let htmlDetailSans: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026.html'), 'utf-8');
  htmlAnneeDernierePage = await readFile(path.join(FIXTURES_DIR, '2026-offset-260.html'), 'utf-8');
  htmlDetailAvec = await readFile(path.join(FIXTURES_DIR, 'detail-73.html'), 'utf-8');
  htmlDetailSans = await readFile(path.join(FIXTURES_DIR, 'detail-231.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_ANNEE_DERNIERE_PAGE)
        return { ok: true, status: 200, text: async () => htmlAnneeDernierePage } as unknown as Response;
      if (url === URL_DETAIL_AVEC) return { ok: true, status: 200, text: async () => htmlDetailAvec } as unknown as Response;
      if (url === URL_DETAIL_SANS) return { ok: true, status: 200, text: async () => htmlDetailSans } as unknown as Response;
      if (url === URL_PDF_AVEC_ARRETE) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdfAvecArrete.buffer.slice(pdfAvecArrete.byteOffset, pdfAvecArrete.byteOffset + pdfAvecArrete.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_SANS_ARRETE) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdfSansArrete.buffer.slice(pdfSansArrete.byteOffset, pdfSansArrete.byteOffset + pdfSansArrete.byteLength),
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

describe('connecteur réel prefecture-40 (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → année → dernière page de pagination) puis chaque page de détail avant le PDF, et ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-40');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-40');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('40');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('40-2026-08-14-00071');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet des Landes');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
