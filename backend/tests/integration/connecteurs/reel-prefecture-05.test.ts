import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-05`, le plus profond des 5 nouveaux
 * connecteurs (3 niveaux de `navigation`, dont un `optionnelle` PRÉSENT dans
 * cette fixture, ET `page_detail`), contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-05/,
 * cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Couvre aussi implicitement le bug de markup réel de la page de détail
 * (`<a id= class="fr-link fr-link--download" ...>`, qui casse l'attribut
 * `class` — cf. SOURCE.md) : les fixtures `detail-327.html`/`detail-320.html`
 * reproduisent ce HTML malformé tel quel, et `prefecture-05.yaml` cible
 * `a[href$='.pdf']` plutôt que la classe cassée — si ce sélecteur régresse
 * vers la classe, ce test échoue immédiatement (`echec_global` ou 0
 * candidat). Horloge figée au 13/08/2026 (`vi.setSystemTime`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-05');

const URL_RACINE = 'https://www.hautes-alpes.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.hautes-alpes.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-2026';
const URL_MOIS = 'https://www.hautes-alpes.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-2026/Aout-2026';
const URL_DERNIERE_PAGE =
  'https://www.hautes-alpes.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-2026/Aout-2026/(offset)/10';
const URL_DETAIL_327 =
  'https://www.hautes-alpes.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-2026/RAA-N-05-2026-327-Special-Aout';
const URL_DETAIL_320 =
  'https://www.hautes-alpes.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-2026/RAA-N-05-2026-320';
const URL_PDF_AVEC_ARRETE =
  'https://www.hautes-alpes.gouv.fr/contenu/telechargement/15001/85001/file/RAA-N-05-2026-327-Special-Aout.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.hautes-alpes.gouv.fr/contenu/telechargement/15002/85002/file/RAA-N-05-2026-320.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let htmlDernierePage: string;
let htmlDetail327: string;
let htmlDetail320: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'mois-aout-2026.html'), 'utf-8');
  htmlDernierePage = await readFile(path.join(FIXTURES_DIR, 'derniere-page.html'), 'utf-8');
  htmlDetail327 = await readFile(path.join(FIXTURES_DIR, 'detail-327.html'), 'utf-8');
  htmlDetail320 = await readFile(path.join(FIXTURES_DIR, 'detail-320.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_DERNIERE_PAGE) {
        return { ok: true, status: 200, text: async () => htmlDernierePage } as unknown as Response;
      }
      if (url === URL_DETAIL_327) return { ok: true, status: 200, text: async () => htmlDetail327 } as unknown as Response;
      if (url === URL_DETAIL_320) return { ok: true, status: 200, text: async () => htmlDetail320 } as unknown as Response;
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

describe('Phase 5bis élargie — connecteur réel prefecture-05 (récupération + traitement)', () => {
  it('résout la navigation (racine → année → mois → dernière page) et la page de détail malgré le markup cassé, pour ignorer le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-05');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it("extrait correctement le candidat depuis le texte du PDF atteint via la page de détail (texte de l'ancre jamais suffisant)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-05');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('05');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('05-2026-08-327');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet des Hautes-Alpes');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
