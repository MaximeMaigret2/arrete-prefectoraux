import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 78-82) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-78`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → année → mois, motifs "{annee}$" puis
 * "{mois_fr}$"). Liste finale : liste plate sans pagination,
 * `div[class='']:has(a.fr-link--download)`, même famille que
 * 37/41/45/49/52/55/59/62/65/66/69/72/73/76.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-78');

const URL_RACINE = 'https://www.yvelines.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE_2026 = 'https://www.yvelines.gouv.fr/Publications/Recueil-des-actes-administratifs/2026';
const URL_AOUT = 'https://www.yvelines.gouv.fr/Publications/Recueil-des-actes-administratifs/2026/AOUT';
const URL_PDF_335 =
  'https://www.yvelines.gouv.fr/contenu/telechargement/37548/239461/file/recueil-78-2026-335-recueil-des-actes-administratifs.pdf';
const URL_PDF_314 =
  'https://www.yvelines.gouv.fr/contenu/telechargement/37547/239456/file/recueil-78-2026-314-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let htmlAout: string;
let pdf335: Buffer;
let pdf314: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  pdf335 = await readFile(path.join(FIXTURES_DIR, 'raa-78-2026-335.pdf'));
  pdf314 = await readFile(path.join(FIXTURES_DIR, 'raa-78-2026-314.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_PDF_335) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf335.buffer.slice(pdf335.byteOffset, pdf335.byteOffset + pdf335.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_314) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf314.buffer.slice(pdf314.byteOffset, pdf314.byteOffset + pdf314.byteLength),
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

describe('connecteur réel prefecture-78 (récupération + traitement)', () => {
  it('résout les 2 publications du mois courant (liste plate, sans pagination)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-78');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (335, pertinent), ignore le 314 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-78');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('78');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('78-2026-08-20-335');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet des Yvelines');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_335);
  });
});
