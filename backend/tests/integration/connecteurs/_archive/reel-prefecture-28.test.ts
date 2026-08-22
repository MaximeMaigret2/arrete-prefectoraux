import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14, Phase 5bis élargie 10, lot 26-30) — "récupération +
 * traitement" du connecteur RÉEL `prefecture-28`, contre une reconstruction
 * fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-28/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-28')`, donc
 * le VRAI `configs/prefecture-28.yaml` déployé — y compris sa `navigation`
 * à DEUX niveaux (racine → année → mois), résolue dynamiquement à partir de
 * la date système figée au 14/08/2026 (`vi.setSystemTime`). La page du mois
 * liste des `div[class=""]:has(a.fr-link--download)` (piège des divs
 * ancêtres découvert cette session, cf. config) avec lien PDF DIRECT ; seul
 * le bulletin dont le PDF est mocké avec un texte pertinent produit un
 * candidat — les deux autres retombent sur un PDF sans mot-clé rave/teknival
 * (ou aucun mock), donc écartés sans provoquer d'échec.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-28');

const URL_RACINE = 'https://www.eure-et-loir.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.eure-et-loir.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueil-des-actes-administratifs-2026';
const URL_AOUT = 'https://www.eure-et-loir.gouv.fr/Publications/Recueil-des-actes-administratifs/Recueil-des-actes-administratifs-2026/Aout';
const URL_PDF_AVEC_ARRETE =
  'https://www.eure-et-loir.gouv.fr/contenu/telechargement/62315/410373/file/AP_commission_propagande_et_dates_livraison_docs.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.eure-et-loir.gouv.fr/contenu/telechargement/62316/410378/file/AP%202026-1503%20-%20listant%20les%20formateurs%20habilit%C3%A9s-1.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlAout: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
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

describe('connecteur réel prefecture-28 (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → année → mois) puis ignore les bulletins sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-28');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-28');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('28');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('28-2026-08-14-00007');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le Préfet d'Eure-et-Loir");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
