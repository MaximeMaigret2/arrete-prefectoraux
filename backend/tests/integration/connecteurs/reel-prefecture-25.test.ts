import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-25`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-25/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * `bulletin-avec-arrete.pdf` est SYNTHÉTIQUE (contrairement à
 * prefecture-23) : le vrai bulletin correspondant (recueil-25-2026-188,
 * cf. SOURCE.md) contient bien un arrêté anti rave-party réel actuellement
 * en vigueur, mais son corps est une IMAGE SCANNÉE — `pdf-parse` (le
 * moteur `pdf` du projet, jamais d'OCR, FR-005) n'y extrait que le
 * sommaire/en-tête, sans date ni référence exploitable. Ce test démontre
 * donc le chemin d'extraction NOMINAL (texte natif complet), pas le
 * comportement réel de ce bulletin scanné spécifique (documenté séparément
 * dans SOURCE.md, pas testé littéralement ici).
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-25')`, donc
 * le VRAI `configs/prefecture-25.yaml` déployé — y compris sa `navigation`
 * à UN SEUL niveau (racine → année), résolue dynamiquement à partir de la
 * date système figée au 14/08/2026 (`vi.setSystemTime`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-25');

const URL_RACINE = 'https://www.doubs.gouv.fr/Publications/Publications-Legales/Recueil-des-Actes-Administratifs-RAA';
const URL_ANNEE =
  'https://www.doubs.gouv.fr/Publications/Publications-Legales/Recueil-des-Actes-Administratifs-RAA/Recueil-des-actes-administratifs-pour-le-Doubs-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.doubs.gouv.fr/contenu/telechargement/46971/312787/file/recueil-25-2026-188-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.doubs.gouv.fr/contenu/telechargement/46981/312837/file/recueil-25-2026-189-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
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

describe('connecteur réel prefecture-25 (récupération + traitement)', () => {
  it('résout la navigation à 1 seul niveau (racine → année) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-25');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-25');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('25');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('25-2026-08-13-00001');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Doubs');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
