import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-20, lot 62-66) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-64`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à TROIS niveaux (racine → année → mois), avec une 3e étape
 * OPTIONNELLE inédite : la page du mois est paginée et triée du plus ancien
 * au plus récent (à l'inverse de tous les connecteurs précédents), donc les
 * publications récentes sont sur la DERNIÈRE page — l'étape cible
 * `.fr-pagination__link--last` pour sauter directement à cette dernière
 * page. Le fixture "Aout-2026.html" (page 1) ne sert qu'à fournir ce lien
 * de pagination ; le fixture "Aout-2026-offset30.html" reproduit la
 * dernière page réellement utilisée pour l'extraction. Publications en
 * cartes DSFR complètes (`.fr-card`) dont le lien direct est le PDF
 * (aucune page de détail, à la différence du piège 58/60).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-64');

const URL_RACINE = 'https://www.pyrenees-atlantiques.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.pyrenees-atlantiques.gouv.fr/Publications/Recueil-des-actes-administratifs/Annee-2026';
const URL_MOIS = 'https://www.pyrenees-atlantiques.gouv.fr/Publications/Recueil-des-actes-administratifs/Annee-2026/Aout-2026';
const URL_MOIS_DERNIERE =
  'https://www.pyrenees-atlantiques.gouv.fr/Publications/Recueil-des-actes-administratifs/Annee-2026/Aout-2026/(offset)/30';
const URL_PDF_354 =
  'https://www.pyrenees-atlantiques.gouv.fr/contenu/telechargement/64213/470213/file/recueil-64-2026-354-recueil-des-actes-administratifs.pdf';
const URL_PDF_355 =
  'https://www.pyrenees-atlantiques.gouv.fr/contenu/telechargement/64214/470214/file/recueil-64-2026-355-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let htmlMoisDerniere: string;
let pdf354: Buffer;
let pdf355: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 20, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout-2026.html'), 'utf-8');
  htmlMoisDerniere = await readFile(path.join(FIXTURES_DIR, 'Aout-2026-offset30.html'), 'utf-8');
  pdf354 = await readFile(path.join(FIXTURES_DIR, 'raa-64-354.pdf'));
  pdf355 = await readFile(path.join(FIXTURES_DIR, 'raa-64-355.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_MOIS_DERNIERE) return { ok: true, status: 200, text: async () => htmlMoisDerniere } as unknown as Response;
      if (url === URL_PDF_354) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf354.buffer.slice(pdf354.byteOffset, pdf354.byteOffset + pdf354.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_355) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf355.buffer.slice(pdf355.byteOffset, pdf355.byteOffset + pdf355.byteLength),
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

describe('connecteur réel prefecture-64 (récupération + traitement)', () => {
  it('résout la navigation à trois niveaux avec saut optionnel vers la dernière page de pagination', async () => {
    const connecteur = await obtenirConnecteur('prefecture-64');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (355, pertinent), ignore le 354 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-64');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('64');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('64-2026-08-20-012');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 26)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet des Pyrénées-Atlantiques');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_355);
  });
});
