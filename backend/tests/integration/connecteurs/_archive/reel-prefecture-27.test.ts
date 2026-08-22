import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14, Phase 5bis élargie 10, lot 26-30) — "récupération +
 * traitement" du connecteur RÉEL `prefecture-27`, contre une reconstruction
 * fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-27/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-27')`, donc
 * le VRAI `configs/prefecture-27.yaml` déployé — y compris sa `navigation`
 * à UN SEUL niveau (racine → année), résolue dynamiquement à partir de la
 * date système figée au 14/08/2026 (`vi.setSystemTime`). La page de
 * l'année liste des cartes DSFR (`.fr-card__link`) pointant chacune vers
 * une page de DÉTAIL HTML (`page_detail`, comme prefecture-05/02/16/77) où
 * le vrai lien PDF est présent ; seule celle dont la page de détail est
 * mockée avec un PDF pertinent (252) produit un candidat — l'autre (251)
 * retombe sur un PDF sans mot-clé rave/teknival, et une troisième (247,
 * sans page de détail mockée) échoue silencieusement sa résolution PDF et
 * retombe sur le titre seul, jamais pertinent.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-27');

const URL_RACINE = 'https://www.eure.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA';
const URL_ANNEE = 'https://www.eure.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA/RAA-2026';
const URL_DETAIL_252 =
  'https://www.eure.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA/RAA-2026/Recueil-special-N-27-2026-252-du-14-oaut-2026';
const URL_DETAIL_251 =
  'https://www.eure.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA/RAA-2026/Recueil-special-N-27-2026-251-du-14-aout-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.eure.gouv.fr/contenu/telechargement/63660/470095/file/Recueil%20sp%C3%A9cial%20N%C2%B027-2026-252%20du%2014%20oa%C3%BBt%202026.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.eure.gouv.fr/contenu/telechargement/63655/470062/file/Recueil%20sp%C3%A9cial%20N%C2%B027-2026-251%20du%2014%20ao%C3%BBt%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail252: string;
let htmlDetail251: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-2026.html'), 'utf-8');
  htmlDetail252 = await readFile(path.join(FIXTURES_DIR, 'detail-252.html'), 'utf-8');
  htmlDetail251 = await readFile(path.join(FIXTURES_DIR, 'detail-251.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_252) return { ok: true, status: 200, text: async () => htmlDetail252 } as unknown as Response;
      if (url === URL_DETAIL_251) return { ok: true, status: 200, text: async () => htmlDetail251 } as unknown as Response;
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

describe('connecteur réel prefecture-27 (récupération + traitement)', () => {
  it('résout la navigation à 1 seul niveau (racine → année) puis ignore les bulletins sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-27');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF joint via la page de détail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-27');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('27');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('27-2026-08-14-00003');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le Préfet de l'Eure");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
