import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 72-76) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-72`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif
 * "RAA-Sarthe-{annee}$"). Liste finale : PAS de pagination, toute l'année
 * sur une seule page (181 publications 2026 en live) — liste plate, même
 * famille que 37/41/45/49/52/55/59/62/65/66/69, lien PDF direct, pas de
 * `page_detail`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-72');

const URL_RACINE = 'https://www.sarthe.gouv.fr/Publications/Recueils-des-actes-administratifs';
const URL_ANNEE_2026 =
  'https://www.sarthe.gouv.fr/Publications/Recueils-des-actes-administratifs/Recueil-des-actes-administratifs-RAA-Sarthe-2026';
const URL_PDF_187 =
  'https://www.sarthe.gouv.fr/contenu/telechargement/30314/187267/file/RAA%20n%C2%B0187%20du%2020%20ao%C3%BBt%202026.pdf';
const URL_PDF_186 =
  'https://www.sarthe.gouv.fr/contenu/telechargement/30304/187217/file/recueil-72-2026-186-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let pdf187: Buffer;
let pdf186: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdf187 = await readFile(path.join(FIXTURES_DIR, 'raa-72-187.pdf'));
  pdf186 = await readFile(path.join(FIXTURES_DIR, 'raa-72-186.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_PDF_187) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf187.buffer.slice(pdf187.byteOffset, pdf187.byteOffset + pdf187.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_186) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf186.buffer.slice(pdf186.byteOffset, pdf186.byteOffset + pdf186.byteLength),
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

describe('connecteur réel prefecture-72 (récupération + traitement)', () => {
  it('résout les 2 publications de la page année (liste plate, sans pagination)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-72');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (187, pertinent), ignore le 186 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-72');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('72');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('72-2026-08-20-187');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Sarthe');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_187);
  });
});
