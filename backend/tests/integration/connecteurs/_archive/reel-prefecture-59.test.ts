import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 58-61) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-59`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à TROIS niveaux (racine → carte fixe → année → mois, la plus
 * profonde rencontrée à ce jour) ; liste plate finale
 * (`div[class='']:has(a.fr-link--download)`, même famille que 37/41/45/49/52/55).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-59');

const URL_RACINE = 'https://www.nord.gouv.fr/Publications/Recueils-des-actes-administratifs';
const URL_INTERMEDIAIRE = 'https://www.nord.gouv.fr/Publications/Recueils-des-actes-administratifs/RAA-du-departement-du-Nord';
const URL_ANNEE = 'https://www.nord.gouv.fr/Publications/Recueils-des-actes-administratifs/RAA-du-departement-du-Nord/2026';
const URL_MOIS = 'https://www.nord.gouv.fr/Publications/Recueils-des-actes-administratifs/RAA-du-departement-du-Nord/2026/Aout';
const URL_PDF_293 = 'https://www.nord.gouv.fr/contenu/telechargement/61293/512930/file/RAA_59_2026_293.pdf';
const URL_PDF_292 = 'https://www.nord.gouv.fr/contenu/telechargement/61292/512920/file/RAA_59_2026_292.pdf';

let htmlRacine: string;
let htmlIntermediaire: string;
let htmlAnnee: string;
let htmlMois: string;
let pdf293: Buffer;
let pdf292: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlIntermediaire = await readFile(path.join(FIXTURES_DIR, 'RAA-du-departement-du-Nord.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout.html'), 'utf-8');
  pdf293 = await readFile(path.join(FIXTURES_DIR, 'raa-59-293.pdf'));
  pdf292 = await readFile(path.join(FIXTURES_DIR, 'raa-59-292.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_INTERMEDIAIRE) return { ok: true, status: 200, text: async () => htmlIntermediaire } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_PDF_293) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf293.buffer.slice(pdf293.byteOffset, pdf293.byteOffset + pdf293.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_292) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf292.buffer.slice(pdf292.byteOffset, pdf292.byteOffset + pdf292.byteLength),
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

describe('connecteur réel prefecture-59 (récupération + traitement)', () => {
  it('résout la navigation à trois niveaux (racine → carte fixe → année → mois courant)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-59');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (293, pertinent), ignore le 292 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-59');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('59');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('59-2026-293');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Nord');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_293);
  });
});
