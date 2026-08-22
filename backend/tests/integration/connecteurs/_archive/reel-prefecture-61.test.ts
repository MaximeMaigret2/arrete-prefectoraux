import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 58-61) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-61`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à TROIS niveaux (racine → carte fixe → année → mois, même
 * profondeur que 59/Nord). Le fixture pour l'étape "mois" reproduit le
 * CONTENU final tel que `fetch()` le reçoit réellement après la
 * redirection HTTP confirmée en live (".../Aout" → ".../Aout/Speciaux-du-mois-d-aout-2026"),
 * directement sur l'URL de départ — `fetch()` suit les redirections nativement,
 * ce mock reste donc fidèle sans avoir à modéliser la redirection elle-même.
 * Liste finale : balisage `<ul><li><a href="....pdf">` totalement dépourvu
 * de classes (aucune carte DSFR sur cette page), à la différence de tous
 * les autres connecteurs de ce lot.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-61');

const URL_RACINE = 'https://www.orne.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA';
const URL_INTERMEDIAIRE =
  'https://www.orne.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA/Le-Recueil-des-Actes-Administratifs-RAA';
const URL_ANNEE =
  'https://www.orne.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA/Le-Recueil-des-Actes-Administratifs-RAA/Le-Recueil-des-Actes-Administratifs-2026';
const URL_MOIS =
  'https://www.orne.gouv.fr/Publications/Recueil-des-Actes-Administratifs-RAA/Le-Recueil-des-Actes-Administratifs-RAA/Le-Recueil-des-Actes-Administratifs-2026/Aout';
const URL_PDF_11 = 'https://www.orne.gouv.fr/contenu/telechargement/61011/610011/file/Special_n11_du_17_aout_2026.pdf';
const URL_PDF_10 = 'https://www.orne.gouv.fr/contenu/telechargement/61010/610010/file/Special_n10_du_14_aout_2026.pdf';

let htmlRacine: string;
let htmlIntermediaire: string;
let htmlAnnee: string;
let htmlMois: string;
let pdf11: Buffer;
let pdf10: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlIntermediaire = await readFile(path.join(FIXTURES_DIR, 'Le-Recueil-des-Actes-Administratifs-RAA.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Le-Recueil-des-Actes-Administratifs-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout.html'), 'utf-8');
  pdf11 = await readFile(path.join(FIXTURES_DIR, 'raa-61-special-11.pdf'));
  pdf10 = await readFile(path.join(FIXTURES_DIR, 'raa-61-special-10.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_INTERMEDIAIRE) return { ok: true, status: 200, text: async () => htmlIntermediaire } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_PDF_11) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf11.buffer.slice(pdf11.byteOffset, pdf11.byteOffset + pdf11.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_10) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf10.buffer.slice(pdf10.byteOffset, pdf10.byteOffset + pdf10.byteLength),
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

describe('connecteur réel prefecture-61 (récupération + traitement)', () => {
  it('résout la navigation à trois niveaux (racine → carte fixe → année → mois courant) sur une liste sans classes CSS', async () => {
    const connecteur = await obtenirConnecteur('prefecture-61');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (spécial n°11, pertinent), ignore le n°10 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-61');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('61');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('61-2026-011');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.autorite_signataire).toBe("Le préfet de l'Orne");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_11);
  });
});
