import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 83-87) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-83`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à TROIS niveaux (racine → année → mois), avec une 3e étape
 * OPTIONNELLE : la page du mois est paginée et triée du plus ancien au plus
 * récent (vérifié en live : page 1 commence par le RAA du 2 août, la
 * dernière page se termine par celui du 21 août) — même mécanisme que
 * prefecture-64/74. Le fixture "Aout-2026.html" (page 1) ne sert qu'à
 * fournir le lien de pagination "Dernière page" ; le fixture
 * "Aout-2026-offset20.html" reproduit la dernière page réellement utilisée
 * pour l'extraction. Publications en cartes DSFR complètes (`.fr-card`)
 * dont le lien direct est le PDF (pas de page de détail).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-83');

const URL_RACINE = 'https://www.var.gouv.fr/Publications/RAA-Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.var.gouv.fr/Publications/RAA-Recueil-des-actes-administratifs/Recueil-des-actes-administratifs-2026';
const URL_MOIS = `${URL_ANNEE}/Aout-2026`;
const URL_MOIS_DERNIERE = `${URL_MOIS}/(offset)/20`;
const URL_PDF_306 = 'https://www.var.gouv.fr/contenu/telechargement/47901/310701/file/RAA-N-306-du-20-aout-2026.pdf';
const URL_PDF_307 = 'https://www.var.gouv.fr/contenu/telechargement/47907/310707/file/RAA-N-307-du-21-aout-2026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlMois: string;
let htmlMoisDerniere: string;
let pdf306: Buffer;
let pdf307: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlMois = await readFile(path.join(FIXTURES_DIR, 'Aout-2026.html'), 'utf-8');
  htmlMoisDerniere = await readFile(path.join(FIXTURES_DIR, 'Aout-2026-offset20.html'), 'utf-8');
  pdf306 = await readFile(path.join(FIXTURES_DIR, 'raa-306-non-pertinent.pdf'));
  pdf307 = await readFile(path.join(FIXTURES_DIR, 'raa-307-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_MOIS) return { ok: true, status: 200, text: async () => htmlMois } as unknown as Response;
      if (url === URL_MOIS_DERNIERE) return { ok: true, status: 200, text: async () => htmlMoisDerniere } as unknown as Response;
      if (url === URL_PDF_306) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf306.buffer.slice(pdf306.byteOffset, pdf306.byteOffset + pdf306.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_307) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf307.buffer.slice(pdf307.byteOffset, pdf307.byteOffset + pdf307.byteLength),
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

describe('connecteur réel prefecture-83 (récupération + traitement)', () => {
  it('résout la navigation à trois niveaux avec saut optionnel vers la dernière page de pagination', async () => {
    const connecteur = await obtenirConnecteur('prefecture-83');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (307, pertinent), ignore le 306 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-83');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('83');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('83-2026-08-21-307');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Var');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_307);
  });
});
