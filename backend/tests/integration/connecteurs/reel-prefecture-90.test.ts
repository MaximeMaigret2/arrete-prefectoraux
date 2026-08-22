import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 88-92) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-90`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → lien de l'année, motif "Annee-{annee}$",
 * PARTICULARITÉ DE MARKUP : simples `<a>` sans classe, `selecteur_liens: "a"`
 * délibérément large — le fixture racine inclut un lien de navigation
 * générique en amont pour vérifier que seul le premier lien dont l'URL
 * résolue matche le motif est retenu). Liste finale : liste plate sans
 * pagination, `div[class='']:has(a.fr-link--download)`, même famille que
 * 37/41/45/49/52/55/59/62/65/66/69/72/73/76/78/79/87/89.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-90');

const URL_RACINE = 'https://www.territoire-de-belfort.gouv.fr/Publications/Le-recueil-des-actes-administratifs';
const URL_ANNEE_2026 =
  'https://www.territoire-de-belfort.gouv.fr/Publications/Le-recueil-des-actes-administratifs/Annee-2026';
const URL_PDF_142 =
  'https://www.territoire-de-belfort.gouv.fr/contenu/telechargement/29140/198142/file/recueil-90-2026-142-recueil-des-actes-administratifs.pdf';
const URL_PDF_060 =
  'https://www.territoire-de-belfort.gouv.fr/contenu/telechargement/29060/198060/file/recueil-90-2026-060-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let pdf142: Buffer;
let pdf060: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdf142 = await readFile(path.join(FIXTURES_DIR, 'recueil-90-2026-142-recueil-des-actes-administratifs.pdf'));
  pdf060 = await readFile(path.join(FIXTURES_DIR, 'recueil-90-2026-060-recueil-des-actes-administratifs.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_PDF_142) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf142.buffer.slice(pdf142.byteOffset, pdf142.byteOffset + pdf142.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_060) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf060.buffer.slice(pdf060.byteOffset, pdf060.byteOffset + pdf060.byteLength),
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

describe('connecteur réel prefecture-90 (récupération + traitement)', () => {
  it('résout les 2 publications de la liste plate (sans pagination, sélecteur de lien "a" large)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-90');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (142, pertinent), ignore le 060 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-90');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('90');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('90-2026-142');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Territoire de Belfort');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_142);
  });
});
