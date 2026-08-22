import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 42-46) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-46`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké —
 * aucun appel réseau réel.
 *
 * Navigation à DEUX niveaux (racine → année → dernière page de pagination) ;
 * chaque publication mène à une page de DÉTAIL HTML où le lien de
 * téléchargement porte la classe `a.fr-link--download` (pas de piège de
 * balisage ici, à la différence de prefecture-40) — même famille
 * `page_detail` que prefecture-02/40/77, pagination confirmée comme
 * prefecture-02/39/40.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-46');

const URL_RACINE = 'https://www.lot.gouv.fr/Publications/Recueil-des-Actes-Administratifs';
const URL_ANNEE = 'https://www.lot.gouv.fr/Publications/Recueil-des-Actes-Administratifs/RAA-2026';
const URL_ANNEE_DERNIERE_PAGE = 'https://www.lot.gouv.fr/Publications/Recueil-des-Actes-Administratifs/RAA-2026/(offset)/80';
const URL_DETAIL_SANS = 'https://www.lot.gouv.fr/Publications/Recueil-des-Actes-Administratifs/RAA-2026/RAA-special-46-2026-083';
const URL_DETAIL_AVEC = 'https://www.lot.gouv.fr/Publications/Recueil-des-Actes-Administratifs/RAA-2026/RAA-special-46-2026-084';
const URL_PDF_SANS_ARRETE =
  'https://www.lot.gouv.fr/contenu/telechargement/25980/194700/file/recueil-46-2026-083-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_AVEC_ARRETE =
  'https://www.lot.gouv.fr/contenu/telechargement/26011/194842/file/recueil-46-2026-084-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlAnneeDernierePage: string;
let htmlDetailAvec: string;
let htmlDetailSans: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 18, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-2026.html'), 'utf-8');
  htmlAnneeDernierePage = await readFile(path.join(FIXTURES_DIR, 'RAA-2026-offset-80.html'), 'utf-8');
  htmlDetailAvec = await readFile(path.join(FIXTURES_DIR, 'detail-084.html'), 'utf-8');
  htmlDetailSans = await readFile(path.join(FIXTURES_DIR, 'detail-083.html'), 'utf-8');
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

describe('connecteur réel prefecture-46 (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → année → dernière page de pagination) puis chaque page de détail avant le PDF, et ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-46');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-46');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('46');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('46-2026-084');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète du Lot');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
