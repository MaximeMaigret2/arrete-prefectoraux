import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-04`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-04/,
 * cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-04')`, donc
 * le VRAI `configs/prefecture-04.yaml` déployé — y compris sa `navigation`
 * par PÉRIODES irrégulières (V009, `navigation[0].periodes`) : avec l'horloge
 * figée au 13/08/2026 (`vi.setSystemTime`), le mois courant (8) tombe dans
 * la période "de août à décembre" [8, 12] — c'est ce motif que le moteur
 * doit choisir, jamais celui de "janvier à juillet".
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-04');

const URL_RACINE =
  'https://www.alpes-de-haute-provence.gouv.fr/Publications/Publications-administratives-et-legales/Recueil-des-Actes-Administratifs';
const URL_SEMESTRE_AOUT_DECEMBRE =
  'https://www.alpes-de-haute-provence.gouv.fr/Publications/Publications-administratives-et-legales/Recueil-des-Actes-Administratifs/2026-de-aout-a-decembre';
const URL_PDF_AVEC_ARRETE =
  'https://www.alpes-de-haute-provence.gouv.fr/contenu/telechargement/14001/84001/file/RS-04-2026-228.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.alpes-de-haute-provence.gouv.fr/contenu/telechargement/14002/84002/file/RS-04-2026-220.pdf';

let htmlRacine: string;
let htmlSemestre: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlSemestre = await readFile(path.join(FIXTURES_DIR, 'semestre-2026-aout-decembre.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_SEMESTRE_AOUT_DECEMBRE) {
        return { ok: true, status: 200, text: async () => htmlSemestre } as unknown as Response;
      }
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

describe('Phase 5bis élargie — connecteur réel prefecture-04 (récupération + traitement)', () => {
  it("résout la navigation par périodes (choisit \"août à décembre\", jamais \"janvier à juillet\") puis ignore le bulletin sans arrêté rave/teknival", async () => {
    const connecteur = await obtenirConnecteur('prefecture-04');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-04');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('04');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('04-2026-08-228');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet des Alpes-de-Haute-Provence');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
