import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-20, lot 62-66) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-63`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → carte "thématique" Puy-de-Dôme,
 * motif ancré pour écarter la carte sœur "Auvergne" → carte de l'année).
 * Le fixture pour l'étape "année" reproduit le CONTENU final tel que
 * `fetch()` le reçoit réellement après la redirection HTTP confirmée en
 * live (".../Puy-de-Dome/2026" → ".../2026/2026"), directement sur l'URL
 * de départ — `fetch()` suit les redirections nativement, ce mock reste
 * donc fidèle sans avoir à modéliser la redirection elle-même (même
 * mécanisme que prefecture-61). Liste finale plate sans pagination
 * (`div[class='']:has(a.fr-link--download)`, même famille que
 * 37/41/45/49/52/55/59/62).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-63');

const URL_RACINE = 'https://www.puy-de-dome.gouv.fr/Publications/Recueils-des-actes-administratifs';
const URL_THEMATIQUE =
  'https://www.puy-de-dome.gouv.fr/Publications/Recueils-des-actes-administratifs/Recueils-des-actes-administratifs-Puy-de-Dome';
const URL_ANNEE =
  'https://www.puy-de-dome.gouv.fr/Publications/Recueils-des-actes-administratifs/Recueils-des-actes-administratifs-Puy-de-Dome/2026';
const URL_PDF_229 =
  'https://www.puy-de-dome.gouv.fr/contenu/telechargement/34230/273376/file/RAA%20n%C2%B063-2026-229%20du%2019%20aout%202026.pdf';
const URL_PDF_230 =
  'https://www.puy-de-dome.gouv.fr/contenu/telechargement/34241/273486/file/RAA%20n%C2%B063-2026-230%20du%2020%20aout%202026.pdf';

let htmlRacine: string;
let htmlThematique: string;
let htmlAnnee: string;
let pdf229: Buffer;
let pdf230: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 20, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlThematique = await readFile(path.join(FIXTURES_DIR, 'Recueils-des-actes-administratifs-Puy-de-Dome.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026.html'), 'utf-8');
  pdf229 = await readFile(path.join(FIXTURES_DIR, 'raa-63-229.pdf'));
  pdf230 = await readFile(path.join(FIXTURES_DIR, 'raa-63-230.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_THEMATIQUE) return { ok: true, status: 200, text: async () => htmlThematique } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_229) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf229.buffer.slice(pdf229.byteOffset, pdf229.byteOffset + pdf229.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_230) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf230.buffer.slice(pdf230.byteOffset, pdf230.byteOffset + pdf230.byteLength),
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

describe('connecteur réel prefecture-63 (récupération + traitement)', () => {
  it("résout la navigation à deux niveaux (racine → thématique → année, avec redirection HTTP transparente)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-63');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (230, pertinent), ignore le 229 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-63');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('63');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('63-2026-08-20-006');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète du Puy-de-Dôme');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_230);
  });
});
