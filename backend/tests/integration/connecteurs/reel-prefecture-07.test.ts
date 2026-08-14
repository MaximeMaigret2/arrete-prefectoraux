import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie 2 (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-07`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-07/,
 * cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-07')`, donc
 * le VRAI `configs/prefecture-07.yaml` déployé — navigation à 2 niveaux
 * (année → mois SANS suffixe d'année, `pattern_lien: "/{mois_fr}$"`),
 * liste finale non paginée. Horloge figée au 13/08/2026. Vérifie aussi que
 * le bug de markup réel (`<a id= class="...">`, class cassée) est
 * correctement contourné par `a[href$='.pdf']`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-07');

const URL_RACINE = 'https://www.ardeche.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.ardeche.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-2026';
const URL_MOIS = 'https://www.ardeche.gouv.fr/Publications/Recueil-des-actes-administratifs/RAA-2026/Aout';
const URL_PDF_AVEC_ARRETE =
  "https://www.ardeche.gouv.fr/contenu/telechargement/34242/275320/file/recueil-07-2026-257-recueil-du%2012%20ao%C3%BBt%202026.pdf";
const URL_PDF_SANS_ARRETE =
  "https://www.ardeche.gouv.fr/contenu/telechargement/34138/274587/file/recueil-07-2026-249-recueil-du%2005%20ao%C3%BBt%202026%20special-1.pdf";

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
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

describe('Phase 5bis élargie 2 — connecteur réel prefecture-07 (récupération + traitement)', () => {
  it("résout la navigation (racine → année → mois sans suffixe d'année) et contourne le bug de markup (id vide cassant `class`) via `a[href$='.pdf']`", async () => {
    const connecteur = await obtenirConnecteur('prefecture-07');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-07');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('07');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('07-2026-08-249');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le Préfet de l'Ardèche");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
