import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-02`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-02/,
 * cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-02')`, donc
 * le VRAI `configs/prefecture-02.yaml` déployé — y compris sa `navigation` à
 * 2 niveaux (année → dernière page de pagination, la 2e étape `optionnelle`
 * mais PRÉSENTE dans cette fixture, cf. V010) ET son `page_detail` (chaque
 * `.fr-card__link` mène à une page de détail, pas directement à un PDF).
 * Horloge figée au 13/08/2026 (`vi.setSystemTime`).
 *
 * Le cas "lien de dernière page ABSENT" (étape optionnelle silencieusement
 * ignorée) est déjà couvert génériquement par
 * `tests/unit/connecteurs/moteurPageWeb.test.ts` (V010) — pas dupliqué ici.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-02');

const URL_RACINE = 'https://www.aisne.gouv.fr/Publications/Recueil-des-Actes-Administratifs';
const URL_ANNEE =
  'https://www.aisne.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-Annee-2026';
const URL_DERNIERE_PAGE =
  'https://www.aisne.gouv.fr/Publications/Recueil-des-Actes-Administratifs/Recueil-des-Actes-Administratifs-Annee-2026/(offset)/20';
const URL_DETAIL_011 = 'https://www.aisne.gouv.fr/Publications/Recueil-des-Actes-Administratifs/RAA_Aout_02-2026-011';
const URL_DETAIL_005 = 'https://www.aisne.gouv.fr/Publications/Recueil-des-Actes-Administratifs/RAA_Aout_02-2026-005';
const URL_PDF_AVEC_ARRETE =
  'https://www.aisne.gouv.fr/contenu/telechargement/12001/82001/file/RAA_Aout_02-2026-011.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.aisne.gouv.fr/contenu/telechargement/12002/82002/file/RAA_Aout_02-2026-005.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDernierePage: string;
let htmlDetail011: string;
let htmlDetail005: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlDernierePage = await readFile(path.join(FIXTURES_DIR, 'derniere-page.html'), 'utf-8');
  htmlDetail011 = await readFile(path.join(FIXTURES_DIR, 'detail-011.html'), 'utf-8');
  htmlDetail005 = await readFile(path.join(FIXTURES_DIR, 'detail-005.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DERNIERE_PAGE) {
        return { ok: true, status: 200, text: async () => htmlDernierePage } as unknown as Response;
      }
      if (url === URL_DETAIL_011) return { ok: true, status: 200, text: async () => htmlDetail011 } as unknown as Response;
      if (url === URL_DETAIL_005) return { ok: true, status: 200, text: async () => htmlDetail005 } as unknown as Response;
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

describe('Phase 5bis élargie — connecteur réel prefecture-02 (récupération + traitement)', () => {
  it("résout la navigation (racine → dernière page) et la page de détail par href pour ignorer le bulletin sans arrêté rave/teknival", async () => {
    const connecteur = await obtenirConnecteur('prefecture-02');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it("extrait correctement le candidat depuis le texte du PDF atteint via la page de détail (texte de l'ancre jamais suffisant)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-02');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('02');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('02-2026-08-011');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe("La Préfète de l'Aisne");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
