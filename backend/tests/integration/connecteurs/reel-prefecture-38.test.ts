import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-18, lot 37-41) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-38`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, 2026-08-18 — cf.
 * SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel.
 *
 * Navigation à UN SEUL niveau (racine → année) ; la page de l'année est un
 * `<select class="fr-select">` (327 options réelles, 2 reproduites ici),
 * chaque `<option value="...">` (SANS "/" de tête) menant à une page de
 * DÉTAIL HTML où `a.fr-link--download` porte le vrai lien PDF — même
 * famille que prefecture-77, PAS la famille "liste plate" de 37/41.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-38');

const URL_RACINE = 'https://www.isere.gouv.fr/Publications/RAA-Recueil-des-actes-administratifs';
const URL_ANNEE =
  'https://www.isere.gouv.fr/Publications/RAA-Recueil-des-actes-administratifs/Recueils-des-Actes-Administratifs-de-la-prefecture-de-l-Isere-2026';
const URL_DETAIL_329 =
  'https://www.isere.gouv.fr/Publications/RAA-Recueil-des-actes-administratifs/Recueils-des-Actes-Administratifs-de-la-prefecture-de-l-Isere-2026/recueil-38-2026-329-recueil-des-actes-administratifs-special';
const URL_DETAIL_311 =
  'https://www.isere.gouv.fr/Publications/RAA-Recueil-des-actes-administratifs/Recueils-des-Actes-Administratifs-de-la-prefecture-de-l-Isere-2026/recueil-38-2026-311-recueil-des-actes-administratifs';
const URL_PDF_AVEC_ARRETE =
  'https://www.isere.gouv.fr/contenu/telechargement/84641/648555/file/recueil-38-2026-329-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.isere.gouv.fr/contenu/telechargement/80900/622500/file/recueil-38-2026-08-12-00311-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail329: string;
let htmlDetail311: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(
    path.join(FIXTURES_DIR, 'Recueils-des-Actes-Administratifs-de-la-prefecture-de-l-Isere-2026.html'),
    'utf-8',
  );
  htmlDetail329 = await readFile(path.join(FIXTURES_DIR, 'detail-329.html'), 'utf-8');
  htmlDetail311 = await readFile(path.join(FIXTURES_DIR, 'detail-311.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_329) return { ok: true, status: 200, text: async () => htmlDetail329 } as unknown as Response;
      if (url === URL_DETAIL_311) return { ok: true, status: 200, text: async () => htmlDetail311 } as unknown as Response;
      if (url === URL_PDF_AVEC_ARRETE) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdfAvecArrete.buffer.slice(pdfAvecArrete.byteOffset, pdfAvecArrete.byteOffset + pdfAvecArrete.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_SANS_ARRETE) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdfSansArrete.buffer.slice(pdfSansArrete.byteOffset, pdfSansArrete.byteOffset + pdfSansArrete.byteLength),
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

describe('connecteur réel prefecture-38 (récupération + traitement)', () => {
  it('résout la navigation (racine → année) et la page de détail par option (value) pour ignorer le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-38');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    // Un seul candidat retenu sur les 2 options réelles du <select> (+ le
    // placeholder value="" ignoré sans même tenter de requête, comme
    // prefecture-77).
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-38');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('38');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('38-2026-08-14-00312');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe("La préfète de l'Isère");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
