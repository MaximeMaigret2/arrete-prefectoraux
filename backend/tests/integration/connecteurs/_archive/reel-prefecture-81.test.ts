import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 78-82) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-81`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à TROIS niveaux (racine → unique carte fixe "RAA" → année →
 * mois). Liste finale : cartes "actualité" (`a.fr-card__link`), chacune
 * menant à une page de détail HTML — MÊME FAMILLE que
 * prefecture-44/58/60/77 (`page_detail`, attribut par défaut `href`).
 * Page de détail : bloc "Documents associés", un seul lien
 * `a[href$=".pdf"]` (pas de classe `fr-link--download` sur ce site).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-81');

const URL_RACINE = 'https://www.tarn.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs';
const URL_RAA = 'https://www.tarn.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs/RAA';
const URL_ANNEE_2026 = 'https://www.tarn.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs/RAA/2026';
const URL_AOUT = 'https://www.tarn.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs/RAA/2026/Aout';
const URL_DETAIL_336 =
  'https://www.tarn.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs/RAA/2026/Aout/RAA-HEBDOMADAIRE-N-336-du-vendredi-14-aout-au-jeudi-20-aout-2026';
const URL_DETAIL_335 =
  'https://www.tarn.gouv.fr/Publications/RAA-Recueil-des-Actes-Administratifs/RAA/2026/Aout/RAA-SPECIAL-N-335-Arrete-derogeant-aux-restrictions-d-eau-pour-l-irrigation-des-stades-d-Albi';
const URL_PDF_336 =
  'https://www.tarn.gouv.fr/contenu/telechargement/30022/284333/file/recueil-81-2026-336-recueil-des-actes-administratifs.pdf';
const URL_PDF_335 =
  'https://www.tarn.gouv.fr/contenu/telechargement/30019/284300/file/recueil-81-2026-335-recueil-des-actes-administratifs.pdf';

let htmlRacine: string;
let htmlRaa: string;
let htmlAnnee2026: string;
let htmlAout: string;
let htmlDetail336: string;
let htmlDetail335: string;
let pdf336: Buffer;
let pdf335: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlRaa = await readFile(path.join(FIXTURES_DIR, 'raa.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  htmlDetail336 = await readFile(path.join(FIXTURES_DIR, 'detail-336.html'), 'utf-8');
  htmlDetail335 = await readFile(path.join(FIXTURES_DIR, 'detail-335.html'), 'utf-8');
  pdf336 = await readFile(path.join(FIXTURES_DIR, 'raa-81-2026-336.pdf'));
  pdf335 = await readFile(path.join(FIXTURES_DIR, 'raa-81-2026-335.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_RAA) return { ok: true, status: 200, text: async () => htmlRaa } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_DETAIL_336)
        return { ok: true, status: 200, text: async () => htmlDetail336 } as unknown as Response;
      if (url === URL_DETAIL_335)
        return { ok: true, status: 200, text: async () => htmlDetail335 } as unknown as Response;
      if (url === URL_PDF_336) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf336.buffer.slice(pdf336.byteOffset, pdf336.byteOffset + pdf336.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_335) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf335.buffer.slice(pdf335.byteOffset, pdf335.byteOffset + pdf335.byteLength),
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

describe('connecteur réel prefecture-81 (récupération + traitement)', () => {
  it('résout les 2 publications du mois courant via leur page de détail (page_detail)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-81');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (336, pertinent), ignore le 335 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-81');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('81');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('81-2026-08-20-336');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Tarn');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_336);
  });
});
