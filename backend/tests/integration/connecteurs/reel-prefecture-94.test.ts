import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-22, lot 93-95 — dernier lot du périmètre 96 départements)
 * "récupération + traitement" du connecteur RÉEL `prefecture-94`, contre
 * une reconstruction fidèle de la structure du site VALIDÉE PAR CAPTURE
 * LIVE (navigateur Chrome réel, dès la construction initiale de la config
 * — cf. claude/etat-connecteurs.md), `fetch` entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif
 * "annee-{annee}$", minuscule) vers une page HTML de l'année (PAS un PDF
 * direct sur la carte d'année). Liste finale PLATE, SANS PAGINATION (130
 * liens `a.fr-link--download` comptés en live pour 2026) — même famille
 * `div[class='']:has(a.fr-link--download)` que 78/87/89/90.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-94');

const URL_RACINE =
  'https://www.val-de-marne.gouv.fr/Publications/Publications-legales/RAA-Recueil-des-actes-administratifs';
const URL_ANNEE = `${URL_RACINE}/Les-recueils-des-actes-administratifs-annee-2026`;
const URL_PDF_130 =
  'https://www.val-de-marne.gouv.fr/contenu/telechargement/26710/204195/file/RAA-N130-du-18-19-et-20-aout-2026.pdf';
const URL_PDF_131 =
  'https://www.val-de-marne.gouv.fr/contenu/telechargement/26715/204201/file/RAA-N131-du-22-aout-2026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf130: Buffer;
let pdf131: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 22, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdf130 = await readFile(path.join(FIXTURES_DIR, 'RAA-N130-du-18-19-et-20-aout-2026.pdf'));
  pdf131 = await readFile(path.join(FIXTURES_DIR, 'RAA-N131-du-22-aout-2026.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_130) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf130.buffer.slice(pdf130.byteOffset, pdf130.byteOffset + pdf130.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_131) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf131.buffer.slice(pdf131.byteOffset, pdf131.byteOffset + pdf131.byteLength),
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

describe('connecteur réel prefecture-94 (récupération + traitement)', () => {
  it('résout la navigation à un niveau vers la liste plate sans pagination', async () => {
    const connecteur = await obtenirConnecteur('prefecture-94');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (131, pertinent), ignore le 130 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-94');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('94');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('94-2026-131');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Val-de-Marne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_131);
  });
});
