import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 52-56) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-52`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké —
 * aucun appel réseau réel.
 *
 * Navigation à UN niveau (racine → année) vers une page listant TOUT le
 * RAA de l'année en liste plate, avec un piège de markup réel : les
 * publications les plus récentes sont des `<p>` sans classe, les plus
 * anciennes des `<li>` ORPHELINS (sans `<ul>` ouvrant) — les deux formes
 * sont couvertes par `selecteur_publications`. Lien PDF direct dans
 * l'ancre, pas de `page_detail`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-52');

const URL_RACINE = 'https://www.haute-marne.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA';
const URL_ANNEE = 'https://www.haute-marne.gouv.fr/Publications/Recueil-des-actes-administratifs-RAA/Annee-2026';
const URL_PDF_87BIS =
  'https://www.haute-marne.gouv.fr/contenu/telechargement/29950/225894/file/RAA%20n%C2%B0%2087bis%20du%2014-08-2026.pdf';
const URL_PDF_84 =
  'https://www.haute-marne.gouv.fr/contenu/telechargement/29922/225742/file/RAA%20n%C2%B0%2084%20du%2004-08-2026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf87bis: Buffer;
let pdf84: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
  pdf87bis = await readFile(path.join(FIXTURES_DIR, 'recueil-52-2026-0876.pdf'));
  pdf84 = await readFile(path.join(FIXTURES_DIR, 'recueil-52-2026-0870.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_87BIS) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf87bis.buffer.slice(pdf87bis.byteOffset, pdf87bis.byteOffset + pdf87bis.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_84) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf84.buffer.slice(pdf84.byteOffset, pdf84.byteOffset + pdf84.byteLength),
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

describe('connecteur réel prefecture-52 (récupération + traitement)', () => {
  it("résout la navigation (racine → année) et couvre les deux formes de markup (p récents / li orphelins anciens)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-52');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    // Un seul candidat retenu sur les 2 publications réelles : le PDF de
    // "RAA n° 84" (délégation de signature) ne contient aucun mot-clé.
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (forme <p>, publication la plus récente)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-52');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('52');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('52-2026-0876');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète de la Haute-Marne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_87BIS);
  });
});
