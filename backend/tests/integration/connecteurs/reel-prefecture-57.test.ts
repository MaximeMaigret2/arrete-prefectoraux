import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-27, chantier 57) — "récupération + traitement" du connecteur
 * RÉEL `prefecture-57`, contre une reconstruction fidèle de la structure du
 * site VALIDÉE PAR CAPTURE LIVE + requêtes réelles (`curl`, jar de cookies
 * explicite) — cf. `tests/fixtures/connecteurs/reel/prefecture-57/SOURCE.md`
 * pour le détail complet de l'investigation. `fetch` entièrement mocké —
 * aucun appel réseau réel.
 *
 * Test DÉDIÉ (comme prefecture-50) plutôt qu'absorbé par la suite
 * data-driven `reel-data-driven.test.ts` (Q-004) : ce connecteur est le
 * SEUL à exercer `session_cookie` (amorçage puis threading d'un cookie de
 * session sur les requêtes suivantes) ET `titre_frere` (libellé résolu
 * depuis un élément frère plutôt que descendant) — deux comportements que
 * le schéma générique `ReponseFixture`/`ManifestReel` (simple table
 * URL → fichier) ne peut pas exercer, en particulier la vérification que le
 * cookie de session est bien réinjecté sur la requête de la page liste.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-57');

const URL_AMORCAGE = 'https://mc.moselle.gouv.fr/raa.html';
const URL_LISTE = 'https://mc.moselle.gouv.fr/index.php?op=raa&do=raa-acte';
const URL_PDF_NON_PERTINENT = 'https://mc.moselle.gouv.fr/index.php?dims_op=doc_file_download&docfile_md5id=959fa09f209c39a9959a821d5cc76398';
const URL_PDF_RAVE = 'https://mc.moselle.gouv.fr/index.php?dims_op=doc_file_download&docfile_md5id=f4cdf90d36ca27c56a6b6bb5e2c48a7c';

// Cookies réellement observés en capture live (2026-08-27, cf. SOURCE.md) —
// leurs VALEURS (session aléatoire par nature) n'ont aucune importance ici,
// seule compte la mécanique de threading (amorçage → Cookie réinjecté).
const SET_COOKIE_AMORCAGE = ['DIMSPHPSESSID=jmcfjg2uscuqas3lookvd1cp7p; path=/; HttpOnly', 'nocache=1'];
const COOKIE_ATTENDU = 'DIMSPHPSESSID=jmcfjg2uscuqas3lookvd1cp7p; nocache=1';

let htmlAmorcage: string;
let htmlListe: string;
let pdfNonPertinent: Buffer;
let pdfRave: Buffer;
let appelsFetch: Array<{ url: string; cookie: string | undefined }>;

beforeEach(async () => {
  htmlAmorcage = await readFile(path.join(FIXTURES_DIR, 'raa.html'), 'utf-8');
  htmlListe = await readFile(path.join(FIXTURES_DIR, 'liste.html'), 'utf-8');
  pdfNonPertinent = await readFile(path.join(FIXTURES_DIR, 'derogation-nitrates.pdf'));
  pdfRave = await readFile(path.join(FIXTURES_DIR, 'arrete-rave-party.pdf'));
  appelsFetch = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { headers?: Record<string, string> }) => {
      appelsFetch.push({ url, cookie: init?.headers?.Cookie });

      if (url === URL_AMORCAGE) {
        return {
          ok: true,
          status: 200,
          text: async () => htmlAmorcage,
          headers: { getSetCookie: () => SET_COOKIE_AMORCAGE },
        } as unknown as Response;
      }
      if (url === URL_LISTE) {
        return { ok: true, status: 200, text: async () => htmlListe } as unknown as Response;
      }
      if (url === URL_PDF_NON_PERTINENT || url === URL_PDF_RAVE) {
        const buf = url === URL_PDF_RAVE ? pdfRave : pdfNonPertinent;
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connecteur réel prefecture-57 (Moselle, chantier 57)', () => {
  it('amorce la session (raa.html) avant la page liste, et réinjecte le cookie de session obtenu sur celle-ci', async () => {
    const connecteur = await obtenirConnecteur('prefecture-57');
    expect(connecteur).not.toBeNull();

    await connecteur!.collecter();

    const appelAmorcage = appelsFetch.find((a) => a.url === URL_AMORCAGE);
    const appelListe = appelsFetch.find((a) => a.url === URL_LISTE);
    expect(appelAmorcage).toBeDefined();
    expect(appelAmorcage?.cookie).toBeUndefined(); // rien à réinjecter avant l'amorçage lui-même
    expect(appelListe?.cookie).toBe(COOKIE_ATTENDU);
  });

  it('ne retient que l\'acte pertinent (rave-party) parmi les 2 de la liste — le libellé (élément frère) filtre, la seule référence ne suffirait pas', async () => {
    const connecteur = await obtenirConnecteur('prefecture-57');
    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    expect(resultat.candidats[0].reference_arrete).toBe('CAB/DS/PSI n°222');
  });

  it("extrait correctement dates/signataire, et référence le PDF réel comme source même si celui-ci est un scan sans texte extractible", async () => {
    const connecteur = await obtenirConnecteur('prefecture-57');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('57');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 7)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 10)).toISOString());
    expect(candidat.date_fin_ambigue).toBe(false);
    expect(candidat.autorite_signataire).toBe('Le préfet de la Moselle');
    // Le PDF (scan, 0 caractère extractible — pdf-parse renvoie texte:null) ne
    // remplace jamais le texte d'extraction (titre + libellé), mais devient
    // quand même la source du candidat une fois celui-ci retenu comme
    // pertinent (comportement générique déjà existant du moteur page_web).
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_RAVE);
  });
});
