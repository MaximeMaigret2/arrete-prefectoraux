import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 72-76) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-75`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * PARTICULARITÉ MAJEURE : premier connecteur dont le site source est la
 * plateforme SPIP `prefectures-regions.gouv.fr` (pas un site DSFR
 * "www.<departement>.gouv.fr") — cf. commentaire détaillé de la config.
 * Navigation à DEUX niveaux : racine (page de recherche par tags, stable,
 * sans année dans l'URL) → carte de l'année ("Raa-du-departement-de-Paris-{annee}$",
 * écarte l'entrée "RAA de la région Île-de-France" hors périmètre) →
 * carte du mois ("#sommaire-content a", motif "/{mois_fr}/" NON ancré car
 * l'URL résolue se termine par un fragment "#titre"). Liste finale : liste
 * plate sans pagination, `div[class='']:has(a.link-download)` (classe
 * propre à cette plateforme, pas `fr-*`), lien PDF direct, pas de
 * `page_detail`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-75');

const URL_RACINE =
  'https://www.prefectures-regions.gouv.fr/ile-de-france/tags/view/Ile-de-France/Documents+et+Publications/Recueil+des+actes+administratifs';
const URL_ANNEE_2026 =
  'https://www.prefectures-regions.gouv.fr/ile-de-france/Documents-publications/Recueil-des-actes-administratifs/Raa-du-departement-de-Paris-2026';
const URL_AOUT =
  'https://www.prefectures-regions.gouv.fr/ile-de-france/Documents-publications/Recueil-des-actes-administratifs/Raa-du-departement-de-Paris-2026/Aout/#titre';
const URL_PDF_492 =
  'https://www.prefectures-regions.gouv.fr/ile-de-france/irecontenu/telechargement/140372/1021994/file/recueil-75-2026-492-recueil-des-actes-administratifs-special%20du%2020.08.2026.pdf';
const URL_PDF_491 =
  'https://www.prefectures-regions.gouv.fr/ile-de-france/irecontenu/telechargement/140300/1021541/file/recueil-75-2026-491-recueil-des-actes-administratifs-nominatifs.pdf';

let htmlRacine: string;
let htmlAnnee2026: string;
let htmlAout: string;
let pdf492: Buffer;
let pdf491: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee2026 = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlAout = await readFile(path.join(FIXTURES_DIR, 'aout.html'), 'utf-8');
  pdf492 = await readFile(path.join(FIXTURES_DIR, 'raa-75-492.pdf'));
  pdf491 = await readFile(path.join(FIXTURES_DIR, 'raa-75-491.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE_2026)
        return { ok: true, status: 200, text: async () => htmlAnnee2026 } as unknown as Response;
      if (url === URL_AOUT) return { ok: true, status: 200, text: async () => htmlAout } as unknown as Response;
      if (url === URL_PDF_492) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf492.buffer.slice(pdf492.byteOffset, pdf492.byteOffset + pdf492.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_491) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf491.buffer.slice(pdf491.byteOffset, pdf491.byteOffset + pdf491.byteLength),
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

describe('connecteur réel prefecture-75 (récupération + traitement)', () => {
  it('résout les 2 publications du mois courant (navigation 2 niveaux, plateforme SPIP)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-75');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (492, pertinent), ignore le 491 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-75');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('75');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('75-2026-08-20-492');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de police de Paris');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_492);
  });
});
