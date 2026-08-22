import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-22, lot 93-95 — dernier lot du périmètre 96 départements)
 * "récupération + traitement" du connecteur RÉEL `prefecture-93`, contre
 * une reconstruction fidèle de la structure du site VALIDÉE PAR CAPTURE
 * LIVE (navigateur Chrome réel, dès la construction initiale de la config
 * — cf. claude/etat-connecteurs.md), `fetch` entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → année → mois), avec une 3e étape
 * OPTIONNELLE : la page du mois est paginée et triée du plus ancien au
 * plus récent (vérifié en live : page 1 commence par le RAA du 3 août, la
 * dernière page contient les plus récents) — même mécanisme que
 * prefecture-64/74/83. Le fixture "AOUT.html" (page 1) ne sert qu'à
 * fournir le lien de pagination "Dernière page" ; le fixture
 * "AOUT-offset20.html" reproduit la dernière page réellement utilisée
 * pour l'extraction. Publications en cartes DSFR complètes (`.fr-card`)
 * dont le lien direct est le PDF (pas de page de détail). Cartes de mois
 * en MAJUSCULES SANS ACCENT dans le href ("AOUT") — le placeholder
 * `{mois_fr}` ("Aout") matche quand même via le flag 'i' de la regex de
 * navigation.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-93');

const URL_RACINE = 'https://www.seine-saint-denis.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = `${URL_RACINE}/Annee-2026`;
const URL_MOIS = `${URL_ANNEE}/AOUT`;
const URL_MOIS_DERNIERE = `${URL_MOIS}/(offset)/20`;
const URL_PDF_21 =
  'https://www.seine-saint-denis.gouv.fr/contenu/telechargement/30590/244400/file/recueil-93-2026-08-21-recueil-des-actes-administratifs.pdf';
const URL_PDF_22 =
  'https://www.seine-saint-denis.gouv.fr/contenu/telechargement/30595/244410/file/recueil-93-2026-08-22-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let htmlMoisDerniere: string;
let pdf21: Buffer;
let pdf22: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 22, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'AOUT.html'), 'utf-8');
  htmlMoisDerniere = await readFile(path.join(FIXTURES_DIR, 'AOUT-offset20.html'), 'utf-8');
  pdf21 = await readFile(path.join(FIXTURES_DIR, 'recueil-93-2026-08-21-recueil-des-actes-administratifs.pdf'));
  pdf22 = await readFile(path.join(FIXTURES_DIR, 'recueil-93-2026-08-22-recueil-des-actes-administratifs.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_MOIS_DERNIERE)
        return { ok: true, status: 200, text: async () => htmlMoisDerniere } as unknown as Response;
      if (url === URL_PDF_21) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf21.buffer.slice(pdf21.byteOffset, pdf21.byteOffset + pdf21.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_22) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf22.buffer.slice(pdf22.byteOffset, pdf22.byteOffset + pdf22.byteLength),
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

describe('connecteur réel prefecture-93 (récupération + traitement)', () => {
  it('résout la navigation à deux niveaux avec saut optionnel vers la dernière page de pagination', async () => {
    const connecteur = await obtenirConnecteur('prefecture-93');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (22, pertinent), ignore le 21 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-93');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('93');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('93-2026-158');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Seine-Saint-Denis');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_22);
  });
});
