import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-20, lot 62-66) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-62`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau (racine → carte de l'année, motif ancré en fin de
 * chaîne pour écarter la variante "speciaux" rencontrée sur 2023) ; liste
 * plate finale sans pagination (`div[class='']:has(a.fr-link--download)`,
 * même famille que 37/41/45/49/52/55/59). Un bulletin sur deux est
 * pertinent (237), l'autre non (236) — le titre de publication seul ne
 * reflète jamais le contenu réel (bulletin RAA compilé), la pertinence
 * n'est donc révélée qu'à la lecture du texte du PDF joint.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-62');

const URL_RACINE = 'https://www.pas-de-calais.gouv.fr/Publications/Recueil-des-actes-administratifs';
const URL_ANNEE = 'https://www.pas-de-calais.gouv.fr/Publications/Recueil-des-actes-administratifs/2026-Recueils-des-actes-administratifs';
const URL_PDF_236 =
  'https://www.pas-de-calais.gouv.fr/contenu/telechargement/87036/545011/file/Recueil%20des%20actes%20administratifs%20n%C2%B0236%20en%20date%20du%2007%20aout%202026.pdf';
const URL_PDF_237 =
  'https://www.pas-de-calais.gouv.fr/contenu/telechargement/87040/545015/file/Recueil%20des%20actes%20administratifs%20n%C2%B0237%20en%20date%20du%2014%20aout%202026.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let pdf236: Buffer;
let pdf237: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 20, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, '2026-Recueils-des-actes-administratifs.html'), 'utf-8');
  pdf236 = await readFile(path.join(FIXTURES_DIR, 'raa-62-236.pdf'));
  pdf237 = await readFile(path.join(FIXTURES_DIR, 'raa-62-237.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_PDF_236) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf236.buffer.slice(pdf236.byteOffset, pdf236.byteOffset + pdf236.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_237) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf237.buffer.slice(pdf237.byteOffset, pdf237.byteOffset + pdf237.byteLength),
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

describe('connecteur réel prefecture-62 (récupération + traitement)', () => {
  it("résout la navigation à un niveau (racine → carte de l'année, motif ancré)", async () => {
    const connecteur = await obtenirConnecteur('prefecture-62');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (237, pertinent), ignore le 236 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-62');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('62');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('62-2026-08-14-002');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 21)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 24)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le préfet du Pas-de-Calais');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_237);
  });
});
