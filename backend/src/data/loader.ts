import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConnecteursListSchema,
  DepartementsListSchema,
  EvenementsListSchema,
  type Connecteur,
  type Departement,
  type Evenement,
} from '../models/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = __dirname;
const EVENTS_DIR = path.join(DATA_DIR, 'events');

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

/**
 * Charge en mémoire departements.json, connecteurs.json et un fichier
 * d'événements par département (events/<code>.json). Cf. research.md §3 :
 * pas de base de données, chargement mémoire suffisant au volume actuel.
 */
export async function loadDataStore(forceReload = false): Promise<DataStore> {
  if (cachedStore && !forceReload) {
    return cachedStore;
  }

  const departementsRaw = await loadJson(path.join(DATA_DIR, 'departements.json'), []);
  const departements = DepartementsListSchema.parse(departementsRaw);

  const connecteursRaw = await loadJson(path.join(DATA_DIR, 'connecteurs.json'), []);
  const connecteurs = ConnecteursListSchema.parse(connecteursRaw);

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
    eventFiles = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith('.json'));
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  for (const file of eventFiles) {
    const raw = await loadJson(path.join(EVENTS_DIR, file), []);
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
  };

  return cachedStore;
}

/** Réinitialise le cache mémoire (utile pour les tests). */
export function resetDataStoreCache(): void {
  cachedStore = null;
}
