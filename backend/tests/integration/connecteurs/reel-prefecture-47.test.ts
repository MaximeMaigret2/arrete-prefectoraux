import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 47-51) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-47`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké —
 * aucun appel réseau réel.
 *
 * Navigation à DEUX niveaux (racine → année → mois, piège du suffixe "2"
 * inattendu sur chaque lien de mois) puis liste plate à lien PDF direct
 * (`.fr-downloads-group li` / `a` / `a`) — même famille que
 * prefecture-42/43.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-47');

const URL_RACINE = 'https://www.lot-et-garonne.gouv.fr/Publications/Publications-legales/RAA';
const URL_ANNEE = 'https://www.lot-et-garonne.gouv.fr/Publications/Publications-legales/RAA/Recueil-des-actes-administratifs-annee-2026';
const URL_MOIS = 'https://www.lot-et-garonne.gouv.fr/Publications/Publications-legales/RAA/Recueil-des-actes-administratifs-annee-2026/Aout2';
const URL_PDF_AVEC_ARRETE = 'https://www.lot-et-garonne.gouv.fr/contenu/telechargement/31224/237151/file/3_recueil-47-2026-163.pdf';
const URL_PDF_SANS_ARRETE = 'https://www.lot-et-garonne.gouv.fr/contenu/telechargement/31225/237152/file/4_recueil-47-2026-164.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 18, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout2.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
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

describe('connecteur réel prefecture-47 (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → année → mois, suffixe "2") puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-47');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct', async () => {
    const connecteur = await obtenirConnecteur('prefecture-47');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('47');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('47-2026-163');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de Lot-et-Garonne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
