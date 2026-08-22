import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 58-61) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-60`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à un niveau (racine → carte de l'année), `page_detail`
 * (attribut par défaut `href`). PIÈGE DE MARKUP RÉEL CONFIRMÉ EN LIVE : la
 * page de détail du 18 août porte DEUX liens `a.fr-link--download` (un
 * "sommaire" listé en premier dans le DOM, puis le PDF réel) — ce test
 * vérifie explicitement que `:not([href*="_sommaire"])` retient bien le
 * second (le texte réel de l'arrêté), jamais le premier (l'index).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-60');

const URL_RACINE = 'https://www.oise.gouv.fr/Publications/Publications-legales/Recueils-des-actes-administratifs-RAA';
const URL_ANNEE = 'https://www.oise.gouv.fr/Publications/Publications-legales/Recueils-des-actes-administratifs-RAA/RAA-2026';
const URL_DETAIL_818 =
  'https://www.oise.gouv.fr/Publications/Publications-legales/Recueils-des-actes-administratifs-RAA/RAA-2026/20260818-N-special-du-18-aout-2026';
const URL_DETAIL_814 =
  'https://www.oise.gouv.fr/Publications/Publications-legales/Recueils-des-actes-administratifs-RAA/RAA-2026/20260814-N-special-du-14-aout-2026';
const URL_PDF_818_SOMMAIRE =
  'https://www.oise.gouv.fr/contenu/telechargement/95418/685540/file/20260818_RAA_special_sommaire.pdf';
const URL_PDF_818 = 'https://www.oise.gouv.fr/contenu/telechargement/95419/685545/file/20260818_RAA_special.pdf';
const URL_PDF_814 = 'https://www.oise.gouv.fr/contenu/telechargement/95409/685451/file/20260814_RAA_special.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail818: string;
let htmlDetail814: string;
let pdf818: Buffer;
let pdf814: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-2026.html'), 'utf-8');
  htmlDetail818 = await readFile(path.join(FIXTURES_DIR, 'detail-818.html'), 'utf-8');
  htmlDetail814 = await readFile(path.join(FIXTURES_DIR, 'detail-814.html'), 'utf-8');
  pdf818 = await readFile(path.join(FIXTURES_DIR, '20260818_RAA_special.pdf'));
  pdf814 = await readFile(path.join(FIXTURES_DIR, '20260814_RAA_special.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_818) return { ok: true, status: 200, text: async () => htmlDetail818 } as unknown as Response;
      if (url === URL_DETAIL_814) return { ok: true, status: 200, text: async () => htmlDetail814 } as unknown as Response;
      if (url === URL_PDF_818) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf818.buffer.slice(pdf818.byteOffset, pdf818.byteOffset + pdf818.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_814) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf814.buffer.slice(pdf814.byteOffset, pdf814.byteOffset + pdf814.byteLength),
        } as unknown as Response;
      }
      // URL_PDF_818_SOMMAIRE volontairement JAMAIS mocké en succès : si le
      // sélecteur retombait par erreur sur le sommaire, le fetch échouerait
      // (404) et le test de contenu ci-dessous échouerait aussi (retombée
      // sur le titre, non pertinent) — preuve indirecte que le bon lien est
      // retenu.
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('connecteur réel prefecture-60 (récupération + traitement)', () => {
  it("retient le PDF réel (pas le sommaire) via :not([href*='_sommaire']) et résout la navigation", async () => {
    const connecteur = await obtenirConnecteur('prefecture-60');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].source.url).toBe(URL_PDF_818);
    expect(resultat.candidats[0].source.url).not.toBe(URL_PDF_818_SOMMAIRE);
  });

  it('extrait correctement le candidat depuis le texte du PDF (818, pertinent), ignore le 814 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-60');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('60');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('60-2026-818');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 19)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le préfet de l'Oise");
    expect(candidat.source.type).toBe('pdf');
  });
});
