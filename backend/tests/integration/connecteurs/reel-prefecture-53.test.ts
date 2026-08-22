import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-19, lot 52-56) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-53`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. SOURCE.md), `fetch` entièrement mocké.
 *
 * Navigation à DEUX niveaux (racine → année → mois) vers une liste plate
 * de publications du mois, chacune dans un `<p>` sans classe contenant
 * directement `a.fr-link--download` (même famille que 37/41/45/49/55).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-53');

const URL_RACINE = 'https://www.mayenne.gouv.fr/Publications/Recueil-Actes-Administratifs';
const URL_ANNEE = 'https://www.mayenne.gouv.fr/Publications/Recueil-Actes-Administratifs/Annee-2026';
const URL_AOUT = 'https://www.mayenne.gouv.fr/Publications/Recueil-Actes-Administratifs/Annee-2026/Aout-2026';
const URL_PDF_180 = 'https://www.mayenne.gouv.fr/contenu/telechargement/60347/432871/file/recueil-53-2026-180-recueil-des-actes-administratifs.pdf';
const URL_PDF_166 = 'https://www.mayenne.gouv.fr/contenu/telechargement/60205/431886/file/recueil-53-2026-166-recueil-des-actes-administratifs-special.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlAout: string;
let pdf180: Buffer;
let pdf166: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 19, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'Annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'Aout-2026.html'), 'utf-8');
  pdf180 = await readFile(path.join(FIXTURES_DIR, 'recueil-53-2026-180.pdf'));
  pdf166 = await readFile(path.join(FIXTURES_DIR, 'recueil-53-2026-166.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_PDF_180) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf180.buffer.slice(pdf180.byteOffset, pdf180.byteOffset + pdf180.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_166) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf166.buffer.slice(pdf166.byteOffset, pdf166.byteOffset + pdf166.byteLength),
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

describe('connecteur réel prefecture-53 (récupération + traitement)', () => {
  it('résout la navigation (racine → année → mois) et filtre la publication non pertinente', async () => {
    const connecteur = await obtenirConnecteur('prefecture-53');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF', async () => {
    const connecteur = await obtenirConnecteur('prefecture-53');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('53');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('53-2026-180');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 18)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète de la Mayenne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_180);
  });
});
