import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdf-parse', () => ({
  default: vi.fn(),
}));

import pdfParse from 'pdf-parse';
import { creerConnecteur, resoudreUrlPdf } from '../../../src/connecteurs/moteurs/pdf/moteur.js';
import type { Connecteur as ConnecteurEntree } from '../../../src/models/index.js';

const pdfParseMock = vi.mocked(pdfParse);

const ENTREE: ConnecteurEntree = {
  id: 'test-pdf',
  nom: 'Connecteur de test pdf',
  departements_couverts: ['33'],
  actif: true,
  derniere_collecte: null,
  type_connecteur: 'pdf',
};

const CONFIG_BASE = {
  url_pdf: 'https://exemple.gouv.fr/raa/dernier.pdf',
  autorite_signataire: 'Le Préfet de la Gironde',
  type_evenement_par_defaut: 'interdiction' as const,
  patterns_dates: {
    debut: "à compter du (?<date>\\d{2}/\\d{2}/\\d{4})",
    fin: "jusqu'au (?<date>\\d{2}/\\d{2}/\\d{4})",
  },
  pattern_reference: 'Arrêté n°\\s*(?<reference>[0-9-]+)',
};

describe('resoudreUrlPdf', () => {
  it('retourne une URL fixe telle quelle', () => {
    expect(resoudreUrlPdf('https://exemple.gouv.fr/fixe.pdf')).toBe('https://exemple.gouv.fr/fixe.pdf');
  });

  it("substitue les placeholders {annee}/{mois}/{jour} d'un motif avec la date fournie", () => {
    const maintenant = new Date(Date.UTC(2026, 7, 5)); // 5 août 2026
    const url = resoudreUrlPdf({ motif: 'https://exemple.gouv.fr/{annee}/{mois}/{jour}/raa.pdf' }, maintenant);
    expect(url).toBe('https://exemple.gouv.fr/2026/08/05/raa.pdf');
  });
});

describe('moteur pdf — collecter()', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    pdfParseMock.mockReset();
  });

  it('extrait un candidat complet depuis un PDF lisible', async () => {
    pdfParseMock.mockResolvedValueOnce({
      text: "Arrêté n° 2026-33-0042 à compter du 10/08/2026 jusqu'au 12/08/2026",
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: 'default',
    });

    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    const [candidat] = resultat.candidats;
    expect(candidat.reference_arrete).toBe('2026-33-0042');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 10)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 12)).toISOString());
    expect(candidat.departement_code).toBe('33');
    expect(candidat.autorite_signataire).toBe('Le Préfet de la Gironde');
    expect(candidat.source.type).toBe('pdf');
  });

  it("signale un échec_global (sans OCR) si le PDF n'a pas de texte extractible", async () => {
    pdfParseMock.mockResolvedValueOnce({
      text: '',
      numpages: 1,
      numrender: 1,
      info: {},
      metadata: {},
      version: 'default',
    });

    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
    expect(resultat.echec_global?.message).toMatch(/OCR/);
  });

  it('signale un échec_global si le téléchargement du PDF échoue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response));

    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();

    expect(resultat.candidats).toEqual([]);
    expect(resultat.echec_global).toBeDefined();
  });
});
