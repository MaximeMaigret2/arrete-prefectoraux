import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * V004/V001c (Phase 5bis, 2026-08-13) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-33`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-33/,
 * cf. SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel dans
 * cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-33')`, donc
 * le VRAI `configs/prefecture-33.yaml` déployé — y compris sa `navigation`
 * à 2 niveaux (année → mois), résolue dynamiquement à partir de la date
 * système : l'horloge est figée au 13/08/2026 (`vi.setSystemTime`) pour que
 * ce test reste vrai après cette date.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-33');

const URL_RACINE = 'https://www.gironde.gouv.fr/Publications/Recueil-des-Actes-Administratifs';
const URL_ANNEE =
  'https://www.gironde.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-de-l-annee-2026';
const URL_MOIS =
  'https://www.gironde.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-de-l-annee-2026/Aout-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.gironde.gouv.fr/contenu/telechargement/87963/661802/file/RAA%2033%20SPECIAL%20N%C2%B0%202026-243.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.gironde.gouv.fr/contenu/telechargement/87951/661682/file/recueil-33-2026-242-recueil-des-actes-administratifs-special-1.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'aout-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
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

describe('Phase 5bis — connecteur réel prefecture-33 (V004/V001c, récupération + traitement)', () => {
  it('résout la navigation (racine → année → mois) puis ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable', async () => {
    const connecteur = await obtenirConnecteur('prefecture-33');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-33');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('33');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('33-2026-08-243');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 3)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 5)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet de la Gironde');
    // Source = le PDF réellement lu, atteint via la page de mois résolue par
    // navigation — pas la page liste (contrat SC-002).
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
