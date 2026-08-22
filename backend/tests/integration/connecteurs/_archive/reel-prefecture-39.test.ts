import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-18, lot 37-41) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-39`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, 2026-08-18 — cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Navigation à DEUX niveaux (racine → année → dernière page de pagination) ;
 * chaque publication de la page (`.fr-card__title a`, classe complète
 * "fr-card__link menu-item-link") pointe DIRECTEMENT vers le PDF — pas de
 * page de détail intermédiaire (à la différence de l'hypothèse initiale, et
 * à la différence de prefecture-40/Landes qui, elle, en a une). Même famille
 * que prefecture-36/Indre.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-39');

const URL_RACINE = 'https://www.jura.gouv.fr/Publications/Publications-legales/Recueil-des-Actes-Administratifs';
const URL_ANNEE =
  'https://www.jura.gouv.fr/Publications/Publications-legales/Recueil-des-Actes-Administratifs/Annee-2026';
const URL_ANNEE_DERNIERE_PAGE =
  'https://www.jura.gouv.fr/Publications/Publications-legales/Recueil-des-Actes-Administratifs/Annee-2026/(offset)/170';
const URL_PDF_SANS_ARRETE =
  'https://www.jura.gouv.fr/contenu/telechargement/33900/252000/file/RAA%2039-2026-08-056%20du%2012-08-2026.pdf';
const URL_PDF_AVEC_ARRETE =
  'https://www.jura.gouv.fr/contenu/telechargement/33901/252001/file/RAA%20special%2039-2026-08-058%20du%2014-08-2026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlAnneeDernierePage: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
  htmlAnneeDernierePage = await readFile(path.join(FIXTURES_DIR, 'Annee-2026-offset-170.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_ANNEE_DERNIERE_PAGE)
        return { ok: true, status: 200, text: async () => htmlAnneeDernierePage } as unknown as Response;
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

describe('connecteur réel prefecture-39 (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → année → dernière page de pagination) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-39');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF lié directement (pas de page de détail)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-39');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('39');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('39-2026-08-14-00058');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Jura');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
