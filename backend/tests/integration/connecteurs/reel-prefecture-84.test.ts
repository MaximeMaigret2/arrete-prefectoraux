import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 83-87) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-84`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → année → mois). Liste finale : cartes
 * DSFR (`.fr-card`) triées du PLUS RÉCENT au plus ancien (vérifié en live :
 * le premier bulletin de la page est celui du 21 août, jour de la
 * capture) — page 1 suffit, pas de saut de pagination nécessaire malgré une
 * pagination présente sur le site réel. Chaque `.fr-card__title a` pointe
 * DIRECTEMENT vers le PDF (pas de page de détail).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-84');

const URL_RACINE = 'https://www.vaucluse.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA';
const URL_ANNEE = 'https://www.vaucluse.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/Recueil-des-Actes-Administratifs-2026';
const URL_MOIS = `${URL_ANNEE}/Aout-2026`;
const URL_PDF_127 =
  'https://www.vaucluse.gouv.fr/contenu/telechargement/38922/295033/file/recueil-84-2026-127-recueil-des-actes-administratifs-du-20-aout-2026.pdf';
const URL_PDF_128 =
  'https://www.vaucluse.gouv.fr/contenu/telechargement/38930/295041/file/recueil-84-2026-128-recueil-des-actes-administratifs-du-21-aout-2026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let pdf127: Buffer;
let pdf128: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout-2026.html'), 'utf-8');
  pdf127 = await readFile(path.join(FIXTURES_DIR, 'raa-127-non-pertinent.pdf'));
  pdf128 = await readFile(path.join(FIXTURES_DIR, 'raa-128-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_PDF_127) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf127.buffer.slice(pdf127.byteOffset, pdf127.byteOffset + pdf127.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_128) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf128.buffer.slice(pdf128.byteOffset, pdf128.byteOffset + pdf128.byteLength),
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

describe('connecteur réel prefecture-84 (récupération + traitement)', () => {
  it('résout la navigation à deux niveaux (racine → année → mois)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-84');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (128, pertinent), ignore le 127 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-84');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('84');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('84-2026-08-21-128');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de Vaucluse');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_128);
  });
});
