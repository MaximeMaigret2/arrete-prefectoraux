import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-22`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-22/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-22')`, donc
 * le VRAI `configs/prefecture-22.yaml` déployé — y compris sa `navigation`
 * à UN SEUL niveau (racine → mois, sans carte année intermédiaire), résolue
 * dynamiquement à partir de la date système figée au 14/08/2026
 * (`vi.setSystemTime`). La page du mois liste des cartes DSFR complètes
 * avec lien PDF DIRECT (`h2.fr-card__title a`, pas de `page_detail`) ;
 * seule celle dont le PDF est mocké avec un texte pertinent (273) produit
 * un candidat — l'autre bulletin mocké (272) retombe sur un PDF sans
 * mot-clé rave/teknival, donc écarté sans provoquer d'échec.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-22');

const URL_RACINE = 'https://www.cotes-darmor.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_AOUT = 'https://www.cotes-darmor.gouv.fr/Publications/Recueil-des-actes-administratifs/AOUT-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.cotes-darmor.gouv.fr/contenu/telechargement/80772/662945/file/recueil-22-2026-273-recueil-des-actes-administratifs.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.cotes-darmor.gouv.fr/contenu/telechargement/80771/662940/file/recueil-22-2026-272-recueil-des-actes-administratifs-nominatifs.pdf';

let htmlRacine: string;
let htmlAout: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
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

describe('connecteur réel prefecture-22 (récupération + traitement)', () => {
  it('résout la navigation à 1 seul niveau (racine → mois) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-22');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-22');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('22');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('22-2026-273-001');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet des Côtes-d\'Armor');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
