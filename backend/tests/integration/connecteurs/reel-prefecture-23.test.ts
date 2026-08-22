import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-23`, contre une reconstruction fidèle de la structure du site
 * (backend/tests/fixtures/connecteurs/reel/prefecture-23/, cf. SOURCE.md),
 * `fetch` entièrement mocké — aucun appel réseau réel dans cette suite.
 *
 * PARTICULARITÉ DE CE CONNECTEUR (unique à ce jour) : `bulletin-avec-arrete.pdf`
 * n'est PAS un fichier synthétique mais le vrai PDF téléchargé
 * (`2026-081.pdf`, RAA spécial n°23-2026-136 de la Creuse) contenant un
 * arrêté anti rave-party RÉEL et actuellement en vigueur (14-17 août 2026)
 * — première fois qu'un tel arrêté est trouvé parmi tous les connecteurs
 * déployés (cf. SOURCE.md). `bulletin-sans-arrete-pertinent.pdf` est aussi
 * un vrai PDF (`2026-082.pdf`, arrêté anti feux d'artifice, sans rapport).
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-23')`, donc
 * le VRAI `configs/prefecture-23.yaml` déployé — y compris sa `navigation`
 * à DEUX niveaux (racine → année → catégorie « Spéciaux »), résolue
 * dynamiquement à partir de la date système figée au 14/08/2026
 * (`vi.setSystemTime`).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-23');

const URL_RACINE = 'https://www.creuse.gouv.fr/Publications/Les-Recueils-des-actes-administratifs';
const URL_ANNEE = 'https://www.creuse.gouv.fr/Publications/Les-Recueils-des-actes-administratifs/Annee-2026';
const URL_SPECIAUX = 'https://www.creuse.gouv.fr/Publications/Les-Recueils-des-actes-administratifs/Annee-2026/Speciaux';
const URL_PDF_AVEC_ARRETE = 'https://www.creuse.gouv.fr/contenu/telechargement/23844/173720/file/2026-081.pdf';
const URL_PDF_SANS_ARRETE = 'https://www.creuse.gouv.fr/contenu/telechargement/23848/173740/file/2026-082.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlSpeciaux: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlSpeciaux = await readFile(path.join(FIXTURES_DIR, 'speciaux-2026.html'), 'utf-8');
  pdfAvecArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-avec-arrete.pdf'));
  pdfSansArrete = await readFile(path.join(FIXTURES_DIR, 'bulletin-sans-arrete-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_SPECIAUX) return { ok: true, status: 200, text: async () => htmlSpeciaux } as unknown as Response;
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

describe('connecteur réel prefecture-23 (récupération + traitement, PDF réels)', () => {
  it('résout la navigation à 2 niveaux (racine → année → Spéciaux) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-23');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du VRAI PDF (arrêté réel du 11/08/2026, en vigueur 14-17/08/2026)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-23');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('23');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('23-2026-08-11-0015');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Creuse');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
