import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-2A`, contre une reconstruction fidèle de la structure du
 * site (backend/tests/fixtures/connecteurs/reel/prefecture-2A/, cf.
 * SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel dans
 * cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-2A')`, donc
 * le VRAI `configs/prefecture-2A.yaml` déployé — y compris sa `navigation`
 * à 2 niveaux (racine → « Recueil de la préfecture de la Corse-du-Sud » →
 * année), résolue dynamiquement à partir de la date système : l'horloge
 * est figée au 14/08/2026 (`vi.setSystemTime`) pour que ce test reste vrai
 * après cette date. La première étape désambiguïse la carte « préfecture
 * de la Corse-du-Sud » de la carte « Région Corse », toutes deux présentes
 * à la racine — situation nouvelle parmi les 21 connecteurs précédents. La
 * page de l'année liste tous les bulletins (pas de page mensuelle
 * séparée), chacun avec un lien PDF DIRECT porté par le même
 * `<a class="fr-link fr-link--download">` que le titre (pas de
 * `page_detail`, comme prefecture-01/13/17/18/19/33/77) ; seul celui dont
 * le PDF est mocké avec un texte pertinent (103) produit un candidat —
 * l'autre bulletin mocké (102) retombe sur un PDF sans mot-clé
 * rave/teknival, donc écarté sans provoquer d'échec ; le bulletin de
 * juillet (fixture, 097) n'est même pas mocké (aucune URL PDF
 * correspondante) et échoue silencieusement au téléchargement, sans
 * provoquer d'échec non plus (isolation par candidat).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-2A');

const URL_RACINE = 'https://www.corse-du-sud.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_RECUEIL_PREFECTURE =
  'https://www.corse-du-sud.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueil-des-actes-administratifs-de-la-prefecture-de-la-Corse-du-Sud';
const URL_ANNEE =
  'https://www.corse-du-sud.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueil-des-actes-administratifs-de-la-prefecture-de-la-Corse-du-Sud/Recueils-des-actes-administratifs-de-l-annee-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.corse-du-sud.gouv.fr/contenu/telechargement/18361/118677/file/recueil-2a-2026-103-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.corse-du-sud.gouv.fr/contenu/telechargement/18338/118518/file/recueil-2a-2026-102-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlRecueilPrefecture: string;
let htmlAnnee: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlRecueilPrefecture = await readFile(path.join(FIXTURES_DIR, 'recueil-prefecture.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_RECUEIL_PREFECTURE)
        return { ok: true, status: 200, text: async () => htmlRecueilPrefecture } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
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

describe('connecteur réel prefecture-2A (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → recueil-préfecture → année), désambiguïsant la carte "préfecture" de la carte "Région Corse", puis ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable', async () => {
    const connecteur = await obtenirConnecteur('prefecture-2A');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-2A');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('2A');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('2A-2026-08-14-00003');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de Corse, préfet de la Corse-du-Sud');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
