import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 47-51) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-51`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké —
 * aucun appel réseau réel.
 *
 * Navigation à UN niveau (racine → année) vers une page listant TOUT le
 * RAA de l'année en plusieurs `<select class="fr-select">` (un par mois,
 * `id` dupliqués/incohérents sur le vrai site — d'où le sélecteur par
 * classe) ; chaque `<option value="...">` mène à une page de détail avant
 * le PDF réel — même famille `page_detail` que prefecture-77/46.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-51');

const URL_RACINE =
  'https://www.marne.gouv.fr/Publications/Publications-administratives-et-legales/RAA-Recueils-des-actes-administratifs/RAA-Recueils-des-actes-administratifs-de-la-prefecture-de-la-Marne';
const URL_ANNEE =
  'https://www.marne.gouv.fr/Publications/Publications-administratives-et-legales/RAA-Recueils-des-actes-administratifs/RAA-Recueils-des-actes-administratifs-de-la-prefecture-de-la-Marne/RAA-Annee-2026';
const URL_DETAIL_JUILLET =
  'https://www.marne.gouv.fr/Media/Files/Prefecture/RAA/2026/Juillet/RAA-N-51-2026-156-du-30-juillet-2026';
const URL_DETAIL_AOUT =
  'https://www.marne.gouv.fr/Media/Files/Prefecture/RAA/2026/Aout/RAA-n-51-2026-167-du-17-aout-2026';
const URL_PDF_JUILLET = 'https://www.marne.gouv.fr/contenu/telechargement/51500/369000/file/recueil-51-2026-156.pdf';
const URL_PDF_AOUT = 'https://www.marne.gouv.fr/contenu/telechargement/52200/371500/file/recueil-51-2026-167.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetailJuillet: string;
let htmlDetailAout: string;
let pdfJuillet: Buffer;
let pdfAout: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 18, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'RAA-Annee-2026.html'), 'utf-8');
  htmlDetailJuillet = await readFile(path.join(FIXTURES_DIR, 'detail-156-juillet.html'), 'utf-8');
  htmlDetailAout = await readFile(path.join(FIXTURES_DIR, 'detail-167-aout.html'), 'utf-8');
  pdfJuillet = await readFile(path.join(FIXTURES_DIR, 'recueil-51-2026-156.pdf'));
  pdfAout = await readFile(path.join(FIXTURES_DIR, 'recueil-51-2026-167.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_JUILLET) return { ok: true, status: 200, text: async () => htmlDetailJuillet } as unknown as Response;
      if (url === URL_DETAIL_AOUT) return { ok: true, status: 200, text: async () => htmlDetailAout } as unknown as Response;
      if (url === URL_PDF_JUILLET) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdfJuillet.buffer.slice(pdfJuillet.byteOffset, pdfJuillet.byteOffset + pdfJuillet.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_AOUT) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdfAout.buffer.slice(pdfAout.byteOffset, pdfAout.byteOffset + pdfAout.byteLength),
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

describe('connecteur réel prefecture-51 (récupération + traitement)', () => {
  it("résout la navigation (racine → année) et la page de détail par option (value) pour ignorer le mois sans arrêté rave/teknival", async () => {
    const connecteur = await obtenirConnecteur('prefecture-51');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    // Un seul candidat retenu sur les 2 options réelles (+ 2 placeholders
    // value="" ignorés sans requête) : le PDF de juillet ne contient
    // aucun mot-clé.
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail', async () => {
    const connecteur = await obtenirConnecteur('prefecture-51');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('51');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('51-2026-167');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Marne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AOUT);
  });
});
