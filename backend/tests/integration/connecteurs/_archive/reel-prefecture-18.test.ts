import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-18`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-18/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-18')`, donc
 * le VRAI `configs/prefecture-18.yaml` déployé — y compris sa `navigation` à
 * 3 niveaux (racine → « Recueil des actes administratifs » → année → mois,
 * nouveau parmi les 20 connecteurs à ce jour, jusqu'ici maximum 2 niveaux),
 * résolue dynamiquement à partir de la date système : l'horloge est figée
 * au 14/08/2026 (`vi.setSystemTime`) pour que ce test reste vrai après
 * cette date. La page du mois liste 2 publications, chacune avec un lien
 * PDF DIRECT porté par le même `<a class="fr-link fr-link--download">` que
 * le titre (pas de `page_detail`, comme prefecture-01/13/17/33/77) ; seule
 * celle dont le PDF est mocké avec un texte pertinent (017) produit un
 * candidat — l'autre (015) retombe sur un PDF mocké non pertinent (aucun
 * mot-clé rave/teknival), donc écartée sans provoquer d'échec.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-18');

const URL_RACINE = 'https://www.cher.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA-Arretes-et-circulaires';
const URL_ANNEES =
  'https://www.cher.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA-Arretes-et-circulaires/Recueil-des-actes-administratifs';
const URL_ANNEE =
  'https://www.cher.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA-Arretes-et-circulaires/Recueil-des-actes-administratifs/2026';
const URL_MOIS =
  'https://www.cher.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA-Arretes-et-circulaires/Recueil-des-actes-administratifs/2026/Aout';
const URL_PDF_AVEC_ARRETE =
  'https://www.cher.gouv.fr/contenu/telechargement/44674/341659/file/recueil-18-2026-08-017-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.cher.gouv.fr/contenu/telechargement/44667/341613/file/recueil-18-2026-08-015-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnees: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnees = await readFile(path.join(FIXTURES_DIR, 'annees.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'aout-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEES) return { ok: true, status: 200, text: async () => htmlAnnees } as unknown as Response;
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

describe('connecteur réel prefecture-18 (récupération + traitement)', () => {
  it('résout la navigation à 3 niveaux (racine → « Recueil » → année → mois) puis ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable', async () => {
    const connecteur = await obtenirConnecteur('prefecture-18');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-18');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('18');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('18-2026-08-017-001');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet du Cher');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
