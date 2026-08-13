import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

import pdfParse from 'pdf-parse';
import { creerConnecteur } from '../../../src/connecteurs/moteurs/pageWeb/moteur.js';
import type { Connecteur as ConnecteurEntree } from '../../../src/models/index.js';

const pdfParseMock = vi.mocked(pdfParse);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-propre.html');
const URL_LISTE = 'https://exemple.gouv.fr/Publications/RAA';
const URL_PDF_JOINT = 'https://exemple.gouv.fr/pieces-jointes/arrete-0520.pdf';

const ENTREE: ConnecteurEntree = {
  id: 'test-page-web',
  nom: 'Connecteur de test page_web',
  departements_couverts: ['77'],
  actif: true,
  derniere_collecte: null,
  type_connecteur: 'page_web',
};

const CONFIG_BASE = {
  url_liste: URL_LISTE,
  selecteur_publications: '.raa-item',
  selecteur_titre: '.raa-item__titre',
  selecteur_lien_pdf: '.raa-item__piece-jointe' as string | null,
  autorite_signataire: 'Le Préfet de Seine-et-Marne',
  type_evenement_par_defaut: 'interdiction' as const,
  mots_cles_filtrage: ['rave', 'teknival'],
  patterns_dates: {
    debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})",
    fin: "jusqu'au (?<date>\\d{2}/\\d{2}/\\d{4})",
  },
  pattern_reference: 'Arrêté n°\\s*(?<reference>[0-9-]+)',
};

let html: string;

beforeEach(async () => {
  html = await readFile(FIXTURE_PATH, 'utf-8');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === URL_LISTE) {
        return { ok: true, status: 200, text: async () => html } as unknown as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  pdfParseMock.mockReset();
});

describe('moteur page_web — collecter()', () => {
  it('filtre les publications non pertinentes (aucun mot-clé)', async () => {
    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null });
    const resultat = await connecteur.collecter();
    const references = resultat.candidats.map((c) => c.reference_arrete);
    expect(references).not.toContain('2026-77-0498');
  });

  it('extrait un candidat complet depuis le titre seul (sans pièce jointe)', async () => {
    const connecteur = creerConnecteur(ENTREE, { ...CONFIG_BASE, selecteur_lien_pdf: null });
    const resultat = await connecteur.collecter();
    const candidat = resultat.candidats.find((c) => c.reference_arrete === '2026-77-0512');

    expect(candidat).toBeDefined();
    expect(candidat?.date_debut).toBe(new Date(Date.UTC(2026, 7, 12)).toISOString());
    expect(candidat?.date_fin).toBe(new Date(Date.UTC(2026, 7, 15)).toISOString());
    expect(candidat?.autorite_signataire).toBe('Le Préfet de Seine-et-Marne');
    expect(candidat?.departement_code).toBe('77');
    expect(candidat?.type_evenement).toBe('interdiction');
    expect(candidat?.source.type).toBe('page_web');
    expect(candidat?.source.url).toBe(URL_LISTE);
  });

  it("suit le lien PDF joint et utilise son texte pour l'extraction quand le titre seul ne suffit pas", async () => {
    pdfParseMock.mockResolvedValueOnce({
      text: "Arrêté n° 2026-77-0520 à compter du 20/08/2026 jusqu'au 22/08/2026",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: 'default',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === URL_LISTE) return { ok: true, status: 200, text: async () => html } as unknown as Response;
        if (url === URL_PDF_JOINT) {
          return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
        }
        return { ok: false, status: 404, text: async () => '' } as unknown as Response;
      }),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();
    const candidat = resultat.candidats.find((c) => c.reference_arrete === '2026-77-0520');

    expect(candidat).toBeDefined();
    expect(candidat?.date_debut).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat?.date_fin).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat?.source.type).toBe('pdf');
    expect(candidat?.source.url).toBe(URL_PDF_JOINT);
  });

  it('signale un échec_global si la page liste est inaccessible', async () => {
    const connecteur = creerConnecteur(ENTREE, {
      ...CONFIG_BASE,
      url_liste: 'https://exemple.gouv.fr/introuvable',
      selecteur_lien_pdf: null,
    });
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
  });
});
