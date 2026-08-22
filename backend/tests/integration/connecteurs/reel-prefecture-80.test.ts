import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 78-82) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-80`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif "Annee-{annee}$").
 * Liste finale : TOUTE l'année sur une seule page (pas de découpage par
 * mois, pas de pagination — 201 publications 2026 en live). Markup inédit :
 * chaque publication est un `<p>` SANS attribut class contenant un unique
 * `a.fr-link[href$=".pdf"]` (pas de `div[class='']`, pas de classe
 * `fr-link--download`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-80');

const URL_RACINE =
  'https://www.somme.gouv.fr/Publications/Recueil-des-actes-administratifs-du-departement-de-la-Somme';
const URL_ANNEE_2026 =
  'https://www.somme.gouv.fr/Publications/Recueil-des-actes-administratifs-du-departement-de-la-Somme/Annee-2026';
const URL_PDF_002 =
  'https://www.somme.gouv.fr/contenu/telechargement/54700/359999/file/recueil-2026-002-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_001 =
  'https://www.somme.gouv.fr/contenu/telechargement/54623/359254/file/recueil-2026-001-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let pdf002: Buffer;
let pdf001: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdf002 = await readFile(path.join(FIXTURES_DIR, 'raa-80-2026-002.pdf'));
  pdf001 = await readFile(path.join(FIXTURES_DIR, 'raa-80-2026-001.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_PDF_002) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf002.buffer.slice(pdf002.byteOffset, pdf002.byteOffset + pdf002.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_001) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf001.buffer.slice(pdf001.byteOffset, pdf001.byteOffset + pdf001.byteLength),
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

describe('connecteur réel prefecture-80 (récupération + traitement)', () => {
  it('résout les 2 publications de la page année (liste plate en <p>, sans pagination)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-80');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (002, pertinent), ignore le 001 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-80');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('80');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('80-2026-08-03-002');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Somme');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_002);
  });
});
