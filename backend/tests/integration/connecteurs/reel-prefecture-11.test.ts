import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie 3 (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-11`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-11/,
 * cf. SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel dans
 * cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-11')`, donc
 * le VRAI `configs/prefecture-11.yaml` déployé — y compris sa `navigation`
 * à 2 niveaux (année → mois, sans suffixe d'année sur le lien du mois, comme
 * prefecture-07), résolue dynamiquement à partir de la date système :
 * l'horloge est figée au 13/08/2026 (`vi.setSystemTime`) pour que ce test
 * reste vrai après cette date.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-11');

const URL_RACINE = 'https://www.aude.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA';
const URL_ANNEE = 'https://www.aude.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA/Annee-2026';
const URL_MOIS = 'https://www.aude.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA/Annee-2026/Aout';
const URL_PDF_AVEC_ARRETE =
  'https://www.aude.gouv.fr/contenu/telechargement/38400/263800/file/RAA%20SPECIAL%20N%C2%B0%2016_AO%C3%9BT%202026.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.aude.gouv.fr/contenu/telechargement/38405/263810/file/RAA%20SPECIAL%20N%C2%B0%2017_AO%C3%9BT%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'mois-aout-2026.html'), 'utf-8');
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

describe('Phase 5bis élargie 3 — connecteur réel prefecture-11 (récupération + traitement)', () => {
  it('résout la navigation (racine → année → mois, sans suffixe année sur le lien du mois) puis ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable', async () => {
    const connecteur = await obtenirConnecteur('prefecture-11');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-11');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('11');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('11-2026-08-320');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le Préfet de l'Aude");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
