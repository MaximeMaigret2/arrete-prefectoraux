import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-20, lot 62-66) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-66`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année) ; liste plate finale
 * sans pagination (`div[class='']:has(a.fr-link--download)`, même famille
 * que 37/41/45/49/52/55/59/62/65). Particularité : liens d'année en
 * `<h3><a>` (pas de `.fr-card`), avec un lien factice "[TEST] RAA" dans le
 * menu latéral que `selecteur_liens: "h3 a"` exclut naturellement.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-66');

const URL_RACINE = 'https://www.pyrenees-orientales.gouv.fr/Publications/Le-recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.pyrenees-orientales.gouv.fr/Publications/Le-recueil-des-actes-administratifs/Annee-2026';
const URL_PDF_0819 =
  'https://www.pyrenees-orientales.gouv.fr/contenu/telechargement/50200/381374/file/Recueil%20du%2019%20aout%202026.pdf';
const URL_PDF_0820 =
  'https://www.pyrenees-orientales.gouv.fr/contenu/telechargement/50201/381400/file/Recueil%20du%2020%20aout%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf0819: Buffer;
let pdf0820: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 20, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
  pdf0819 = await readFile(path.join(FIXTURES_DIR, 'raa-66-0819.pdf'));
  pdf0820 = await readFile(path.join(FIXTURES_DIR, 'raa-66-0820.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_0819) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf0819.buffer.slice(pdf0819.byteOffset, pdf0819.byteOffset + pdf0819.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_0820) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf0820.buffer.slice(pdf0820.byteOffset, pdf0820.byteOffset + pdf0820.byteLength),
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

describe('connecteur réel prefecture-66 (récupération + traitement)', () => {
  it("résout la navigation à un niveau (racine → carte de l'année), exclut le lien factice [TEST] RAA", async () => {
    const connecteur = await obtenirConnecteur('prefecture-66');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (0820, pertinent), ignore le 0819 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-66');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('66');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('66-2026-08-20-022');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 28)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet des Pyrénées-Orientales');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_0820);
  });
});
