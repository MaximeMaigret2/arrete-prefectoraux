import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 83-87) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-86`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Cas le plus simple rencontré depuis le début du projet : AUCUNE
 * navigation (`navigation: []`, valeur par défaut du schéma) — `url_liste`
 * EST directement la liste complète de toutes les publications RAA du
 * département (823 éléments en live, aucune pagination), chaque
 * publication étant un simple `<li>` contenant un unique
 * `a.fr-link--download` (titre ET lien PDF direct).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-86');

const URL_RACINE = 'https://www.vienne.gouv.fr/Publications/Recueil-des-Actes-Administratifs';
const URL_PDF_206 = 'https://www.vienne.gouv.fr/contenu/telechargement/50132/308889/file/2026-08-20-N206.pdf';
const URL_PDF_207 = 'https://www.vienne.gouv.fr/contenu/telechargement/50139/308896/file/2026-08-21-N207.pdf';

let htmlRacine: string;
let pdf206: Buffer;
let pdf207: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  pdf206 = await readFile(path.join(FIXTURES_DIR, 'raa-206-non-pertinent.pdf'));
  pdf207 = await readFile(path.join(FIXTURES_DIR, 'raa-207-pertinent.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_PDF_206) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf206.buffer.slice(pdf206.byteOffset, pdf206.byteOffset + pdf206.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_207) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf207.buffer.slice(pdf207.byteOffset, pdf207.byteOffset + pdf207.byteLength),
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

describe('connecteur réel prefecture-86 (récupération + traitement)', () => {
  it("résout la liste sans aucune étape de navigation (url_liste = liste finale)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-86');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (207, pertinent), ignore le 206 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-86');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('86');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('86-2026-08-21-207');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 23)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet de la Vienne');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_207);
  });
});
