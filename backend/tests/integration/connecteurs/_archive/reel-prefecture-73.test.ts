import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * (2026-08-21, lot 72-76) — "récupération + traitement" du connecteur RÉEL
 * `prefecture-73`, contre une reconstruction fidèle de la structure du site
 * VALIDÉE PAR CAPTURE LIVE (navigateur Chrome réel, dès la construction
 * initiale de la config — cf. claude/etat-connecteurs.md), `fetch`
 * entièrement mocké.
 *
 * Navigation à UN niveau, motif "{annee}-\d+$" : les cartes ne sont PAS un
 * découpage par mois/semestre fixe mais par seuil de volume ("2026-2"
 * contenait au 2026-08-21 les publications du 02/08 au 20/08/2026
 * uniquement) — le motif matche toute tranche de l'année courante, et le
 * moteur retient la PREMIÈRE (la plus récente, cf. commentaire de la
 * config). Liste finale : PAS de pagination, liste plate — même famille
 * que 37/41/45/49/52/55/59/62/65/66/69/72.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-73');

const URL_RACINE =
  'https://www.savoie.gouv.fr/Publications/Recueils-hebdomadaires-et-speciaux-des-actes-administratifs';
const URL_TRANCHE_2026_2 =
  'https://www.savoie.gouv.fr/Publications/Recueils-hebdomadaires-et-speciaux-des-actes-administratifs/2026-2';
const URL_PDF_216 =
  'https://www.savoie.gouv.fr/contenu/telechargement/55519/439248/file/2026-08-20-RAA_N%C2%B073-2026-216-special.pdf';
const URL_PDF_215 =
  'https://www.savoie.gouv.fr/contenu/telechargement/55468/438934/file/2026-08-18_RAA_N%C2%B073-2026-215.pdf';

let htmlRacine: string;
let htmlTranche: string;
let pdf216: Buffer;
let pdf215: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 21, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlTranche = await readFile(path.join(FIXTURES_DIR, 'tranche-2026-2.html'), 'utf-8');
  pdf216 = await readFile(path.join(FIXTURES_DIR, 'raa-73-216.pdf'));
  pdf215 = await readFile(path.join(FIXTURES_DIR, 'raa-73-215.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_TRANCHE_2026_2)
        return { ok: true, status: 200, text: async () => htmlTranche } as unknown as Response;
      if (url === URL_PDF_216) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf216.buffer.slice(pdf216.byteOffset, pdf216.byteOffset + pdf216.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_215) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf215.buffer.slice(pdf215.byteOffset, pdf215.byteOffset + pdf215.byteLength),
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

describe('connecteur réel prefecture-73 (récupération + traitement)', () => {
  it('résout les 2 publications de la tranche courante (motif non ancré sur un numéro précis)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-73');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF (216, pertinent), ignore le 215 (non pertinent)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-73');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('73');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('73-2026-08-20-216');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 25)).toISOString());
    expect(candidat.autorite_signataire).toBe('La préfète de la Savoie');
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_216);
  });
});
