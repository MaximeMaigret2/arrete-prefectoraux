import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 83-87) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-85`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → année). La liste des publications de
 * l'année N'EST PAS portée par des cartes DSFR mais par un unique
 * `<select class="fr-select">` dont chaque `<option>` porte, via `value`
 * (chemin relatif SANS "/" de tête), l'URL d'une page de détail HTML —
 * même famille `page_detail`/`attribut_lien: "value"` que prefecture-77,
 * mais ici le `<select>` EST directement la liste finale (pas une étape de
 * navigation). Le premier `<option>` ("Liste", value="") est exclu via
 * `:not([value=''])`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-85');

const URL_RACINE = 'https://www.vendee.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.vendee.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueils-des-Actes-Administratifs-2026';
const URL_DETAIL_169 = `${URL_ANNEE}/Recueil-des-actes-administratifs-2026-169-publie-le-21-08-2026`;
const URL_DETAIL_168 = `${URL_ANNEE}/Recueil-des-actes-administratifs-2026-168-publie-le-20-08-2026`;
const URL_PDF_168 =
  'https://www.vendee.gouv.fr/contenu/telechargement/37540/237690/file/recueil-85-2026-168-recueil-des-actes-administratifs-1.pdf';
const URL_PDF_169 =
  'https://www.vendee.gouv.fr/contenu/telechargement/37546/237703/file/recueil-85-2026-169-recueil-des-actes-administratifs-1.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail169: string;
let htmlDetail168: string;
let pdf168: Buffer;
let pdf169: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlDetail169 = await readFile(path.join(FIXTURES_DIR, 'detail-169.html'), 'utf-8');
  htmlDetail168 = await readFile(path.join(FIXTURES_DIR, 'detail-168.html'), 'utf-8');
  pdf168 = await readFile(path.join(FIXTURES_DIR, 'raa-168-non-pertinent.pdf'));
  pdf169 = await readFile(path.join(FIXTURES_DIR, 'raa-169-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_169) return { ok: true, status: 200, text: async () => htmlDetail169 } as unknown as Response;
      if (url === URL_DETAIL_168) return { ok: true, status: 200, text: async () => htmlDetail168 } as unknown as Response;
      if (url === URL_PDF_168) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf168.buffer.slice(pdf168.byteOffset, pdf168.byteOffset + pdf168.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_169) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf169.buffer.slice(pdf169.byteOffset, pdf169.byteOffset + pdf169.byteLength),
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

describe('connecteur réel prefecture-85 (récupération + traitement)', () => {
  it('résout le <select> final (hors placeholder value="") et la page de détail par option (value)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-85');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail (169, pertinent), ignore le 168 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-85');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('85');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('85-2026-08-21-169');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 26)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Vendée');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_169);
  });
});
