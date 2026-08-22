import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { loadDataStore } from '../data/loader.js';
import type { Connecteur as ConnecteurEntree } from '../models/index.js';
import * as moteurPageWeb from './moteurs/pageWeb/moteur.js';
import * as moteurPdf from './moteurs/pdf/moteur.js';
import * as moteurRss from './moteurs/rss/moteur.js';
import type { Connecteur as ConnecteurRuntime } from './types.js';

/**
 * Charge `connecteurs.json` + la configuration déclarative de chaque
 * connecteur (`configs/<id>.yaml`) et instancie l'interface commune
 * `Connecteur` (contracts/connecteur-interface.md §1) que consomment
 * `runner.ts`, le scheduler (T040) et le déclenchement manuel (T035).
 * `creerConnecteur()` est le seul point du code qui connaît les types de
 * moteur existants — `runner.ts` n'a aucune branche sur `type_connecteur`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONFIGS_DIR = path.join(__dirname, 'configs');
let configsDirActuel = DEFAULT_CONFIGS_DIR;

/**
 * Q-006 (lot Qualité — Durcissement, 2026-08-22) : même principe que
 * `data/loader.ts#definirRepertoireDonnees()` — réservé aux tests qui créent
 * réellement un fichier `configs/<id>.yaml` (`ajoutConnecteur.test.ts`), pour
 * ne plus jamais écrire dans le vrai répertoire `connecteurs/configs/` de
 * production. `dir === null` restaure le répertoire réel par défaut. Ne
 * jamais appeler depuis du code applicatif — uniquement depuis des tests.
 */
export function definirRepertoireConfigs(dir: string | null): void {
  configsDirActuel = dir ?? DEFAULT_CONFIGS_DIR;
}

function obtenirRepertoireConfigs(): string {
  return configsDirActuel;
}

/**
 * Dispatch sur `type_connecteur` (contrat §1) — seul endroit du code qui
 * connaît les types de moteur existants (contrat §4, étape 3). Chaque
 * moteur valide lui-même sa configuration via son propre schéma zod
 * (`PageWebConfigSchema`/`PdfConfigSchema`/`RssConfigSchema`) ; une configuration invalide
 * remonte donc comme une exception explicite plutôt qu'un connecteur
 * silencieusement cassé (règle 2 du contrat, §5).
 */
export function creerConnecteur(entree: ConnecteurEntree, config: unknown): ConnecteurRuntime {
  switch (entree.type_connecteur) {
    case 'page_web':
      return moteurPageWeb.creerConnecteur(entree, config);
    case 'pdf':
      return moteurPdf.creerConnecteur(entree, config);
    case 'rss':
      return moteurRss.creerConnecteur(entree, config);
    default: {
      // Exhaustivité TypeScript : toute nouvelle valeur de `type_connecteur`
      // (contrat §4) doit être ajoutée ici avant de compiler.
      const exhaustif: never = entree.type_connecteur;
      throw new Error(`Connecteur "${entree.id}" : type_connecteur inconnu "${String(exhaustif)}".`);
    }
  }
}

/** Charge et parse la configuration déclarative YAML d'un connecteur (`configs/<id>.yaml`). */
async function chargerConfig(connecteurId: string): Promise<unknown> {
  const filePath = path.join(obtenirRepertoireConfigs(), `${connecteurId}.yaml`);
  const raw = await readFile(filePath, 'utf-8');
  return yaml.load(raw);
}

/**
 * Charge et instancie tous les connecteurs actifs (`connecteurs.json`,
 * `actif: true`), pour le scheduler (T040, FR-013). Un connecteur dont la
 * configuration est absente/invalide, ou dont le moteur n'est pas encore
 * câblé, est écarté individuellement (avec un message d'erreur explicite)
 * plutôt que de faire échouer le chargement des autres — même principe
 * d'isolation que `runner.ts` applique à l'exécution (contrat §5, règle 6 ;
 * FR-012, Principe 10 : un connecteur en échec n'affecte jamais les autres).
 */
export async function chargerConnecteursActifs(): Promise<ConnecteurRuntime[]> {
  const store = await loadDataStore();
  const actifs = store.connecteurs.filter((c) => c.actif);

  const resultats: ConnecteurRuntime[] = [];
  for (const entree of actifs) {
    try {
      const config = await chargerConfig(entree.id);
      resultats.push(creerConnecteur(entree, config));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`registry: impossible d'instancier le connecteur "${entree.id}" — ${message}`);
    }
  }
  return resultats;
}

/**
 * Charge et instancie un connecteur par id, qu'il soit actif ou non — le
 * cas `actif: false` est traité par l'appelant (T035 : 409 pour un
 * déclenchement manuel sur un connecteur désactivé), pas ici. Retourne
 * `null` si l'id est inconnu de `connecteurs.json`.
 */
export async function obtenirConnecteur(connecteurId: string): Promise<ConnecteurRuntime | null> {
  const store = await loadDataStore();
  const entree = store.connecteurs.find((c) => c.id === connecteurId);
  if (!entree) return null;
  const config = await chargerConfig(entree.id);
  return creerConnecteur(entree, config);
}

/** Trouve l'entrée `connecteurs.json` d'un id donné, sans tenter d'instancier son connecteur runtime (utile pour vérifier `actif` avant d'appeler `obtenirConnecteur`, ex. T035). */
export async function trouverConnecteurEntree(connecteurId: string): Promise<ConnecteurEntree | null> {
  const store = await loadDataStore();
  return store.connecteurs.find((c) => c.id === connecteurId) ?? null;
}
