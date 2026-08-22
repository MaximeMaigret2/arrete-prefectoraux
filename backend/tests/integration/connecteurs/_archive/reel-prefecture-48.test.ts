import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 47-51) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-48`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké —
 * aucun appel réseau réel.
 *
 * Navigation à TROIS niveaux (racine → année → TRIMESTRE via `periodes` →
 * mois), nouvelle famille cette session, puis cartes à lien PDF direct
 * (`.fr-card__title` / `a.fr-card__link`) — même famille que prefecture-44.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-48');

const URL_RACINE = 'https://www.lozere.gouv.fr/Publications/Recueil-des-Actes-Administratifs-R.A.A';
const URL_ANNEE = 'https://www.lozere.gouv.fr/Publications/Recueil-des-Actes-Administratifs-R.A.A/2026';
const URL_TRIMESTRE = 'https://www.lozere.gouv.fr/Publications/Recueil-des-Actes-Administratifs-R.A.A/2026/3eme-trimestre';
const URL_MOIS = 'https://www.lozere.gouv.fr/Publications/Recueil-des-Actes-Administratifs-R.A.A/2026/3eme-trimestre/Aout';
const URL_PDF_AVEC_ARRETE = 'https://www.lozere.gouv.fr/contenu/telechargement/35038/294799/file/recueil-48-2026-116.pdf';
const URL_PDF_SANS_ARRETE = 'https://www.lozere.gouv.fr/contenu/telechargement/35042/294819/file/recueil-48-2026-117.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlTrimestre: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 18, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026.html'), 'utf-8');
  htmlTrimestre = await readFile(path.join(FIXTURES_DIR, '3eme-trimestre.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_TRIMESTRE) return { ok: true, status: 200, text: async () => htmlTrimestre } as unknown as Response;
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

describe('connecteur réel prefecture-48 (récupération + traitement)', () => {
  it('résout la navigation à 3 niveaux (racine → année → trimestre via periodes → mois) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-48');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct', async () => {
    const connecteur = await obtenirConnecteur('prefecture-48');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('48');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('48-2026-116');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Lozère');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
