import type { DataStore } from '../data/loader.js';
import type { Evenement } from '../models/index.js';
import { parisDayStartUTC, parisNextDayStartUTC, toParisCalendarDate } from './parisDate.js';

export type Etat = 'vert' | 'rouge' | 'gris';

export interface DepartementStateResult {
  etat: Etat;
  evenement_applicable: Evenement | null;
}

/**
 * Calcule l'effective "fin exclusive" (instant UTC à partir duquel
 * l'événement `pose` n'est plus actif) selon data-model.md §Logique de calcul :
 * - si `pose.date_fin` est renseignée : fin exclusive = début du lendemain
 *   (Europe/Paris) de la journée de `date_fin` (date_fin marque la fin de la
 *   journée concernée, bornes incluses).
 * - sinon, si une `levee` postérieure existe (date_debut > pose.date_debut)
 *   pour le même département : fin exclusive = début (Europe/Paris) du jour
 *   de cette levée (le jour de la levée est déjà vert).
 * - sinon : pas de fin connue (actif jusqu'à preuve du contraire) → `null`.
 */
function effectiveEndExclusiveUTC(pose: Evenement, sameDeptEvents: Evenement[]): Date | null {
  if (pose.date_fin) {
    const finDay = toParisCalendarDate(pose.date_fin);
    return parisNextDayStartUTC(finDay);
  }

  const laterLevee = sameDeptEvents
    .filter((e) => e.type_evenement === 'levee' && e.date_debut > pose.date_debut)
    .sort((a, b) => a.date_debut.localeCompare(b.date_debut))[0];

  if (laterLevee) {
    const leveeDay = toParisCalendarDate(laterLevee.date_debut);
    return parisDayStartUTC(leveeDay);
  }

  return null;
}

/**
 * Fonction pure calculant l'état d'un département à une date T
 * (data-model.md §Logique de calcul). Ne fait aucun accès disque : le
 * `DataStore` doit avoir été chargé au préalable (voir data/loader.ts).
 */
export function computeDepartementState(
  store: DataStore,
  code: string,
  dateStr: string,
): DepartementStateResult {
  // 1. Pas de connecteur ayant jamais couvert ce département → gris.
  if (!store.departementsCouverts.has(code)) {
    return { etat: 'gris', evenement_applicable: null };
  }

  const events = store.evenementsByDepartement.get(code) ?? [];
  const dayStart = parisDayStartUTC(dateStr);

  // 1bis. Si des événements existent pour ce département, la couverture
  // effective ne commence qu'à la date du premier événement connu (le plus
  // ancien `date_debut`) : avant cette date, aucune donnée n'a encore été
  // collectée pour ce département → gris, jamais vert par défaut
  // (spec.md FR-016 / Acceptance Scenario US2.4 : "date antérieure à
  // l'existence de toute donnée collectée" → gris pour les départements
  // concernés). Un département couvert sans aucun événement (jamais
  // d'arrêté) reste vert à toute date : c'est un dossier "propre", distinct
  // d'une absence de couverture temporelle.
  if (events.length > 0) {
    const earliestStart = parisDayStartUTC(toParisCalendarDate(events[0].date_debut));
    if (dayStart.getTime() < earliestStart.getTime()) {
      return { etat: 'gris', evenement_applicable: null };
    }
  }

  // 2-3. Parmi les interdictions/prolongations, celles actives à `dateStr`
  // (non annulées par une levée postérieure à leur propre date_debut et
  // antérieure ou égale à `dateStr`).
  const activePoses = events.filter((e) => {
    if (e.type_evenement !== 'interdiction' && e.type_evenement !== 'prolongation') {
      return false;
    }
    const startsAt = parisDayStartUTC(toParisCalendarDate(e.date_debut));
    if (startsAt.getTime() > dayStart.getTime()) {
      return false; // pas encore débuté à cette date
    }
    const endExclusive = effectiveEndExclusiveUTC(e, events);
    if (endExclusive && endExclusive.getTime() <= dayStart.getTime()) {
      return false; // déjà terminé/levé à cette date
    }
    return true;
  });

  if (activePoses.length === 0) {
    // 4. Couvert, aucune interdiction active à cette date → vert.
    return { etat: 'vert', evenement_applicable: null };
  }

  // evenement_applicable = le plus récemment débuté parmi les actifs.
  const mostRecent = [...activePoses].sort((a, b) => b.date_debut.localeCompare(a.date_debut))[0];

  return { etat: 'rouge', evenement_applicable: mostRecent };
}

/** Calcule l'état de tous les départements référencés à une date donnée. */
export function computeAllDepartementsState(
  store: DataStore,
  dateStr: string,
): Array<{ code: string; nom: string; state: DepartementStateResult }> {
  return store.departements.map((d) => ({
    code: d.code,
    nom: d.nom,
    state: computeDepartementState(store, d.code, dateStr),
  }));
}
