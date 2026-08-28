import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirRepertoireDonnees, resetDataStoreCache } from '../../../src/data/loader.js';
import {
  chargerConnecteursActifs,
  creerConnecteur,
  definirRepertoireConfigs,
  obtenirConnecteur,
  trouverConnecteurEntree,
} from '../../../src/connecteurs/registry.js';

/**
 * Migré le 2026-08-27 (petit lot de durcissement, housekeeping post-chantier
 * 57) vers le même mécanisme que `ajoutConnecteur.test.ts`/`idempotence.test.ts`
 * (Q-006, lot Qualité — Durcissement, 2026-08-22) : ce test écrivait
 * auparavant directement dans les vrais fichiers de production
 * (`src/data/connecteurs.json` + `src/connecteurs/configs/*.yaml`), avec un
 * snapshot en `beforeEach` et une restauration en `afterEach` — c'était le
 * DERNIER test du dépôt à suivre encore ce patron. Un run de la suite
 * complète tué en cours d'exécution (plafond `device_bash`, `afterEach`
 * jamais atteint) a laissé les fichiers réels pollués par des entrées
 * fantômes (`test-fake-registry-*`) pendant le chantier 57 (2026-08-27,
 * cf. `claude/etat-connecteurs.md`), reproduisant exactement l'incident déjà
 * corrigé pour les deux autres tests par Q-006. Migré ici de la même façon :
 * `definirRepertoireDonnees()`/`definirRepertoireConfigs()` redirigent
 * `loader.ts`/`registry.ts` vers deux répertoires temporaires jetables
 * (`os.tmpdir()`, hors du point de montage partagé avec l'utilisateur — la
 * suppression y fonctionne normalement, contrairement au dépôt), reconstruits
 * à partir d'une copie fidèle du vrai `connecteurs.json` à chaque test. Un
 * kill mi-test ne peut plus laisser de trace dans les fichiers réels.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_DATA_DIR = path.join(__dirname, '../../../src/data');

const FAKE_ACTIF_ID = 'test-fake-registry-actif';
const FAKE_INACTIF_ID = 'test-fake-registry-inactif';
const FAKE_INVALIDE_ID = 'test-fake-registry-invalide';

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

let tempDataDir: string;
let tempConfigsDir: string;

beforeEach(async () => {
  tempDataDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-registry-data-'));
  tempConfigsDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-registry-configs-'));

  // connecteurs.json réel a désormais `type_connecteur` pour tous ses
  // connecteurs (T032-T034) : les entrées réelles sont reprises telles
  // quelles (copie fidèle, jamais modifiée sur disque réel), avec trois
  // connecteurs factices ajoutés (actif valide / actif à config invalide /
  // inactif) pour tester le filtrage et l'isolation des échecs sans
  // dépendre des connecteurs réels.
  const connecteursReels = (await lireOuAbsent(path.join(REAL_DATA_DIR, 'connecteurs.json'))) ?? '[]\n';
  const reels = JSON.parse(connecteursReels) as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = [...reels];
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
  await writeFile(path.join(tempDataDir, 'connecteurs.json'), JSON.stringify(patches, null, 2) + '\n', 'utf-8');
  await writeFile(path.join(tempConfigsDir, `${FAKE_ACTIF_ID}.yaml`), CONFIG_ACTIF_VALIDE, 'utf-8');
  // Configuration délibérément invalide (aucun champ requis) : vérifie que
  // le moteur rejette via son schéma zod plutôt que de construire un
  // connecteur silencieusement cassé (contrat §5, règle 2).
  await writeFile(
    path.join(tempConfigsDir, `${FAKE_INVALIDE_ID}.yaml`),
    'url_liste: "https://example.org/raa"\n',
    'utf-8',
  );

  definirRepertoireDonnees(tempDataDir);
  definirRepertoireConfigs(tempConfigsDir);
  resetDataStoreCache();
});

afterEach(async () => {
  definirRepertoireDonnees(null);
  definirRepertoireConfigs(null);
  resetDataStoreCache();

  // Best-effort : ces répertoires vivent hors du point de montage partagé
  // avec l'utilisateur (contrairement au dépôt), la suppression y fonctionne
  // normalement — mais un échec ici ne doit jamais faire échouer le test lui-même.
  await rm(tempDataDir, { recursive: true, force: true }).catch(() => {});
  await rm(tempConfigsDir, { recursive: true, force: true }).catch(() => {});
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

    // Depuis T032-T034, les connecteurs réels ont une configuration
    // déclarative réelle (configs/prefecture-*.yaml) et se chargent donc
    // aussi avec succès — seul FAKE_INVALIDE_ID (configuration invalide) et
    // FAKE_INACTIF_ID (actif: false) doivent être absents du résultat.
    const ids = resultats.map((c) => c.id);
    expect(ids).toContain(FAKE_ACTIF_ID);
    expect(ids).not.toContain(FAKE_INVALIDE_ID);
    expect(ids).not.toContain(FAKE_INACTIF_ID);

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
