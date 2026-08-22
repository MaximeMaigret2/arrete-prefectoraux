import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 67-71) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-67`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année). Page de l'année :
 * HUIT <select class="fr-select"> (un par mois), `selecteur_publications:
 * "select.fr-select option"` matche sur tous à la fois — deux options
 * reproduites ici (le mois d'août), chacune vers une page de détail
 * (`page_detail.attribut_lien: "value"`) portant un unique
 * `a.fr-link--download`. Même famille que prefecture-38/77, avec
 * plusieurs <select> au lieu d'un seul.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-67');

const URL_RACINE = 'https://www.bas-rhin.gouv.fr/Publications/Publications-officielles/RAA-Recueils-des-actes-administratifs';
const URL_ANNEE = 'https://www.bas-rhin.gouv.fr/Publications/Publications-officielles/RAA-Recueils-des-actes-administratifs/RAA-ANNEE-2026';
const URL_DETAIL_0819 =
  'https://www.bas-rhin.gouv.fr/Media/Files/22.-RAA/2026/Aout/RAA-N-special-du-19-aout-2026-Adoption-du-Reglement-Interieur-de-l-EPSAN';
const URL_DETAIL_0820 =
  'https://www.bas-rhin.gouv.fr/Media/Files/22.-RAA/2026/Aout/RAA-N-special-du-20-aout-2026-Hydrocarbures';
const URL_PDF_0819 =
  'https://www.bas-rhin.gouv.fr/contenu/telechargement/62312/443922/file/RAA%20N%C2%B0%20sp%C3%A9cial%20du%2019%20ao%C3%BBt%202026%20-%20Adoption%20du%20RI%20EPSAN.pdf';
const URL_PDF_0820 =
  'https://www.bas-rhin.gouv.fr/contenu/telechargement/62334/444058/file/RAA%20N%C2%B0%20sp%C3%A9cial%20du%2020%20ao%C3%BBt%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail0819: string;
let htmlDetail0820: string;
let pdf0819: Buffer;
let pdf0820: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-ANNEE-2026.html'), 'utf-8');
  htmlDetail0819 = await readFile(path.join(FIXTURES_DIR, 'detail-0819.html'), 'utf-8');
  htmlDetail0820 = await readFile(path.join(FIXTURES_DIR, 'detail-0820.html'), 'utf-8');
  pdf0819 = await readFile(path.join(FIXTURES_DIR, 'raa-67-0819.pdf'));
  pdf0820 = await readFile(path.join(FIXTURES_DIR, 'raa-67-0820.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_0819)
        return { ok: true, status: 200, text: async () => htmlDetail0819 } as unknown as Response;
      if (url === URL_DETAIL_0820)
        return { ok: true, status: 200, text: async () => htmlDetail0820 } as unknown as Response;
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

describe('connecteur réel prefecture-67 (récupération + traitement)', () => {
  it("résout la navigation à un niveau (racine → carte de l'année), traite les options des 2 <select>, ignore le placeholder", async () => {
    const connecteur = await obtenirConnecteur('prefecture-67');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (0820, pertinent), ignore le 0819 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-67');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('67');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('67-2026-08-20-014');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 28)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 31)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Bas-Rhin');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_0820);
  });
});
