import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie 2 (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-09`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-09/,
 * cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-09')`, donc
 * le VRAI `configs/prefecture-09.yaml` déployé — navigation à 2 niveaux :
 * un motif LITTÉRAL fixe (collection "à partir du 28 avril 2015", pas de
 * placeholder de date) puis `-{mois_fr}-{annee}$` (mois courant). Horloge
 * figée au 13/08/2026.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-09');

const URL_RACINE = 'https://www.ariege.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_COLLECTION =
  'https://www.ariege.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueils-des-Actes-Administratifs-de-l-Ariege-a-partir-du-28-avril-2015';
const URL_MOIS =
  'https://www.ariege.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueils-des-Actes-Administratifs-de-l-Ariege-a-partir-du-28-avril-2015/Recueil-des-actes-administratifs-du-mois-Aout-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.ariege.gouv.fr/contenu/telechargement/35188/239161/file/recueil-09-2026-124-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.ariege.gouv.fr/contenu/telechargement/35181/239110/file/recueil-09-2026-123-recueil-des-actes-administratifs-1.pdf';

let htmlRacine: string;
let htmlCollection: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlCollection = await readFile(path.join(FIXTURES_DIR, 'collection-2015.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'mois-aout-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_COLLECTION) {
        return { ok: true, status: 200, text: async () => htmlCollection } as unknown as Response;
      }
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

describe('Phase 5bis élargie 2 — connecteur réel prefecture-09 (récupération + traitement)', () => {
  it('résout la navigation (racine → collection fixe littérale → mois courant) puis ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable', async () => {
    const connecteur = await obtenirConnecteur('prefecture-09');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-09');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('09');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('09-2026-08-124');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le Préfet de l'Ariège");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
