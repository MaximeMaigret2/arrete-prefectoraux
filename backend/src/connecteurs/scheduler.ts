import { schedule } from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import { chargerConnecteursActifs } from './registry.js';
import { executerConnecteur } from './runner.js';
import type { Connecteur } from './types.js';

/**
 * Ordonnancement quotidien de la collecte (FR-013, research.md §6) : une
 * tâche cron unique, en heure creuse (05:00 Europe/Paris par défaut),
 * exécute chaque connecteur actif une fois par jour. Réutilise
 * `executerConnecteur` exactement comme le déclenchement manuel (FR-014,
 * T035) — un seul chemin d'exécution testé, `declenchement: 'planifie'`
 * étant la seule différence avec `'manuel'`.
 */

const EXPRESSION_PAR_DEFAUT = '0 5 * * *';
const TIMEZONE_PAR_DEFAUT = 'Europe/Paris';
const NOM_TACHE = 'collecte-quotidienne';

let tacheCourante: ScheduledTask | null = null;

/**
 * Exécute chaque connecteur fourni séquentiellement (jamais en parallèle,
 * pour éviter des écritures concurrentes dans les fichiers de données —
 * `data/loader.ts` n'offre aucune garantie de verrouillage). Une exception
 * non interceptée par `executerConnecteur` (cas théorique : ce dernier
 * capture déjà toute erreur de `connecteur.collecter()` pour la
 * transformer en `ExecutionCollecte` de statut `echec`, contrat §5 règle
 * 6) est journalisée et isolée à CE seul connecteur, sans interrompre le
 * cycle des suivants — même principe d'isolation que
 * `registry.chargerConnecteursActifs` applique déjà au chargement
 * (FR-012, Principe 10).
 *
 * Séparée de `executerCycleQuotidien` pour rester testable avec une liste
 * de connecteurs factices, sans dépendre du registre ni de fichiers de
 * configuration réels.
 */
export async function executerConnecteursPlanifies(connecteurs: Connecteur[]): Promise<void> {
  for (const connecteur of connecteurs) {
    try {
      await executerConnecteur(connecteur, 'planifie');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `scheduler: échec inattendu de l'exécution planifiée du connecteur "${connecteur.id}" — ${message}`,
      );
    }
  }
}

/** Cycle quotidien complet : charge tous les connecteurs actifs (`registry.ts`) puis les exécute. C'est cette fonction que la tâche cron invoque. */
export async function executerCycleQuotidien(): Promise<void> {
  const connecteurs = await chargerConnecteursActifs();
  await executerConnecteursPlanifies(connecteurs);
}

/**
 * Démarre le scheduler : une tâche cron unique couvrant tous les
 * connecteurs actifs (FR-013). Idempotent — un second appel sans
 * `arreterScheduler()` préalable retourne la tâche déjà en cours plutôt
 * que d'en enregistrer une seconde en parallèle (ex. rechargement à
 * chaud, appel accidentel multiple au boot).
 */
export function demarrerScheduler(
  options: { expression?: string; timezone?: string } = {},
): ScheduledTask {
  if (tacheCourante) return tacheCourante;

  const expression = options.expression ?? EXPRESSION_PAR_DEFAUT;
  const timezone = options.timezone ?? TIMEZONE_PAR_DEFAUT;

  tacheCourante = schedule(
    expression,
    async () => {
      await executerCycleQuotidien();
    },
    {
      timezone,
      name: NOM_TACHE,
      // Un cycle encore en cours (source lente, nombreux connecteurs) ne
      // doit jamais se chevaucher avec le déclenchement planifié suivant.
      noOverlap: true,
    },
  );

  return tacheCourante;
}

/** Arrête et détruit la tâche planifiée (arrêt propre du serveur, isolation entre tests). Sans effet si le scheduler n'est pas démarré. */
export function arreterScheduler(): void {
  if (!tacheCourante) return;
  tacheCourante.stop();
  tacheCourante = null;
}

/** Indique si le scheduler est actuellement démarré (utilitaire pour les tests / diagnostics). */
export function schedulerActif(): boolean {
  return tacheCourante !== null;
}
