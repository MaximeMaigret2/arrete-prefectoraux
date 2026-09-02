import type { DepartementEtatsPeriode, DepartementState } from './apiClient.js';

/**
 * Fonction pure de recherche de segment (feature 006, FR-006/FR-007) : pour
 * chaque département, retrouve le segment dont les bornes
 * `[date_debut, date_fin]` (inclusives) contiennent `date`, et le convertit
 * en `DepartementState` — la même forme que retournerait
 * `GET /departements?date=...` pour ce jour. Aucune règle de calcul d'état
 * n'est réévaluée ici : une simple comparaison de plages de dates déjà
 * résolues par le serveur (Principe 9 — le frontend reste un client de
 * l'API, sans logique métier dupliquée).
 *
 * Comparaison lexicographique des dates `YYYY-MM-DD` : valide car ce format
 * est déjà trié chronologiquement caractère par caractère.
 */
export function resolveEtatDepuisSegments(
  departements: DepartementEtatsPeriode[],
  date: string,
): Map<string, DepartementState> {
  const result = new Map<string, DepartementState>();

  for (const dept of departements) {
    const segment = dept.segments.find((s) => s.date_debut <= date && date <= s.date_fin);

    // Garde-fou : ne devrait pas se produire si le backend couvre bien tout
    // l'intervalle demandé (FR-004) — replie sur un état "gris" neutre
    // plutôt que de laisser `etat` indéfini.
    result.set(dept.code, {
      code: dept.code,
      nom: dept.nom,
      etat: segment?.etat ?? 'gris',
      evenement_applicable: segment?.evenement_applicable ?? null,
      connecteur_id: dept.connecteur_id,
      derniere_collecte: dept.derniere_collecte,
      dernier_arrete_connu: segment?.dernier_arrete_connu ?? null,
    });
  }

  return result;
}
