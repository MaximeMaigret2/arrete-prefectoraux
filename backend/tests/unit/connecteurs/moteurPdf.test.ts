import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { creerConnecteur, resoudreUrlPdf } from '../../../src/connecteurs/moteurs/pdf/moteur.js';
import type { Connecteur as ConnecteurEntree } from '../../../src/models/index.js';

/**
 * T044 (US3) — tests du moteur `pdf` contre les fixtures réelles sur disque,
 * `pdf-parse` NON mocké (même constat/correctif qu'en T043 : voir sa note
 * d'en-tête — `telechargerEtExtraireTextePdf` passait un `Buffer` Node à
 * `pdf-parse`, ce qui levait `bad XRef entry` sur tout PDF sans rapport avec
 * son contenu ; corrigé en `new Uint8Array(buffer)`).
 *
 * `piece-jointe.pdf` (T042) est réutilisé tel quel pour le cas "texte
 * extractible" plutôt que de dupliquer une fixture équivalente — son
 * contenu textuel (référence "2026-77-0520") est indépendant du département
 * de configuration du connecteur de test ci-dessous ('33'/Gironde,
 * inchangé par rapport à l'ancienne version mockée de ce fichier) : seule
 * `autorite_signataire`/`departement_code` proviennent de la config, jamais
 * du texte du PDF (cf. `construireCandidat`).
 * `page-sans-texte.pdf` (créée pour T044, page blanche valide — FR-005,
 * aucun OCR) couvre le cas "texte insuffisant".
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PDF_LISIBLE_PATH = path.join(__dirname, '../../fixtures/connecteurs/pdf/piece-jointe.pdf');
const FIXTURE_PDF_SANS_TEXTE_PATH = path.join(__dirname, '../../fixtures/connecteurs/pdf/page-sans-texte.pdf');

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

function arrayBufferDe(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extrait un candidat complet depuis un PDF lisible (T042, pdf-parse non mocké)', async () => {
    const pdfBuffer = await readFile(FIXTURE_PDF_LISIBLE_PATH);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => arrayBufferDe(pdfBuffer) }) as unknown as Response),
    );

    const connecteur = creerConnecteur(ENTREE, CONFIG_BASE);
    const resultat = await connecteur.collecter();

    expect(resultat.echec_global).toBeUndefined();
    expect(resultat.candidats).toHaveLength(1);
    const [candidat] = resultat.candidats;
    expect(candidat.reference_arrete).toBe('2026-77-0520');
    expect(candidat.date_debut).toBe(new Date(Date.UTC(2026, 7, 20)).toISOString());
    expect(candidat.date_fin).toBe(new Date(Date.UTC(2026, 7, 22)).toISOString());
    expect(candidat.departement_code).toBe('33');
    expect(candidat.autorite_signataire).toBe('Le Préfet de la Gironde');
    expect(candidat.source.type).toBe('pdf');
  });

  it("signale un échec_global (sans OCR) si le PDF n'a pas de texte extractible (page blanche)", async () => {
    const pdfBuffer = await readFile(FIXTURE_PDF_SANS_TEXTE_PATH);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => arrayBufferDe(pdfBuffer) }) as unknown as Response),
    );

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
