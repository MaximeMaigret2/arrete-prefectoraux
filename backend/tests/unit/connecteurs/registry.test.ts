import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDataStoreCache } from '../../../src/data/loader.js';
import {
  chargerConnecteursActifs,
  creerConnecteur,
  obtenirConnecteur,
  trouverConnecteurEntree,
} from '../../../src/connecteurs/registry.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/data');
const CONFIGS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/connecteurs/configs');
const CONNECTEURS_PATH = path.join(DATA_DIR, 'connecteurs.json');

const FAKE_ACTIF_ID = 'test-fake-registry-actif';
const FAKE_INACTIF_ID = 'test-fake-registry-inactif';
const FAKE_INVALIDE_ID = 'test-fake-registry-invalide';
const FAKE_ACTIF_CONFIG_PATH = path.join(CONFIGS_DIR, `${FAKE_ACTIF_ID}.yaml`);
const FAKE_INVALIDE_CONFIG_PATH = path.join(CONFIGS_DIR, `${FAKE_INVALIDE_ID}.yaml`);

// Configuration `page_web` complète et valide (contracts/connecteur-interface.md
// §2) — sert à vérifier le câblage réel du moteur (T031), pas seulement la
// validation de schéma (déjà couverte par configsSchema.test.ts, T047).
const CONFIG_ACTIF_VALIDE = `
url_liste: "https://example.org/raa"
selecteur_publications: ".raa-item"
selecteur_titre: ".raa-item__titre"
selecteur_lien_pdf: null
autorite_signataire: "Le Préfet de test"
type_evenement_par_defaut: interdiction
mots_cles_filtrage:
  - rave
  - teknival
patterns_dates:
  debut: "à compter du (?<date>\\\\d{2}/\\\\d{2}/\\\\d{4})"
  fin: null
pattern_reference: "Arrêté n°\\\\s*(?<reference>[0-9-]+)"
`;

async function lireOuAbsent(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

let snapshotConnecteurs: string | null;
let snapshotConfigActif: string | null;
let snapshotConfigInvalide: string | null;

beforeEach(async () => {
  snapshotConnecteurs = await lireOuAbsent(CONNECTEURS_PATH);
  snapshotConfigActif = await lireOuAbsent(FAKE_ACTIF_CONFIG_PATH);
  snapshotConfigInvalide = await lireOuAbsent(FAKE_INVALIDE_CONFIG_PATH);

  // connecteurs.json réel n'a pas encore `type_connecteur` (bug préexistant,
  // T005A/T032-034, hors périmètre ici) : patché temporairement, avec trois
  // connecteurs factices (actif valide / actif à config invalide / inactif)
  // pour tester le filtrage et l'isolation des échecs.
  const reels = JSON.parse(snapshotConnecteurs ?? '[]') as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = reels.map((c) => ({
    ...c,
    type_connecteur: c.type_connecteur ?? 'page_web',
  }));
  patches.push(
    {
      id: FAKE_ACTIF_ID,
      nom: 'Connecteur factice actif (test registry)',
      departements_couverts: ['2A'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
    {
      id: FAKE_INVALIDE_ID,
      nom: 'Connecteur factice actif à configuration invalide (test registry)',
      departements_couverts: ['2B'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
    {
      id: FAKE_INACTIF_ID,
      nom: 'Connecteur factice inactif (test registry)',
      departements_couverts: ['2B'],
      actif: false,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
  );
  await writeFile(CONNECTEURS_PATH, JSON.stringify(patches, null, 2) + '\n', 'utf-8');
  await writeFile(FAKE_ACTIF_CONFIG_PATH, CONFIG_ACTIF_VALIDE, 'utf-8');
  // Configuration délibérément invalide (aucun champ requis) : vérifie que
  // le moteur rejette via son schéma zod plutôt que de construire un
  // connecteur silencieusement cassé (contrat §5, règle 2).
  await writeFile(FAKE_INVALIDE_CONFIG_PATH, 'url_liste: "https://example.org/raa"\n', 'utf-8');
  resetDataStoreCache();
});

afterEach(async () => {
  await writeFile(CONNECTEURS_PATH, snapshotConnecteurs ?? '[]\n', 'utf-8');
  await writeFile(FAKE_ACTIF_CONFIG_PATH, snapshotConfigActif ?? '# fixture de test (registry.test.ts), inutilisée\n', 'utf-8');
  await writeFile(
    FAKE_INVALIDE_CONFIG_PATH,
    snapshotConfigInvalide ?? '# fixture de test (registry.test.ts), inutilisée\n',
    'utf-8',
  );
  resetDataStoreCache();
});

describe('creerConnecteur — dispatch (moteurs câblés, T031)', () => {
  it('construit un Connecteur "page_web" pour une configuration valide', () => {
    const connecteur = creerConnecteur(
      { id: 'x', nom: 'X', departements_couverts: ['77'], actif: true, derniere_collecte: null, type_connecteur: 'page_web' },
      {
        url_liste: 'https://example.org/raa',
        selecteur_publications: '.item',
        selecteur_titre: '.titre',
        selecteur_lien_pdf: null,
        autorite_signataire: 'Le Préfet de test',
        type_evenement_par_defaut: 'interdiction',
        mots_cles_filtrage: ['rave'],
        patterns_dates: { debut: '(?<date>.+)', fin: null },
        pattern_reference: '(?<reference>.+)',
      },
    );
    expect(connecteur.id).toBe('x');
    expect(connecteur.departements).toEqual(['77']);
  });

  it('rejette une configuration "page_web" invalide (schéma zod)', () => {
    expect(() =>
      creerConnecteur(
        { id: 'x', nom: 'X', departements_couverts: ['77'], actif: true, derniere_collecte: null, type_connecteur: 'page_web' },
        {},
      ),
    ).toThrow();
  });

  it('rejette une configuration "pdf" invalide (schéma zod)', () => {
    expect(() =>
      creerConnecteur(
        { id: 'x', nom: 'X', departements_couverts: ['77'], actif: true, derniere_collecte: null, type_connecteur: 'pdf' },
        {},
      ),
    ).toThrow();
  });
});

describe('trouverConnecteurEntree', () => {
  it("retourne l'entrée pour un id connu", async () => {
    const entree = await trouverConnecteurEntree(FAKE_ACTIF_ID);
    expect(entree?.id).toBe(FAKE_ACTIF_ID);
    expect(entree?.actif).toBe(true);
  });

  it('retourne null pour un id inconnu', async () => {
    const entree = await trouverConnecteurEntree('id-totalement-inexistant');
    expect(entree).toBeNull();
  });
});

describe('obtenirConnecteur', () => {
  it('retourne null pour un id inconnu (sans tenter de charger de configuration)', async () => {
    const connecteur = await obtenirConnecteur('id-totalement-inexistant');
    expect(connecteur).toBeNull();
  });

  it('charge la configuration YAML puis dispatche vers creerConnecteur pour un id connu', async () => {
    const connecteur = await obtenirConnecteur(FAKE_ACTIF_ID);
    expect(connecteur?.id).toBe(FAKE_ACTIF_ID);
    expect(connecteur?.departements).toEqual(['2A']);
  });

  it('rejette pour un id connu dont la configuration ne respecte pas le schéma de son type', async () => {
    await expect(obtenirConnecteur(FAKE_INVALIDE_ID)).rejects.toThrow();
  });
});

describe('chargerConnecteursActifs', () => {
  it("charge les connecteurs actifs valides, isole ceux dont la configuration échoue, et écarte les inactifs", async () => {
    const erreurSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const resultats = await chargerConnecteursActifs();

    expect(resultats.map((c) => c.id)).toEqual([FAKE_ACTIF_ID]);

    const messages = erreurSpy.mock.calls.map((call) => String(call[0]));
    // Configuration invalide (FAKE_INVALIDE_ID) : écarté avec un message
    // explicite, sans faire échouer le chargement des autres (contrat §5,
    // règle 6 ; même principe d'isolation que le runner à l'exécution).
    expect(messages.some((m) => m.includes(FAKE_INVALIDE_ID))).toBe(true);
    // Le connecteur inactif n'est même pas tenté (pas de config chargée pour lui).
    expect(messages.some((m) => m.includes(FAKE_INACTIF_ID))).toBe(false);

    erreurSpy.mockRestore();
  });
});
