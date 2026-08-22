import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-15, lot 37-41) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-37`, contre une reconstruction PAR EXTRAPOLATION de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-37/,
 * cf. SOURCE.md — AUCUNE capture live n'a pu être obtenue cette session,
 * fetch web bloqué sur tous les sous-chemins des 5 domaines de ce lot),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-37')`, donc
 * le VRAI `configs/prefecture-37.yaml` déployé — navigation à UN SEUL
 * niveau (racine → année), résolue dynamiquement à partir de la date
 * système figée au 14/08/2026 (`vi.setSystemTime`). Liste finale plate
 * (`div[class='']:has(a.fr-link--download)`), même famille que
 * prefecture-23/25/26/28/29/30/32/34/35.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-37');

const URL_RACINE = 'https://www.indre-et-loire.gouv.fr/Publications/Recueil-actes-administratifs';
const URL_ANNEE = 'https://www.indre-et-loire.gouv.fr/Publications/Recueil-actes-administratifs/Annee-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.indre-et-loire.gouv.fr/contenu/telechargement/50002/400002/file/recueil-37-2026-08-14-00087-recueil-des-actes-administratifs.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.indre-et-loire.gouv.fr/contenu/telechargement/50001/400001/file/recueil-37-2026-08-12-00085-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
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

describe('connecteur réel prefecture-37 (récupération + traitement)', () => {
  it('résout la navigation à 1 seul niveau (racine → année) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-37');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct', async () => {
    const connecteur = await obtenirConnecteur('prefecture-37');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('37');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('37-2026-08-14-00087');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le préfet d'Indre-et-Loire");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
