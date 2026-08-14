import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * V004 (Phase 5bis, 2026-08-13) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-13`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-13/,
 * cf. SOURCE.md pour ce qui a été vérifié en direct vs. supposé), `fetch`
 * entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-13')`, donc
 * le VRAI `configs/prefecture-13.yaml` déployé, pas une config de test
 * recopiée à la main : toute dérive entre ce test et la config réelle
 * ferait échouer ce test, pas juste un test unitaire isolé du moteur.
 *
 * Couvre les deux sens du filtrage sur contenu PDF (moteur étendu le
 * 2026-08-13, cf. moteurs/pageWeb/moteur.ts) : un bulletin contenant un
 * arrêté rave/teknival est retenu, un bulletin qui n'en contient pas est
 * ignoré — alors que dans les deux cas le TITRE de la publication (nom du
 * fichier) ne mentionne jamais le contenu.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-13');
const URL_LISTE = 'https://www.bouches-du-rhone.gouv.fr/Publications/RAA-et-Archives/RAA-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.bouches-du-rhone.gouv.fr/contenu/telechargement/65030/454163/file/recueil-13-2026-249-recueil-des-actes-administratifs-special-bis.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.bouches-du-rhone.gouv.fr/contenu/telechargement/65020/454100/file/recueil-13-2026-246-recueil-des-actes-administratifs-special.pdf';

let html: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  html = await readFile(path.join(FIXTURES_DIR, 'liste.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_LISTE) {
        return { ok: true, status: 200, text: async () => html } as unknown as Response;
      }
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
});

describe('Phase 5bis — connecteur réel prefecture-13 (V004, récupération + traitement)', () => {
  it("récupère la liste réelle, ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable", async () => {
    const connecteur = await obtenirConnecteur('prefecture-13');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    // Un seul candidat retenu sur les 2 bulletins de la fixture : celui du
    // bulletin "sans-arrete-pertinent" ne contient aucun mot-clé, ni dans
    // son titre (nom de fichier) ni dans le texte du PDF.
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (titre seul seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-13');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('13');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('13-2026-08-249');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet des Bouches-du-Rhône');
    // Source = le PDF réellement lu, pas la page liste (contrat SC-002 : la
    // source consultable doit être l'acte lui-même, pas son index).
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
