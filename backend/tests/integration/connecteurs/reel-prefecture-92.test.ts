import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 88-92) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-92`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif "RAA-{annee}$").
 * Liste finale PAGINÉE (55 pages de 10 .fr-card, page 1 = plus récent),
 * chaque `.fr-card__title a` pointe DIRECTEMENT vers le PDF — même famille
 * que prefecture-13/33/68/74/88 : PAS de `page_detail`, `selecteur_publications`
 * est le conteneur `.fr-card`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-92');

const URL_RACINE = 'https://www.hauts-de-seine.gouv.fr/Publications/Annonces-avis/Le-Recueil-des-actes-administratifs';
const URL_ANNEE_2026 =
  'https://www.hauts-de-seine.gouv.fr/Publications/Annonces-avis/Le-Recueil-des-actes-administratifs/RAA-2026';
const URL_PDF_560 =
  'https://www.hauts-de-seine.gouv.fr/contenu/telechargement/83560/565560/file/RAA_92_20260820_560.pdf';
const URL_PDF_559 =
  'https://www.hauts-de-seine.gouv.fr/contenu/telechargement/83555/565555/file/RAA_92_20260819_559.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let pdf560: Buffer;
let pdf559: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdf560 = await readFile(path.join(FIXTURES_DIR, 'RAA_92_20260820_560.pdf'));
  pdf559 = await readFile(path.join(FIXTURES_DIR, 'RAA_92_20260819_559.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_PDF_560) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf560.buffer.slice(pdf560.byteOffset, pdf560.byteOffset + pdf560.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_559) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf559.buffer.slice(pdf559.byteOffset, pdf559.byteOffset + pdf559.byteLength),
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

describe('connecteur réel prefecture-92 (récupération + traitement)', () => {
  it('résout les 2 publications de la page 1 (liste paginée, lien PDF direct sur .fr-card)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-92');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (560, pertinent), ignore le 559 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-92');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('92');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('92-2026-08-20-560');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet des Hauts-de-Seine');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_560);
  });
});
