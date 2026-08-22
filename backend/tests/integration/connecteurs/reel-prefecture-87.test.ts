import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 83-87) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-87`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-87')`, donc
 * le VRAI `configs/prefecture-87.yaml` déployé — y compris sa `navigation`
 * par PÉRIODES (V009, semestre calendaire régulier janvier-juin/juillet-
 * décembre, à la différence du semestre IRRÉGULIER de prefecture-04) :
 * avec l'horloge figée au 21/08/2026, le mois courant (8) tombe dans la
 * période "juillet à décembre" [7, 12]. La carte de semestre répond en
 * réalité par une redirection HTTP transparente (suivie nativement par
 * fetch()) — le mock sert directement le contenu final pour l'URL de la
 * carte, même mécanisme que prefecture-61/63/79. Liste finale : PLATE,
 * ordre croissant, sans pagination, `div[class='']:has(a.fr-link--download)`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-87');

const URL_RACINE = 'https://www.haute-vienne.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_SEMESTRE_JUILLET_DECEMBRE = `${URL_RACINE}/JUILLET-DECEMBRE-2026`;
const URL_PDF_160 =
  "https://www.haute-vienne.gouv.fr/contenu/telechargement/50960/427710/file/recueil%20n%C2%B0%2087-2026-160%20du%2020%20aout%202026.pdf";
const URL_PDF_161 =
  "https://www.haute-vienne.gouv.fr/contenu/telechargement/50975/427729/file/recueil%20n%C2%B0%2087-2026-161%20du%2021%20aout%202026.pdf";

let htmlRacine: string;
let htmlSemestre: string;
let pdf160: Buffer;
let pdf161: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlSemestre = await readFile(path.join(FIXTURES_DIR, 'juillet-decembre-2026.html'), 'utf-8');
  pdf160 = await readFile(path.join(FIXTURES_DIR, 'raa-160-non-pertinent.pdf'));
  pdf161 = await readFile(path.join(FIXTURES_DIR, 'raa-161-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_SEMESTRE_JUILLET_DECEMBRE) {
        return { ok: true, status: 200, text: async () => htmlSemestre } as unknown as Response;
      }
      if (url === URL_PDF_160) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf160.buffer.slice(pdf160.byteOffset, pdf160.byteOffset + pdf160.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_161) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf161.buffer.slice(pdf161.byteOffset, pdf161.byteOffset + pdf161.byteLength),
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

describe('connecteur réel prefecture-87 (récupération + traitement)', () => {
  it('résout la navigation par périodes (choisit "juillet à décembre", jamais "janvier à juin")', async () => {
    const connecteur = await obtenirConnecteur('prefecture-87');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (161, pertinent), ignore le 160 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-87');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('87');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('87-2026-08-21-161');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Haute-Vienne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_161);
  });
});
