import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 78-82) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-79`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux : racine (select.fr-select, attribut_lien
 * "value") → carte du mois ("{mois_numero}-{mois_fr_minuscule}-RAA$"). La
 * page du mois répond en réalité par une redirection HTTP transparente
 * (suivie nativement par fetch()) — le mock ci-dessous sert directement le
 * contenu final pour l'URL de départ, exactement comme le ferait fetch() en
 * pratique. Liste finale : liste plate sans pagination,
 * `div[class='']:has(a.fr-link--download)`. La fixture du mois inclut aussi
 * le bouton de partage/impression de page (même classe fr-link--download,
 * conteneur différent) pour vérifier qu'il n'est pas compté.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-79');

const URL_RACINE = 'https://www.deux-sevres.gouv.fr/Publications/Le-Recueil-des-actes-administratifs';
const URL_ANNEE_2026 = 'https://www.deux-sevres.gouv.fr/Publications/Le-Recueil-des-actes-administratifs/Annee-2026';
const URL_AOUT = 'https://www.deux-sevres.gouv.fr/Publications/Le-Recueil-des-actes-administratifs/Annee-2026/08-aout-RAA';
const URL_PDF_251 =
  'https://www.deux-sevres.gouv.fr/contenu/telechargement/61234/401234/file/recueil-79-2026-251-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_247 =
  'https://www.deux-sevres.gouv.fr/contenu/telechargement/61111/401111/file/recueil-79-2026-247-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let htmlAout: string;
let pdf251: Buffer;
let pdf247: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, '08-aout.html'), 'utf-8');
  pdf251 = await readFile(path.join(FIXTURES_DIR, 'raa-79-2026-251.pdf'));
  pdf247 = await readFile(path.join(FIXTURES_DIR, 'raa-79-2026-247.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_PDF_251) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf251.buffer.slice(pdf251.byteOffset, pdf251.byteOffset + pdf251.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_247) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf247.buffer.slice(pdf247.byteOffset, pdf247.byteOffset + pdf247.byteLength),
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

describe('connecteur réel prefecture-79 (récupération + traitement)', () => {
  it('résout les 2 vraies publications du mois courant, sans compter le bouton de partage/impression de page', async () => {
    const connecteur = await obtenirConnecteur('prefecture-79');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (251, pertinent), ignore le 247 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-79');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('79');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('79-2026-08-10-251');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète des Deux-Sèvres');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_251);
  });
});
