import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14, lot 31-36) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-36`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-36/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-36')`, donc
 * le VRAI `configs/prefecture-36.yaml` déployé — y compris sa `navigation`
 * à TROIS niveaux (racine → année → mois → « Dernière page »), résolue
 * dynamiquement à partir de la date système figée au 14/08/2026
 * (`vi.setSystemTime`). PARTICULARITÉ : ordre chronologique CROISSANT sur
 * la page du mois (à la différence de prefecture-31) — la 3e étape de
 * `navigation` (`optionnelle: true`, NOUVELLE utilisation de V010) cible
 * délibérément le lien « Dernière page » (`.fr-pagination__link--last`)
 * pour atteindre les bulletins les plus récents du mois, jamais présents
 * sur la page 1.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-36');

const URL_RACINE = 'https://www.indre.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.indre.gouv.fr/Publications/Recueil-des-actes-administratifs/2026';
const URL_MOIS_PAGE1 = 'https://www.indre.gouv.fr/Publications/Recueil-des-actes-administratifs/2026/08.-Aout-2026';
const URL_MOIS_DERNIERE_PAGE =
  'https://www.indre.gouv.fr/Publications/Recueil-des-actes-administratifs/2026/08.-Aout-2026/(offset)/10';
const URL_PDF_AVEC_ARRETE =
  'https://www.indre.gouv.fr/contenu/telechargement/45312/373311/file/recueil-36-2026-226-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.indre.gouv.fr/contenu/telechargement/45291/373149/file/recueil-36-2026-225-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMoisPage1: string;
let htmlMoisDernierePage: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026.html'), 'utf-8');
  htmlMoisPage1 = await readFile(path.join(FIXTURES_DIR, '08.-Aout-2026.html'), 'utf-8');
  htmlMoisDernierePage = await readFile(path.join(FIXTURES_DIR, '08.-Aout-2026-offset-10.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS_PAGE1)
        return { ok: true, status: 200, text: async () => htmlMoisPage1 } as unknown as Response;
      if (url === URL_MOIS_DERNIERE_PAGE)
        return { ok: true, status: 200, text: async () => htmlMoisDernierePage } as unknown as Response;
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

describe('connecteur réel prefecture-36 (récupération + traitement)', () => {
  it('résout la navigation à 3 niveaux (racine → année → mois → Dernière page) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-36');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (carte DSFR complète, ordre croissant → dernière page)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-36');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('36');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('36-2026-08-14-00226');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe("La préfète de l'Indre");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
