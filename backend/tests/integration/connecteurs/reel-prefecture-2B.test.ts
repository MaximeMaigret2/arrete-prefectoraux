import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-14) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-2B`, contre une reconstruction fidèle de la structure du
 * site (backend/tests/fixtures/connecteurs/reel/prefecture-2B/, cf.
 * SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel dans
 * cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-2B')`, donc
 * le VRAI `configs/prefecture-2B.yaml` déployé — y compris sa `navigation`
 * à 2 niveaux (racine → année → mois), résolue dynamiquement à partir de
 * la date système : l'horloge est figée au 14/08/2026 (`vi.setSystemTime`)
 * pour que ce test reste vrai après cette date, en particulier pour
 * l'élision "-mois-d-aout-2026" du deuxième motif de navigation.
 *
 * La page finale du mois expose DEUX groupes reprenant les mêmes bulletins
 * (liste narrative avec `id` VALIDE puis groupe `div.fr-downloads-group`
 * avec `id` VIDE malformé) — la config ne cible que le second
 * (`selecteur_publications: "div.fr-downloads-group li"`), avec
 * `selecteur_titre`/`selecteur_lien_pdf: "a"` (pas de sélecteur de classe,
 * inutilisable sur ce HTML malformé). Seul le bulletin dont le PDF est
 * mocké avec un texte pertinent (RAA n°09) produit un candidat — l'autre
 * bulletin mocké (RAA n°08) retombe sur un PDF sans mot-clé rave/teknival,
 * donc écarté sans provoquer d'échec.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-2B');

const URL_RACINE =
  'https://www.haute-corse.gouv.fr/Publications/Publications-administratives-et-legales/Recueils-des-actes-administratifs';
const URL_ANNEE =
  'https://www.haute-corse.gouv.fr/Publications/Publications-administratives-et-legales/Recueils-des-actes-administratifs/Recueil-des-actes-administratifs-2026';
const URL_MOIS =
  'https://www.haute-corse.gouv.fr/Publications/Publications-administratives-et-legales/Recueils-des-actes-administratifs/Recueil-des-actes-administratifs-2026/RAA-du-mois-d-aout-2026';
const URL_PDF_AVEC_ARRETE =
  'https://www.haute-corse.gouv.fr/contenu/telechargement/15203/123014/file/RAA%20n%C2%B009%20du%2013%20ao%C3%BBt%202026.pdf';
const URL_PDF_SANS_ARRETE =
  'https://www.haute-corse.gouv.fr/contenu/telechargement/15177/122809/file/RAA%20n%C2%B008%20du%2007%20ao%C3%BBt%202026%20Special.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdfAvecArrete: Buffer;
let pdfSansArrete: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 14, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'aout-2026.html'), 'utf-8');
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

describe('connecteur réel prefecture-2B (récupération + traitement)', () => {
  it('résout la navigation à 2 niveaux (racine → année → mois, avec élision "-mois-d-aout-2026"), cible le groupe de téléchargements (id vide) et ignore le bulletin sans arrêté rave/teknival', async () => {
    const connecteur = await obtenirConnecteur('prefecture-2B');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF direct (titre seul jamais suffisant sur ce site)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-2B');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('2B');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('2B-2026-08-13-00010');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.autorite_signataire).toBe('La Préfète de la Haute-Corse');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_AVEC_ARRETE);
  });
});
