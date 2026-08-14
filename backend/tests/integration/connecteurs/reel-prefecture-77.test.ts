import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { obtenirConnecteur } from '../../../src/connecteurs/registry.js';

/**
 * V004/V001c (Phase 5bis, 2026-08-13) — "récupération + traitement" du
 * connecteur RÉEL `prefecture-77`, contre une reconstruction fidèle de la
 * structure du site (backend/tests/fixtures/connecteurs/reel/prefecture-77/,
 * cf. SOURCE.md), `fetch` entièrement mocké — aucun appel réseau réel dans
 * cette suite.
 *
 * Charge la config via `registry.obtenirConnecteur('prefecture-77')`, donc
 * le VRAI `configs/prefecture-77.yaml` déployé — y compris sa `navigation`
 * (racine → année courante) ET son `page_detail` (chaque `<option>` du
 * `<select>` pointe vers une page de détail via son attribut `value`, pas
 * directement vers un PDF). Horloge figée au 13/08/2026 pour que la
 * résolution de `navigation` (placeholder `{annee}`) reste vraie après
 * cette date.
 *
 * Couvre les deux sens du filtrage sur contenu PDF (comme prefecture-13/33) :
 * un jour dont le PDF contient un arrêté rave/teknival est retenu, un jour
 * dont le PDF n'en contient pas est ignoré — alors que le libellé de
 * l'`<option>` (une date/référence de bulletin) ne mentionne jamais le
 * contenu dans les deux cas.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../../fixtures/connecteurs/reel/prefecture-77');

const URL_RACINE = 'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA';
const URL_ANNEE = 'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-2026';
const URL_DETAIL_13 =
  'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-2026/RAA-n-D77-13-08-2026';
const URL_DETAIL_12_NOMINATIFS =
  'https://www.seine-et-marne.gouv.fr/Publications/Recueils-des-actes-administratifs-RAA/RAA-2026/RAA-n-D77-12-08-2026-nominatifs';
const URL_PDF_13 =
  'https://www.seine-et-marne.gouv.fr/contenu/telechargement/73282/594847/file/RAA%20n%C2%B0%20D77-13-08-2026.pdf';
const URL_PDF_12_NOMINATIFS =
  'https://www.seine-et-marne.gouv.fr/contenu/telechargement/73270/594769/file/RAA%20n%C2%B0D77-12-08-2026-nominatifs.pdf';

let htmlRacine: string;
let htmlAnnee: string;
let htmlDetail13: string;
let htmlDetail12Nominatifs: string;
let pdf13: Buffer;
let pdf12Nominatifs: Buffer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(Date.UTC(2026, 7, 13, 10, 0, 0)));

  htmlRacine = await readFile(path.join(FIXTURES_DIR, 'racine.html'), 'utf-8');
  htmlAnnee = await readFile(path.join(FIXTURES_DIR, 'annee-2026.html'), 'utf-8');
  htmlDetail13 = await readFile(path.join(FIXTURES_DIR, 'detail-13-08-2026.html'), 'utf-8');
  htmlDetail12Nominatifs = await readFile(path.join(FIXTURES_DIR, 'detail-12-08-2026-nominatifs.html'), 'utf-8');
  pdf13 = await readFile(path.join(FIXTURES_DIR, 'RAA-n-D77-13-08-2026.pdf'));
  pdf12Nominatifs = await readFile(path.join(FIXTURES_DIR, 'RAA-n-D77-12-08-2026-nominatifs.pdf'));

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_RACINE) return { ok: true, status: 200, text: async () => htmlRacine } as unknown as Response;
      if (url === URL_ANNEE) return { ok: true, status: 200, text: async () => htmlAnnee } as unknown as Response;
      if (url === URL_DETAIL_13) return { ok: true, status: 200, text: async () => htmlDetail13 } as unknown as Response;
      if (url === URL_DETAIL_12_NOMINATIFS) {
        return { ok: true, status: 200, text: async () => htmlDetail12Nominatifs } as unknown as Response;
      }
      if (url === URL_PDF_13) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => pdf13.buffer.slice(pdf13.byteOffset, pdf13.byteOffset + pdf13.byteLength),
        } as unknown as Response;
      }
      if (url === URL_PDF_12_NOMINATIFS) {
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () =>
            pdf12Nominatifs.buffer.slice(pdf12Nominatifs.byteOffset, pdf12Nominatifs.byteOffset + pdf12Nominatifs.byteLength),
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

describe('Phase 5bis — connecteur réel prefecture-77 (V004/V001c, récupération + traitement)', () => {
  it("résout la navigation (racine → année) et la page de détail par option (value) pour ignorer le jour sans arrêté rave/teknival", async () => {
    const connecteur = await obtenirConnecteur('prefecture-77');
    expect(connecteur).not.toBeNull();

    const resultat = await connecteur!.collecter();

    expect(resultat.echec_global).toBeUndefined();
    // Un seul candidat retenu sur les 2 options réelles du <select> (+ le
    // placeholder value="" ignoré sans même tenter de requête) : le PDF du
    // 12/08-nominatifs ne contient aucun mot-clé.
    expect(resultat.candidats).toHaveLength(1);
  });

  it('extrait correctement le candidat depuis le texte du PDF atteint via la page de détail (libellé de l\'option jamais suffisant)', async () => {
    const connecteur = await obtenirConnecteur('prefecture-77');
    const resultat = await connecteur!.collecter();
    const candidat = resultat.candidats[0];

    expect(candidat.departement_code).toBe('77');
    expect(candidat.type_evenement).toBe('interdiction');
    expect(candidat.reference_arrete).toBe('2026-77-0530');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 13)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 16)).toISOString());
    expect(candidat.autorite_signataire).toBe('Le Préfet de Seine-et-Marne');
    // Source = le PDF réellement lu, atteint via la page de détail — pas la
    // page liste ni la page de détail elle-même (contrat SC-002).
    expect(candidat.source.type).toBe('pdf');
    expect(candidat.source.url).toBe(URL_PDF_13);
  });
});
