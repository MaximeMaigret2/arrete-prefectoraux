import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

import pdfParse from 'pdf-parse';
import { creerConnecteur } from '../../../src/connecteurs/moteurs/rss/moteur.js';
import type { Connecteur as ConnecteurEntree } from '../../../src/models/index.js';

const pdfParseMock = vi.mocked(pdfParse);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../../fixtures/connecteurs/rss/publication-propre.xml');
const URL_FLUX = 'https://exemple.gouv.fr/Publications/RAA/rss.xml';
const URL_PDF_LIE = 'https://exemple.gouv.fr/pieces-jointes/arrete-0520.pdf';

const ENTREE: ConnecteurEntree = {
  id: 'test-rss',
  nom: 'Connecteur de test rss',
  departements_couverts: ['33'],
  actif: true,
  derniere_collecte: null,
  type_connecteur: 'rss',
};

const CONFIG_BASE = {
  url_flux: URL_FLUX,
  autorite_signataire: 'Le Préfet de la Gironde',
  type_evenement_par_defaut: 'interdiction' as const,
  mots_cles_filtrage: ['rave', 'teknival'],
  suivre_lien_pdf: false,
  patterns_dates: {
    debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})",
    fin: "jusqu'au (?<date>\\d{2}/\\d{2}/\\d{4})",
  },
  pattern_reference: 'Arrêté n°\\s*(?<reference>[0-9-]+)',
};

let xml: string;

beforeEach(async () => {
  xml = await readFile(FIXTURE_PATH, 'utf-8');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_FLUX) {
        return { ok: true, status: 200, text: async () => xml } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  pdfParseMock.mockReset();
});

describe('moteur rss — collecter()', () => {
  it('filtre les items non pertinents (aucun mot-clé)', async () => {
    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();
    const references = resultat.candidats.map((c) => c.reference_arrete);
    expect(references).not.toContain('2026-33-0498');
  });

  it('extrait un candidat complet depuis titre + description (sans suivre le lien)', async () => {
    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();
    const candidat = resultat.candidats.find((c) => c.reference_arrete === '2026-33-0512');

    expect(candidat).toBeDefined();
    expect(candidat?.date_debut).toBe(new Date(Date.UTC(2026, 7, 12)).toISOString());
    expect(candidat?.date_fin).toBe(new Date(Date.UTC(2026, 7, 15)).toISOString());
    expect(candidat?.autorite_signataire).toBe('Le Préfet de la Gironde');
    expect(candidat?.departement_code).toBe('33');
    expect(candidat?.type_evenement).toBe('interdiction');
    expect(candidat?.source.type).toBe('rss');
    expect(candidat?.source.url).toBe(URL_FLUX);
  });

  it("suit le lien PDF et utilise son texte pour l'extraction quand suivre_lien_pdf est activé", async () => {
    pdfParseMock.mockResolvedValueOnce({
      text: "Arrêté n° 2026-33-0520 à compter du 20/08/2026 jusqu'au 22/08/2026",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: 'default',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_FLUX) return { ok: true, status: 200, text: async () => xml } as unknown as Response;
        if (url === URL_PDF_LIE) {
          return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, suivre_lien_pdf: true });
    const resultat = await connecteur.collecter();
    const candidat = resultat.candidats.find((c) => c.reference_arrete === '2026-33-0520');

    expect(candidat).toBeDefined();
    expect(candidat?.date_debut).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat?.date_fin).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat?.source.type).toBe('pdf');
    expect(candidat?.source.url).toBe(URL_PDF_LIE);
  });

  it('ne suit pas le lien PDF quand suivre_lien_pdf est désactivé (texte du flux utilisé tel quel)', async () => {
    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();
    const candidat = resultat.candidats.find((c) => c.reference_arrete === '2026-33-0520');

    expect(candidat).toBeDefined();
    expect(candidat?.source.type).toBe('rss');
    expect(pdfParseMock).not.toHaveBeenCalled();
  });

  it('signale un échec_global si le flux est inaccessible', async () => {
    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, url_flux: 'https://exemple.gouv.fr/introuvable.xml' });
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
  });
});
