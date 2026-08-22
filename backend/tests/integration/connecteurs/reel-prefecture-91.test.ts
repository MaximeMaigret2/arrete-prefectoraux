import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 88-92) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-91`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → année → mois, motifs "{annee}$" puis
 * "{mois_fr}$"). Liste finale : chaque publication portée par un `<p>`
 * (pas un `div[class='']` ni une `.fr-card`), `p:has(a.fr-link--download)`,
 * même famille de marquage que prefecture-80.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-91');

const URL_RACINE = 'https://www.essonne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA';
const URL_ANNEE_2026 = 'https://www.essonne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/2026';
const URL_AOUT = 'https://www.essonne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/2026/Aout';
const URL_PDF_278 =
  'https://www.essonne.gouv.fr/contenu/telechargement/71278/455278/file/recueil-91-2026-278-recueil-des-actes-administratifs.pdf';
const URL_PDF_255 =
  'https://www.essonne.gouv.fr/contenu/telechargement/71255/455255/file/recueil-91-2026-255-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let htmlAout: string;
let pdf278: Buffer;
let pdf255: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  pdf278 = await readFile(path.join(FIXTURES_DIR, 'recueil-91-2026-278-recueil-des-actes-administratifs.pdf'));
  pdf255 = await readFile(path.join(FIXTURES_DIR, 'recueil-91-2026-255-recueil-des-actes-administratifs.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_PDF_278) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf278.buffer.slice(pdf278.byteOffset, pdf278.byteOffset + pdf278.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_255) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf255.buffer.slice(pdf255.byteOffset, pdf255.byteOffset + pdf255.byteLength),
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

describe('connecteur réel prefecture-91 (récupération + traitement)', () => {
  it('résout les 2 publications du mois courant (liste plate, publications portées par <p>)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-91');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (278, pertinent), ignore le 255 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-91');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('91');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('91-2026-278');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe("La préfète de l'Essonne");
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_278);
  });
});
