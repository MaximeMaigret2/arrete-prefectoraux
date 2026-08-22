import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie 3 (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-16`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-16/,
 * cf. SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel dans
 * cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-16')`, donc
 * le VRAI `configs/prefecture-16.yaml` déployé — y compris sa `navigation`
 * à 1 niveau (racine → année) et son `page_detail` (chaque publication du
 * bloc `.fr-text--lead` pointe vers une page de détail HTML, pas
 * directement un PDF — architecture structurellement nouvelle parmi les 18
 * connecteurs, cf. SOURCE.md), résolue dynamiquement à partir de la date
 * système : l'horloge est figée au 13/08/2026 (`vi.setSystemTime`) pour que
 * ce test reste vrai après cette date. La page liste 4 publications ; seules
 * les 2 dont le PDF est mocké (231 avec arrêté, 230 sans) ont une page de
 * détail simulée — les 2 autres (226, 001) retombent sur le 404 générique
 * du mock, sans PDF ni mot-clé pertinent dans leur titre, donc écartées
 * sans provoquer d'échec.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-16');

const URL_RACINE = 'https://www.charente.gouv.fr/Publications/Recueil-des-actes-administratifs2';
const URL_ANNEE = 'https://www.charente.gouv.fr/Publications/Recueil-des-actes-administratifs2/Annee-2026';
const URL_DETAIL_AVEC =
  'https://www.charente.gouv.fr/Media/Files/Publications/Recueil-des-actes-administratifs/RAA-2026/recueil-16-2026-231-recueil-des-actes-administratifs';
const URL_DETAIL_SANS =
  'https://www.charente.gouv.fr/Media/Files/Publications/Recueil-des-actes-administratifs/RAA-2026/recueil-16-2026-230-recueil-des-actes-administratifs';
const URL_PDF_AVEC_ARRETE =
  'https://www.charente.gouv.fr/contenu/telechargement/53500/422850/file/recueil-16-2026-231-recueil-des-actes-administratifs.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.charente.gouv.fr/contenu/telechargement/53499/422848/file/recueil-16-2026-230-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetailAvec: string;
let htmlDetailSans: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlDetailAvec = await readFile(path.join(FIXTURES_DIR, 'detail-231.html'), 'utf-8');
  htmlDetailSans = await readFile(path.join(FIXTURES_DIR, 'detail-230.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_AVEC)
        return { ok: true, status: 200, text: async () => htmlDetailAvec } as unknown as Response;
      if (url === URL_DETAIL_SANS)
        return { ok: true, status: 200, text: async () => htmlDetailSans } as unknown as Response;
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

describe('Phase 5bis élargie 3 — connecteur réel prefecture-16 (récupération + traitement)', () => {
  it('résout la navigation (racine → année) puis, via page_detail, ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable', async () => {
    const connecteur = await obtenirConnecteur('prefecture-16');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-16');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('16');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('16-2026-08-231');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet de la Charente');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
