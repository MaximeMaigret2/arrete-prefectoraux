import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-18, lot 37-41) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-41`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, 2026-08-18 — cf.
 * SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel.
 *
 * Seul connecteur du lot 37-41 avec 2 niveaux de `navigation` (racine →
 * année → mois, comme prefecture-01/33/36) ; liste finale plate
 * (`div[class='']:has(a.fr-link--download)`). PIÈGE CONFIRMÉ EN LIVE : le
 * segment mois de l'année COURANTE (2026) n'a PAS le suffixe "-{annee}"
 * (".../Annee-2026/Aout", pas "Aout-2026") — à la différence des années
 * archivées (ex. 2020, où "Aout-2020" est bien suffixé) — d'où le motif
 * `"{mois_fr}(-{annee})?$"` (suffixe optionnel) dans `prefecture-41.yaml`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-41');

const URL_RACINE = 'https://www.loir-et-cher.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.loir-et-cher.gouv.fr/Publications/Recueil-des-actes-administratifs/Annee-2026';
const URL_MOIS = 'https://www.loir-et-cher.gouv.fr/Publications/Recueil-des-actes-administratifs/Annee-2026/Aout';
const URL_PDF_AVEC_ARRETE =
  'https://www.loir-et-cher.gouv.fr/contenu/telechargement/41101/300101/file/recueil-41-2026-08-14-00044-recueil-des-actes-administratifs.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.loir-et-cher.gouv.fr/contenu/telechargement/41100/300100/file/recueil-41-2026-08-12-00043-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout.html'), 'utf-8');
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

describe('connecteur réel prefecture-41 (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → année → mois) puis ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-41');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct', async () => {
    const connecteur = await obtenirConnecteur('prefecture-41');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('41');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('41-2026-08-14-00044');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 14)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 17)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de Loir-et-Cher');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
