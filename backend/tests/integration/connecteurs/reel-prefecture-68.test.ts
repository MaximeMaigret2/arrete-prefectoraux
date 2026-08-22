import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 67-71) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-68`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif "/{annee}$" —
 * le libellé du lien est juste l'année, c'est le href qui porte le
 * motif). Page de l'année : liste PAGINÉE de `.fr-card`, chaque
 * `.fr-card__title a` pointant DIRECTEMENT vers le PDF (pas de
 * page_detail) — même famille que prefecture-13/33.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-68');

const URL_RACINE = 'https://www.haut-rhin.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.haut-rhin.gouv.fr/Publications/Recueil-des-actes-administratifs/2026';
const URL_PDF_95 =
  'https://www.haut-rhin.gouv.fr/contenu/telechargement/53381/378625/file/RAA%20n%C2%B095%20du%2019%20ao%C3%BBt%202026.pdf';
const URL_PDF_96 =
  'https://www.haut-rhin.gouv.fr/contenu/telechargement/53412/378879/file/RAA%20n%C2%B096%20du%2020%20ao%C3%BBt%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf95: Buffer;
let pdf96: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026.html'), 'utf-8');
  pdf95 = await readFile(path.join(FIXTURES_DIR, 'raa-68-95.pdf'));
  pdf96 = await readFile(path.join(FIXTURES_DIR, 'raa-68-96.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_95) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf95.buffer.slice(pdf95.byteOffset, pdf95.byteOffset + pdf95.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_96) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf96.buffer.slice(pdf96.byteOffset, pdf96.byteOffset + pdf96.byteLength),
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

describe('connecteur réel prefecture-68 (récupération + traitement)', () => {
  it("résout la navigation à un niveau (racine → carte de l'année, motif porté par le href)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-68');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (n°96, pertinent), ignore le n°95 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-68');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('68');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('68-2026-08-20-012');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Haut-Rhin');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_96);
  });
});
