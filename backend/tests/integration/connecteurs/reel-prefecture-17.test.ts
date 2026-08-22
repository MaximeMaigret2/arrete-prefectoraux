import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * Phase 5bis élargie 4 (2026-08-14) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-17`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-17/,
 * cf. SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel dans
 * cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-17')`, donc
 * le VRAI `configs/prefecture-17.yaml` déployé — y compris sa `navigation`
 * à 1 niveau dont la toute première étape lit `value` (pas `href`) sur un
 * `<option>` de `<select>` (V011, aucun `<a>` équivalent sur la page racine
 * réelle, cf. SOURCE.md), résolue dynamiquement à partir de la date
 * système : l'horloge est figée au 13/08/2026 (`vi.setSystemTime`) pour que
 * ce test reste vrai après cette date. La page année liste 4 publications,
 * chacune avec un lien PDF DIRECT (pas de page_detail, contrairement à
 * prefecture-16/77) ; seules les 2 dont le PDF est mocké (285 avec arrêté,
 * 284 sans) ont un contenu simulé — les 2 autres (283, 282) retombent sur
 * le 404 générique du mock, sans mot-clé pertinent dans leur titre, donc
 * écartées sans provoquer d'échec.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-17');

const URL_RACINE = 'https://www.charente-maritime.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs';
const URL_ANNEE = 'https://www.charente-maritime.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs/Annee-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.charente-maritime.gouv.fr/contenu/telechargement/87584/615323/file/Recueil-17-2026-08-285-nominatifs.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.charente-maritime.gouv.fr/contenu/telechargement/87583/615318/file/Recueil-17-2026-08-284-special.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
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

describe('Phase 5bis élargie 4 — connecteur réel prefecture-17 (récupération + traitement)', () => {
  it('résout la navigation (racine → année, via `value` d’un `<option>`) puis ignore le bulletin sans arrêté rave/teknival malgré un titre non filtrable', async () => {
    const connecteur = await obtenirConnecteur('prefecture-17');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-17');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('17');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('17-2026-08-285-001');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet de la Charente-Maritime');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
