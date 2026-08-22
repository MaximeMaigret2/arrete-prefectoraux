import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  AnomaliesCollecteListSchema,
  ConnecteurSchema,
  ConnecteursListSchema,
  DepartementsListSchema,
  EvenementsListSchema,
  ExecutionsCollecteListSchema,
  RegistreSourcesSchema,
  type AnomalieCollecte,
  type Connecteur,
  type Departement,
  type EntreeRegistre,
  type Evenement,
  type ExecutionCollecte,
} from '../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = __dirname;
let dataDirActuel = DEFAULT_DATA_DIR;

/**
 * Q-006 (lot Qualité — Durcissement, 2026-08-22) : point d'injection réservé
 * aux tests. Redirige toutes les lectures/écritures de ce module
 * (`loadDataStore()`, `appendEvenement()`, `appendExecution()`,
 * `upsertAnomalie()`, `updateConnecteur()`) vers `dir` au lieu des vrais
 * fichiers `src/data/*.json` — un test qui écrit réellement sur disque
 * (`ajoutConnecteur.test.ts`, `idempotence.test.ts`) pointe ainsi vers un
 * répertoire temporaire jetable plutôt que la production : un kill mi-test
 * (plafond `device_bash` documenté ailleurs) ne laisse alors plus aucune
 * trace dans les fichiers réels (incident du 2026-08-21/22 sur
 * `connecteurs.json`/`anomalies.json`/`executions.json`/`events/19.json`,
 * cf. `claude/etat-connecteurs.md`, section "Lot Qualité"). `dir === null`
 * restaure le répertoire réel par défaut. Ne jamais appeler depuis du code
 * applicatif — uniquement depuis des tests.
 */
export function definirRepertoireDonnees(dir: string | null): void {
  dataDirActuel = dir ?? DEFAULT_DATA_DIR;
  resetDataStoreCache();
}

function obtenirRepertoireDonnees(): string {
  return dataDirActuel;
}

function obtenirRepertoireEvenements(): string {
  return path.join(obtenirRepertoireDonnees(), 'events');
}

export interface DataStore {
  departements: Departement[];
  departementsByCode: Map<string, Departement>;
  connecteurs: Connecteur[];
  /** departement_code -> événements triés par date_debut croissante */
  evenementsByDepartement: Map<string, Evenement[]>;
  /** Ensemble des codes de département jamais couverts par au moins un connecteur. */
  departementsCouverts: Set<string>;
  /** Date de dernière mise à jour globale du jeu de données (FR-012). */
  derniereMiseAJour: string;
  /** Exécutions de collecte, append-only (data-model.md, "Entité Exécution de collecte"). */
  executions: ExecutionCollecte[];
  /** Anomalies de collecte, en attente ou résolues (data-model.md, "Entité Anomalie de collecte"). */
  anomalies: AnomalieCollecte[];
  /** Registre des sources, une entrée par département (contracts/registre-sources.schema.md, FR-017/FR-018). */
  registreSources: EntreeRegistre[];
}

let cachedStore: DataStore | null = null;

async function loadJson<T>(filePath: string, fallback: T): Promise<unknown> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

async function loadYaml<T>(filePath: string, fallback: T): Promise<unknown> {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return yaml.load(raw);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return fallback;
    }
    throw err;
  }
}

/**
 * Charge en mémoire departements.json, connecteurs.json et un fichier
 * d'événements par département (events/<code>.json). Cf. research.md §3 :
 * pas de base de données, chargement mémoire suffisant au volume actuel.
 */
export async function loadDataStore(forceReload = false): Promise<DataStore> {
  if (cachedStore && !forceReload) {
    return cachedStore;
  }

  const departementsRaw = await loadJson(path.join(obtenirRepertoireDonnees(), 'departements.json'), []);
  const departements = DepartementsListSchema.parse(departementsRaw);

  const connecteursRaw = await loadJson(path.join(obtenirRepertoireDonnees(), 'connecteurs.json'), []);
  const connecteurs = ConnecteursListSchema.parse(connecteursRaw);

  const executionsRaw = await loadJson(path.join(obtenirRepertoireDonnees(), 'executions.json'), []);
  const executions = ExecutionsCollecteListSchema.parse(executionsRaw);

  const anomaliesRaw = await loadJson(path.join(obtenirRepertoireDonnees(), 'anomalies.json'), []);
  const anomalies = AnomaliesCollecteListSchema.parse(anomaliesRaw);

  const registreSourcesRaw = await loadYaml(path.join(obtenirRepertoireDonnees(), 'registre-sources.yaml'), []);
  const registreSources = RegistreSourcesSchema.parse(registreSourcesRaw);

  const departementsCouverts = new Set<string>();
  for (const c of connecteurs) {
    for (const code of c.departements_couverts) {
      departementsCouverts.add(code);
    }
  }

  const evenementsByDepartement = new Map<string, Evenement[]>();
  let latestDerniereCollecte: string | null = null;

  let eventFiles: string[] = [];
  try {
    eventFiles = (await readdir(obtenirRepertoireEvenements())).filter((f) => f.endsWith('.json'));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  for (const file of eventFiles) {
    const raw = await loadJson(path.join(obtenirRepertoireEvenements(), file), []);
    const parsed = EvenementsListSchema.parse(raw);
    parsed.sort((a, b) => a.date_debut.localeCompare(b.date_debut));
    for (const evt of parsed) {
      const list = evenementsByDepartement.get(evt.departement_code) ?? [];
      list.push(evt);
      evenementsByDepartement.set(evt.departement_code, list);
      if (!latestDerniereCollecte || evt.date_saisie > latestDerniereCollecte) {
        latestDerniereCollecte = evt.date_saisie;
      }
    }
  }
  for (const list of evenementsByDepartement.values()) {
    list.sort((a, b) => a.date_debut.localeCompare(b.date_debut));
  }

  for (const c of connecteurs) {
    if (c.derniere_collecte && (!latestDerniereCollecte || c.derniere_collecte > latestDerniereCollecte)) {
      latestDerniereCollecte = c.derniere_collecte;
    }
  }

  cachedStore = {
    departements,
    departementsByCode: new Map(departements.map((d) => [d.code, d])),
    connecteurs,
    evenementsByDepartement,
    departementsCouverts,
    derniereMiseAJour: latestDerniereCollecte ?? new Date(0).toISOString(),
    executions,
    anomalies,
    registreSources,
  };

  return cachedStore;
}

/** Réinitialise le cache mémoire (utile pour les tests). */
export function resetDataStoreCache(): void {
  cachedStore = null;
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

/**
 * Ajoute un événement à `events/<departement_code>.json` (append-only,
 * Principe 2 — un événement n'est jamais modifié après écriture) et
 * invalide le cache mémoire : le prochain `loadDataStore()` recharge
 * l'ensemble du jeu de données depuis le disque plutôt que de risquer une
 * divergence entre le cache et le fichier (tri, `derniereMiseAJour`, etc.).
 */
export async function appendEvenement(evenement: Evenement): Promise<void> {
  const filePath = path.join(obtenirRepertoireEvenements(), `${evenement.departement_code}.json`);
  const raw = await loadJson(filePath, []);
  const existing = EvenementsListSchema.parse(raw);
  existing.push(evenement);
  await writeJson(filePath, existing);
  resetDataStoreCache();
}

/**
 * Ajoute une exécution de collecte à `executions.json` — append-only,
 * jamais modifiée après écriture (data-model.md, "Entité Exécution de
 * collecte").
 */
export async function appendExecution(execution: ExecutionCollecte): Promise<void> {
  const filePath = path.join(obtenirRepertoireDonnees(), 'executions.json');
  const raw = await loadJson(filePath, []);
  const existing = ExecutionsCollecteListSchema.parse(raw);
  existing.push(execution);
  await writeJson(filePath, existing);
  resetDataStoreCache();
}

/**
 * Insère ou remplace (par `id`) une anomalie de collecte dans
 * `anomalies.json`. Contrairement aux événements/exécutions, une anomalie
 * transite de `en_attente` vers `confirmee`/`rejetee` (FR-009) : d'où une
 * mise à jour en place plutôt qu'un append-only strict.
 */
export async function upsertAnomalie(anomalie: AnomalieCollecte): Promise<void> {
  const filePath = path.join(obtenirRepertoireDonnees(), 'anomalies.json');
  const raw = await loadJson(filePath, []);
  const existing = AnomaliesCollecteListSchema.parse(raw);
  const idx = existing.findIndex((a) => a.id === anomalie.id);
  if (idx === -1) {
    existing.push(anomalie);
  } else {
    existing[idx] = anomalie;
  }
  await writeJson(filePath, existing);
  resetDataStoreCache();
}

/**
 * Met à jour un connecteur existant dans `connecteurs.json` (ex.
 * `derniere_collecte` à l'issue d'un run réussi — data-model.md, "Entité
 * Exécution de collecte"). Ne crée jamais de nouveau connecteur : la
 * liste des connecteurs est gérée hors de ce helper (`connecteurs.json`
 * édité manuellement).
 */
export async function updateConnecteur(
  connecteurId: string,
  updates: Partial<Omit<Connecteur, 'id'>>,
): Promise<void> {
  const filePath = path.join(obtenirRepertoireDonnees(), 'connecteurs.json');
  const raw = await loadJson(filePath, []);
  const existing = ConnecteursListSchema.parse(raw);
  const idx = existing.findIndex((c) => c.id === connecteurId);
  if (idx === -1) {
    throw new Error(`updateConnecteur: connecteur inconnu "${connecteurId}"`);
  }
  existing[idx] = ConnecteurSchema.parse({ ...existing[idx], ...updates, id: existing[idx].id });
  await writeJson(filePath, existing);
  resetDataStoreCache();
}
