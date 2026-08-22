import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-20, lot 62-66) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-65`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année) ; liste plate finale
 * sans pagination (`div[class='']:has(a.fr-link--download)`, même famille
 * que 37/41/45/49/52/55/59/62).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-65');

const URL_RACINE = 'https://www.hautes-pyrenees.gouv.fr/Publications/Recueil-d-actes-administratifs';
const URL_ANNEE = 'https://www.hautes-pyrenees.gouv.fr/Publications/Recueil-d-actes-administratifs/RAA-2026';
const URL_PDF_296 =
  'https://www.hautes-pyrenees.gouv.fr/contenu/telechargement/24643/174878/file/recueil-65-2026-296-recueil-des-actes-administratifs.pdf';
const URL_PDF_297 =
  'https://www.hautes-pyrenees.gouv.fr/contenu/telechargement/24644/174883/file/recueil-65-2026-297-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf296: Buffer;
let pdf297: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 20, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-2026.html'), 'utf-8');
  pdf296 = await readFile(path.join(FIXTURES_DIR, 'raa-65-296.pdf'));
  pdf297 = await readFile(path.join(FIXTURES_DIR, 'raa-65-297.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_296) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf296.buffer.slice(pdf296.byteOffset, pdf296.byteOffset + pdf296.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_297) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf297.buffer.slice(pdf297.byteOffset, pdf297.byteOffset + pdf297.byteLength),
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

describe('connecteur réel prefecture-65 (récupération + traitement)', () => {
  it("résout la navigation à un niveau (racine → carte de l'année)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-65');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (297, pertinent), ignore le 296 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-65');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('65');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('65-2026-08-20-015');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 27)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète des Hautes-Pyrénées');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_297);
  });
});
