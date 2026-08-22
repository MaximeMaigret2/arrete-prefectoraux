import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14, lot 31-36) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-31`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-31/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-31')`, donc
 * le VRAI `configs/prefecture-31.yaml` déployé — y compris sa `navigation`
 * à DEUX niveaux (racine → Haute-Garonne (vs Occitanie) → mois), résolue
 * dynamiquement à partir de la date système figée au 14/08/2026
 * (`vi.setSystemTime`). La page du mois liste de VRAIES cartes DSFR
 * (`.fr-card`, lien PDF direct en `.fr-card__title a`) — particularité
 * nouvelle par rapport à la majorité des connecteurs déjà déployés (pas de
 * `div`/`li` autour d'un `a.fr-link--download`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-31');

const URL_RACINE = 'https://www.haute-garonne.gouv.fr/Publications/Recueil-des-Actes-Administratifs';
const URL_DEPARTEMENT =
  'https://www.haute-garonne.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-Haute-Garonne';
const URL_MOIS =
  'https://www.haute-garonne.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-Haute-Garonne/Aout-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.haute-garonne.gouv.fr/contenu/telechargement/64484/460048/file/recueil-31-2026-465-recueil-des-actes-administratifs-special.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.haute-garonne.gouv.fr/contenu/telechargement/64468/459958/file/recueil-31-2026-462-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlDepartement: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlDepartement = await readFile(
    path.join(FIXTURES_DIR, 'Recueil-des-Actes-Administratifs-Haute-Garonne.html'),
    'utf-8',
  );
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_DEPARTEMENT)
        return { ok: true, status: 200, text: async () => htmlDepartement } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
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

describe('connecteur réel prefecture-31 (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → Haute-Garonne → mois) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-31');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (carte DSFR complète, titre seul jamais suffisant)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-31');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('31');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('31-2026-08-14-00042');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Haute-Garonne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
