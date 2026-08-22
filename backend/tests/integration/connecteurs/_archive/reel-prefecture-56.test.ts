import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 52-56) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-56`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Racine sans carte DSFR : sélecteur d'année en `<select>` (même idiome
 * que prefecture-17/55). Page de l'année : cartes DSFR paginées dont le
 * titre pointe DIRECTEMENT vers le PDF (pas de `page_detail`, à la
 * différence de tous les connecteurs à `.fr-card` vus jusqu'ici) ; aucune
 * étape de pagination nécessaire (page 1 = publications les plus
 * récentes).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-56');

const URL_RACINE = 'https://www.morbihan.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA';
const URL_ANNEE = 'https://www.morbihan.gouv.fr/RAA/Annee-2026';
const URL_PDF_099 =
  'https://www.morbihan.gouv.fr/contenu/telechargement/83407/649345/file/56-2026-099%20-%20RAA%20Sp%C3%A9cial%20du%2017%20ao%C3%BBt%202026.pdf';
const URL_PDF_098 =
  'https://www.morbihan.gouv.fr/contenu/telechargement/83393/649267/file/56-2026-098%20-%20RAA%20du%2014%20ao%C3%BBt%202026%20-%201%C3%A8re%20quinzaine.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf099: Buffer;
let pdf098: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
  pdf099 = await readFile(path.join(FIXTURES_DIR, 'raa-56-2026-099.pdf'));
  pdf098 = await readFile(path.join(FIXTURES_DIR, 'raa-56-2026-098.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_099) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf099.buffer.slice(pdf099.byteOffset, pdf099.byteOffset + pdf099.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_098) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf098.buffer.slice(pdf098.byteOffset, pdf098.byteOffset + pdf098.byteLength),
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

describe('connecteur réel prefecture-56 (récupération + traitement)', () => {
  it('résout la navigation (racine en <select> → année) et lit directement le PDF depuis la carte (pas de page_detail)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-56');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF', async () => {
    const connecteur = await obtenirConnecteur('prefecture-56');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('56');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('56-2026-099');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 19)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Morbihan');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_099);
  });
});
