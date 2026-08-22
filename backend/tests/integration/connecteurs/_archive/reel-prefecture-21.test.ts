import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-21`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-21/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-21')`, donc
 * le VRAI `configs/prefecture-21.yaml` déployé — y compris sa `navigation`
 * à UN SEUL niveau (racine → « année en cours », désambiguïsation d'une
 * racine à deux cartes, comme prefecture-2A), résolue dynamiquement à
 * partir de la date système : l'horloge est figée au 14/08/2026
 * (`vi.setSystemTime`) pour que ce test reste vrai après cette date. La
 * page « année en cours » liste TOUS les bulletins (pas de page mensuelle
 * séparée), chacun avec un lien PDF DIRECT porté par le même
 * `<a class="fr-link fr-link--download">` que le titre (pas de
 * `page_detail`) ; seul celui dont le PDF est mocké avec un texte pertinent
 * (142) produit un candidat — l'autre bulletin mocké (141) retombe sur un
 * PDF sans mot-clé rave/teknival, donc écarté sans provoquer d'échec ; le
 * bulletin de juillet (fixture) n'est même pas mocké (aucune URL PDF
 * correspondante) et échoue silencieusement au téléchargement, sans
 * provoquer d'échec non plus (isolation par candidat).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-21');

const URL_RACINE = 'https://www.cote-dor.gouv.fr/Publications/Recueils-des-Actes-Administratifs';
const URL_ANNEE_EN_COURS =
  'https://www.cote-dor.gouv.fr/Publications/Recueils-des-Actes-Administratifs/Recueils-des-actes-administratifs-de-l-annee-en-cours';
const URL_PDF_AVEC_ARRETE =
  'https://www.cote-dor.gouv.fr/contenu/telechargement/26752/204638/file/recueil-21-2026-142-recueil-des-actes-administratifs.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.cote-dor.gouv.fr/contenu/telechargement/26728/204463/file/recueil-21-2026-141-recueil-des-actes-administratifs-nominatifs.pdf';

let htmlRacine: string;
let htmlAnneeEnCours: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnneeEnCours = await readFile(path.join(FIXTURES_DIR, 'annee-en-cours.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_EN_COURS)
        return { ok: true, status: 200, text: async () => htmlAnneeEnCours } as unknown as Response;
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

describe('connecteur réel prefecture-21 (récupération + traitement)', () => {
  it('résout la navigation à 1 seul niveau (racine → année en cours, désambiguïsation) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-21');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-21');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('21');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('21-2026-142-001');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète de la Côte-d\'Or');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
