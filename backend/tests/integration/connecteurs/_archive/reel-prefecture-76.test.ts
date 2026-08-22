import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 72-76) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-76`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → année → mois). Liste finale : liste
 * plate sans pagination, `div[class='']:has(a.fr-link--download)`, même
 * famille que 37/41/45/49/52/55/59/62/65/66/69/72/73. La fixture du mois
 * inclut aussi le bloc "documents liés" dupliqué à balisage cassé observé
 * en live (cf. commentaire de la config) — ce test vérifie donc
 * implicitement que le sélecteur ne compte PAS ce doublon (2 candidats
 * attendus depuis 2 vraies publications, pas 4).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-76');

const URL_RACINE = 'https://www.seine-maritime.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA';
const URL_ANNEE_2026 =
  'https://www.seine-maritime.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-departemental-2026';
const URL_AOUT =
  'https://www.seine-maritime.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-departemental-2026/RAA-Aout-2026';
const URL_PDF_254 =
  'https://www.seine-maritime.gouv.fr/contenu/telechargement/74305/524506/file/recueil-76-2026-254-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_252 =
  'https://www.seine-maritime.gouv.fr/contenu/telechargement/74227/524043/file/recueil-76-2026-252-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let htmlAout: string;
let pdf254: Buffer;
let pdf252: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  pdf254 = await readFile(path.join(FIXTURES_DIR, 'raa-76-254.pdf'));
  pdf252 = await readFile(path.join(FIXTURES_DIR, 'raa-76-252.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_PDF_254) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf254.buffer.slice(pdf254.byteOffset, pdf254.byteOffset + pdf254.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_252) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf252.buffer.slice(pdf252.byteOffset, pdf252.byteOffset + pdf252.byteLength),
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

describe('connecteur réel prefecture-76 (récupération + traitement)', () => {
  it('résout les 2 vraies publications du mois courant, sans compter le bloc "documents liés" dupliqué (balisage cassé)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-76');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (254, pertinent), ignore le 252 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-76');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('76');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('76-2026-08-20-254');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Seine-Maritime');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_254);
  });
});
