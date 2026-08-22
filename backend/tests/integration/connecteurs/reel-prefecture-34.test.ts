import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14, lot 31-36) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-34`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-34/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-34')`, donc
 * le VRAI `configs/prefecture-34.yaml` déployé — y compris sa `navigation`
 * à UN SEUL niveau (racine → année), résolue dynamiquement à partir de la
 * date système figée au 14/08/2026 (`vi.setSystemTime`). `selecteur_publications`
 * qualifié dès la conception (`div[class=""]:has(...)`) évite le piège
 * `:has()` par remontée d'ancêtres découvert au lot 26-30.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-34');

const URL_RACINE = 'https://www.herault.gouv.fr/Publications/Recueils-des-actes-administratifs';
const URL_ANNEE = 'https://www.herault.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueil-des-actes-administratifs-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.herault.gouv.fr/contenu/telechargement/57678/420917/file/2026-08-14-211_Recueil_n%C2%B0211_du_14_ao%C3%BBt_2026_Partie-2.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.herault.gouv.fr/contenu/telechargement/57677/420912/file/2026-08-14-211_Recueil_n%C2%B0211_du_14_ao%C3%BBt_2026_Partie-1.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'recueil-2026.html'), 'utf-8');
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

describe('connecteur réel prefecture-34 (récupération + traitement)', () => {
  it('résout la navigation à 1 seul niveau (racine → année) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-34');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre informatif mais insuffisant, jamais fiable seul)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-34');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('34');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('34-2026-08-14-00211');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète de l\'Hérault');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
