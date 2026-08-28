import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { definirRepertoireDonnees, loadDataStore, resetDataStoreCache } from '../../../src/data/loader.js';
import { definirRepertoireConfigs, obtenirConnecteur } from '../../../src/connecteurs/registry.js';
import { executerConnecteur } from '../../../src/connecteurs/runner.js';
import { computeDepartementState } from '../../../src/services/computeDepartementState.js';

/**
 * T038 — Test d'intégration US2 (Acceptance Scenarios US2.1, US2.2) :
 * ajouter un connecteur pour un département actuellement gris (non
 * couvert), déclencher une collecte manuelle, et vérifier qu'un événement
 * publié directement (`methode_collecte: automatique`, aucune anomalie
 * intermédiaire) fait passer ce département hors du gris — sans toucher au
 * code cœur (API, calcul d'état, carte : ce test n'utilise que
 * `registry.ts`/`runner.ts`/`computeDepartementState.ts` tels quels).
 *
 * Département de test : '99' (code SYNTHÉTIQUE, ne correspond à aucun
 * département français réel — absent de `departements.json`). Jusqu'au
 * chantier 57 (2026-08-27), ce witness "gris" bumpait vers le prochain
 * département réel non couvert à chaque lot (2A→2B→21→26→31→37→42→47→52→57
 * au fil des sessions précédentes) ; '57' (Moselle) était le dernier des 96
 * départements du périmètre à recevoir son connecteur réel, il n'y a donc
 * plus de département réel "non couvert" vers lequel basculer. `'99'` n'a
 * pas besoin de ce mécanisme : n'existant dans aucun `connecteurs.json`
 * réel actuel NI futur, il reste un témoin "gris" garanti à demeure. Ce
 * test n'appelle jamais la couche API/`departements.json` (cf. commentaire
 * `beforeEach` ci-dessous : `computeDepartementState` ne consulte que
 * `connecteurs`/`evenements`), donc l'absence de '99' de la liste des
 * départements réels n'a aucune incidence ici — à ne pas confondre avec
 * `tests/contract/departement-history.test.ts`, où '99' sert par ailleurs
 * de code inconnu déclenchant un 404 (même propriété — "n'existe pas
 * réellement" —, deux mécaniques distinctes et sans collision, données
 * temporaires isolées ici contre données réelles là-bas).
 *
 * Q-006 (lot Qualité — Durcissement, 2026-08-22) : ce test écrivait
 * auparavant directement dans les vrais fichiers de production
 * (`connecteurs.json`/`events/57.json`/`configs/<id>.yaml`), snapshot/restore
 * en `afterEach` — mécanisme déjà auto-contaminé une fois (kill mi-test par
 * le plafond `device_bash`, `afterEach` jamais exécuté, pollution
 * auto-perpétuante détectée et corrigée manuellement le 2026-08-21/22, cf.
 * `claude/etat-connecteurs.md`, section "Lot Qualité"). Il pointe désormais
 * `data/loader.ts` et `registry.ts` (via `definirRepertoireDonnees()` /
 * `definirRepertoireConfigs()`, ajoutés pour ce lot) vers deux répertoires
 * temporaires (`os.tmpdir()`, hors du point de montage partagé avec
 * l'utilisateur — la suppression y fonctionne normalement, contrairement au
 * dossier du dépôt) — un instantané fidèle de `connecteurs.json` réel y est
 * copié au démarrage de chaque test, puis jeté avec le reste en `afterEach` :
 * un kill mi-test ne laisse plus aucune trace dans les fichiers réels.
 *
 * `beforeEach` ne fait que préparer cet environnement isolé (le département
 * '99' — synthétique, cf. ci-dessus — doit rester gris au moment où le
 * premier test le vérifie, à partir d'une copie fidèle du vrai
 * `connecteurs.json`, qui ne le référence par construction jamais) ;
 * l'ajout effectif du connecteur est déclenché explicitement par
 * `ajouterConnecteurDeTest()`, appelée à l'intérieur des tests qui en ont
 * besoin.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL_DATA_DIR = path.join(__dirname, '../../../src/data');
const FIXTURE_CONFIG_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/config-test.yaml');
const FIXTURE_HTML_PATH = path.join(__dirname, '../../fixtures/connecteurs/pageWeb/publication-propre.html');

const CONNECTEUR_ID = 'test-ajout-connecteur-56';
const URL_LISTE = 'https://exemple-test.gouv.fr/Publications/RAA';

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
let connecteursReels: string;
let html: string;

beforeEach(async () => {
  tempDataDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-data-'));
  tempConfigsDir = await mkdtemp(path.join(tmpdir(), 'arrete-test-configs-'));
  await mkdir(path.join(tempDataDir, 'events'), { recursive: true });

  // Copie fidèle du vrai `connecteurs.json` : le test 1 vérifie que '99'
  // n'est couvert par AUCUN connecteur réel, ce qui n'a de sens que contre
  // les vraies données (et reste garanti par construction : '99' est un
  // code synthétique, cf. commentaire d'en-tête). Les autres fichiers
  // globaux démarrent vides — comme le faisait déjà l'ancien mécanisme pour
  // '57'/'anomalies'/'executions' à chaque test (`departements.json` n'a
  // pas besoin d'être copié : `computeDepartementState` ne consulte pas la
  // liste des départements pour déterminer l'état d'un code donné, seuls
  // `connecteurs`/`evenements` comptent — cf.
  // `services/computeDepartementState.ts`).
  connecteursReels = (await lireOuAbsent(path.join(REAL_DATA_DIR, 'connecteurs.json'))) ?? '[]\n';
  await writeFile(path.join(tempDataDir, 'connecteurs.json'), connecteursReels, 'utf-8');
  await writeFile(path.join(tempDataDir, 'executions.json'), '[]\n', 'utf-8');
  await writeFile(path.join(tempDataDir, 'anomalies.json'), '[]\n', 'utf-8');
  await writeFile(path.join(tempDataDir, 'events', '99.json'), '[]\n', 'utf-8');

  html = await readFile(FIXTURE_HTML_PATH, 'utf-8');

  definirRepertoireDonnees(tempDataDir);
  definirRepertoireConfigs(tempConfigsDir);
  resetDataStoreCache();

  // Stub `fetch` : ne répond qu'à `URL_LISTE` (contenu de la fixture
  // `publication-propre.html`, T036) — jamais de véritable accès réseau,
  // même convention que `tests/unit/connecteurs/moteurPageWeb.test.ts`. Le
  // lien PDF joint (troisième publication de la fixture) échoue donc au
  // téléchargement (404) : le moteur retombe sur le texte du titre seul
  // pour ce candidat (isolation à l'échelle du candidat, cf. moteur.ts),
  // sans affecter le candidat "2026-77-0512" testé ici.
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

afterEach(async () => {
  definirRepertoireDonnees(null);
  definirRepertoireConfigs(null);
  resetDataStoreCache();
  vi.unstubAllGlobals();

  // Best-effort : ces répertoires vivent hors du point de montage partagé
  // avec l'utilisateur (contrairement au dépôt), la suppression y fonctionne
  // normalement — mais un échec ici ne doit jamais faire échouer le test lui-même.
  await rm(tempDataDir, { recursive: true, force: true }).catch(() => {});
  await rm(tempConfigsDir, { recursive: true, force: true }).catch(() => {});
});

/**
 * Simule l'opérateur "ajoutant un connecteur" pour '99' (US2) : une entrée
 * `connecteurs.json` + une configuration déclarative
 * (`configs/<id>.yaml`), sans toucher au code cœur — exactement ce que
 * font T032-T034 pour les connecteurs réels. Écrit désormais dans les deux
 * répertoires temporaires de ce test (cf. `beforeEach`), jamais en
 * production.
 */
async function ajouterConnecteurDeTest(): Promise<void> {
  const reels = JSON.parse(connecteursReels) as Array<Record<string, unknown>>;
  const patches: Array<Record<string, unknown>> = [
    ...reels,
    {
      id: CONNECTEUR_ID,
      nom: 'Connecteur de test (ajout, US2, T038)',
      departements_couverts: ['99'],
      actif: true,
      derniere_collecte: null,
      type_connecteur: 'page_web',
    },
  ];
  await writeFile(path.join(tempDataDir, 'connecteurs.json'), JSON.stringify(patches, null, 2) + '\n', 'utf-8');

  const configYaml = await readFile(FIXTURE_CONFIG_PATH, 'utf-8');
  await writeFile(path.join(tempConfigsDir, `${CONNECTEUR_ID}.yaml`), configYaml, 'utf-8');

  resetDataStoreCache();
}

describe('US2 — ajouter un connecteur pour un département gris (T038)', () => {
  it("le département '99' est gris avant l'ajout de tout connecteur (non couvert)", async () => {
    const store = await loadDataStore(true);
    expect(store.departementsCouverts.has('99')).toBe(false);
    const etatAvant = computeDepartementState(store, '99', '2026-08-13');
    expect(etatAvant.etat).toBe('gris');
  });

  it('un déclenchement manuel publie directement un événement complet et non ambigu, sans anomalie', async () => {
    await ajouterConnecteurDeTest();

    const connecteur = await obtenirConnecteur(CONNECTEUR_ID);
    expect(connecteur).not.toBeNull();

    const execution = await executerConnecteur(connecteur!, 'manuel');

    expect(execution.declenchement).toBe('manuel');
    expect(execution.nombre_evenements_publies).toBe(1);
    expect(execution.statut).not.toBe('echec');

    const store = await loadDataStore(true);
    const evenements = store.evenementsByDepartement.get('99') ?? [];
    expect(evenements).toHaveLength(1);
    expect(evenements[0].reference_arrete).toBe('2026-77-0512');
    expect(evenements[0].methode_collecte).toBe('automatique');
    expect(evenements[0].connecteur_id).toBe(CONNECTEUR_ID);
    expect(evenements[0].source_url).toBe(URL_LISTE);
  });

  it("après ajout du connecteur et collecte, le département n'est plus gris à une date couverte par l'événement publié (US2.1, US2.2)", async () => {
    await ajouterConnecteurDeTest();

    const connecteur = await obtenirConnecteur(CONNECTEUR_ID);
    await executerConnecteur(connecteur!, 'manuel');

    const store = await loadDataStore(true);
    const etatApres = computeDepartementState(store, '99', '2026-08-13');

    expect(etatApres.etat).not.toBe('gris');
    expect(etatApres.etat).toBe('rouge');
    expect(etatApres.evenement_applicable?.reference_arrete).toBe('2026-77-0512');
  });
});
