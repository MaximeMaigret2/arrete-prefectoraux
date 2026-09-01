import type { DataStore } from '../data/loader.js';
import type { Evenement } from '../models/index.js';
import { parisDayStartUTC, parisNextDayStartUTC, toParisCalendarDate } from './parisDate.js';

export type Etat = 'vert' | 'rouge' | 'gris';

/**
 * Dernier arrêté d'interdiction/prolongation déjà terminé pour un
 * département `vert` (idée n°2 du backlog produit, 2026-09-01) — distinct
 * de `evenement_applicable` (réservé aux arrêtés ACTIFS, `rouge`). `date_fin`
 * est toujours renseignée ici (jamais `null`, contrairement au `date_fin`
 * brut d'un `Evenement` stocké) : c'est la date à AFFICHER, résolue soit
 * depuis la `date_fin` propre de l'arrêté, soit depuis la date de la levée
 * qui y a mis fin quand `date_fin` est restée `null` (cf.
 * `findDernierArreteConnu` ci-dessous).
 */
export interface DernierArreteConnu {
  reference_arrete: string | null;
  date_debut: string;
  date_fin: string;
}

export interface DepartementStateResult {
  etat: Etat;
  evenement_applicable: Evenement | null;
  /** Non-null uniquement quand `etat` est `vert` et qu'un arrêté antérieur existe. */
  dernier_arrete_connu: DernierArreteConnu | null;
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
 * Résout le dernier arrêté d'interdiction/prolongation déjà terminé à
 * `dayStart` (idée n°2 du backlog produit) : parmi les poses dont
 * `effectiveEndExclusiveUTC` est non-null et déjà atteint à `dayStart` (donc
 * exclues des `activePoses` de `computeDepartementState`), retourne la plus
 * récemment débutée. N'est appelé que pour un département dont l'état
 * calculé est `vert` (aucune pose active à `dayStart`) — jamais pour
 * `rouge`/`gris`, où ce champ reste `null`.
 */
function findDernierArreteConnu(events: Evenement[], dayStart: Date): DernierArreteConnu | null {
  const posesTerminees = events
    .filter((e) => e.type_evenement === 'interdiction' || e.type_evenement === 'prolongation')
    .map((pose) => ({ pose, finExclusive: effectiveEndExclusiveUTC(pose, events) }))
    .filter(
      (entry): entry is { pose: Evenement; finExclusive: Date } =>
        entry.finExclusive !== null && entry.finExclusive.getTime() <= dayStart.getTime(),
    );

  if (posesTerminees.length === 0) {
    return null;
  }

  const dernier = [...posesTerminees].sort((a, b) =>
    b.pose.date_debut.localeCompare(a.pose.date_debut),
  )[0].pose;

  // dateFinAffichee : garantie non-null ici — seules des poses dont
  // `effectiveEndExclusiveUTC` est non-null sont retenues ci-dessus, ce qui
  // n'est possible que si `dernier.date_fin` est renseignée OU qu'une levée
  // postérieure existe (même logique que `effectiveEndExclusiveUTC`).
  const leveeSuivante = events
    .filter((e) => e.type_evenement === 'levee' && e.date_debut > dernier.date_debut)
    .sort((a, b) => a.date_debut.localeCompare(b.date_debut))[0];
  const dateFinAffichee = dernier.date_fin ?? leveeSuivante?.date_debut ?? null;

  return {
    reference_arrete: dernier.reference_arrete,
    date_debut: dernier.date_debut,
    date_fin: dateFinAffichee as string,
  };
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
    return { etat: 'gris', evenement_applicable: null, dernier_arrete_connu: null };
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
      return { etat: 'gris', evenement_applicable: null, dernier_arrete_connu: null };
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
    // 4. Couvert, aucune interdiction active à cette date → vert. Idée n°2
    // du backlog produit : on résout au passage le dernier arrêté terminé,
    // le cas échéant, pour l'affichage dans l'infobulle.
    return {
      etat: 'vert',
      evenement_applicable: null,
      dernier_arrete_connu: findDernierArreteConnu(events, dayStart),
    };
  }

  // evenement_applicable = le plus récemment débuté parmi les actifs.
  const mostRecent = [...activePoses].sort((a, b) => b.date_debut.localeCompare(a.date_debut))[0];

  return { etat: 'rouge', evenement_applicable: mostRecent, dernier_arrete_connu: null };
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
