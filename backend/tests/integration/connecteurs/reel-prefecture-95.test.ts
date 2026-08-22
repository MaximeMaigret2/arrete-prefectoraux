import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-22, lot 93-95 — dernier lot du périmètre 96 départements)
 * "récupération + traitement" du connecteur RÉEL `prefecture-95`, contre
 * une reconstruction fidèle de la structure du site VALIDÉE PAR CAPTURE
 * LIVE (navigateur Chrome réel, dès la construction initiale de la config
 * — cf. claude/etat-connecteurs.md), `fetch` entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif
 * "RAA-de-{annee}$") vers une liste plate SANS PAGINATION (152 liens
 * comptés en live pour 2026). Chaque publication est un `<a class="">`
 * (SANS `fr-link--download`) au sein d'un `div[class='']`, menant à une
 * page de DÉTAIL HTML — `page_detail`, même famille que 44/58/60/77/81.
 * `selecteur_publications` cible l'`<a>` lui-même (`div[class=''] > a`),
 * conformément à la règle `page_detail` du contrat moteur.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-95');

const URL_RACINE = "https://www.val-doise.gouv.fr/Publications/Recueil-des-Actes-Administratifs";
const URL_ANNEE = `${URL_RACINE}/RAA-de-2026`;
const URL_DETAIL_157 = 'https://www.val-doise.gouv.fr/Media/Files/RAAE-n-157-du-21-aout-2026';
const URL_DETAIL_158 = 'https://www.val-doise.gouv.fr/Media/Files/RAAE-n-158-du-22-aout-2026';
const URL_PDF_157 =
  'https://www.val-doise.gouv.fr/contenu/telechargement/31780/233361/file/RAAE-n-157-du-21-aout-2026.pdf';
const URL_PDF_158 =
  'https://www.val-doise.gouv.fr/contenu/telechargement/31785/233366/file/RAAE-n-158-du-22-aout-2026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail157: string;
let htmlDetail158: string;
let pdf157: Buffer;
let pdf158: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 22, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-de-2026.html'), 'utf-8');
  htmlDetail157 = await readFile(path.join(FIXTURES_DIR, 'detail-157.html'), 'utf-8');
  htmlDetail158 = await readFile(path.join(FIXTURES_DIR, 'detail-158.html'), 'utf-8');
  pdf157 = await readFile(path.join(FIXTURES_DIR, 'RAAE-n-157-du-21-aout-2026.pdf'));
  pdf158 = await readFile(path.join(FIXTURES_DIR, 'RAAE-n-158-du-22-aout-2026.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_157)
        return { ok: true, status: 200, text: async () => htmlDetail157 } as unknown as Response;
      if (url === URL_DETAIL_158)
        return { ok: true, status: 200, text: async () => htmlDetail158 } as unknown as Response;
      if (url === URL_PDF_157) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf157.buffer.slice(pdf157.byteOffset, pdf157.byteOffset + pdf157.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_158) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf158.buffer.slice(pdf158.byteOffset, pdf158.byteOffset + pdf158.byteLength),
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

describe('connecteur réel prefecture-95 (récupération + traitement)', () => {
  it('résout la navigation à un niveau vers la liste plate avec page_detail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-95');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (158, pertinent), ignore le 157 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-95');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('95');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('95-2026-158');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Val-d\'Oise');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_158);
  });
});
