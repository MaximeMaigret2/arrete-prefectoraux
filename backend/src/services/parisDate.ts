/**
 * Utilitaires de fuseau horaire — Principe 6 de la constitution (rigueur
 * temporelle) : stockage ISO 8601 UTC, calculs de journée effectués en
 * Europe/Paris avant comparaison aux événements (research.md §5).
 *
 * Implémenté avec `Intl.DateTimeFormat` (natif Node.js 20) pour éviter une
 * dépendance de fuseau horaire supplémentaire côté backend.
 */

const PARIS_TZ = 'Europe/Paris';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidDateError extends Error {}

/** Valide un paramètre de date au format YYYY-MM-DD. */
export function assertValidDateParam(value: string, paramName = 'date'): void {
  if (!DATE_ONLY_RE.test(value)) {
    throw new InvalidDateError(`Le paramètre '${paramName}' doit être au format YYYY-MM-DD.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new InvalidDateError(`Le paramètre '${paramName}' doit être une date calendaire valide.`);
  }
}

/**
 * Retourne le décalage (en minutes) entre UTC et Europe/Paris pour un instant
 * UTC donné (gère automatiquement l'heure d'été/hiver).
 */
function parisOffsetMinutesAt(utcInstant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(utcInstant).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - utcInstant.getTime()) / 60000);
}

/**
 * Pour une date calendaire 'YYYY-MM-DD' interprétée en Europe/Paris, retourne
 * l'instant UTC correspondant au début (00:00:00 heure de Paris) de ce jour.
 */
export function parisDayStartUTC(dateStr: string): Date {
  assertValidDateParam(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  // Première approximation : minuit UTC du même jour calendaire.
  const approx = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offsetMin = parisOffsetMinutesAt(approx);
  // minuit Paris = minuit UTC - offset(Paris)
  return new Date(approx.getTime() - offsetMin * 60000);
}

/** Début du jour calendaire (Europe/Paris) suivant `dateStr`. */
export function parisNextDayStartUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return parisDayStartUTC(`${yyyy}-${mm}-${dd}`);
}

/** Convertit un instant ISO (UTC) en date calendaire 'YYYY-MM-DD' Europe/Paris. */
export function toParisCalendarDate(isoInstant: string): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(new Date(isoInstant));
}

/**
 * Couple année/mois calendaire (Europe/Paris), forme commune à
 * `parisAnneeMoisCourant`/`parisAnneeMoisDecale`/`decalerAnneeMois` — le
 * "mois cible" que peut désormais accepter `Connecteur.collecter()`
 * (feature 005, US1) est exactement cette forme, jamais un `Date` brut
 * (contrat §5, règle 8 : jamais d'arithmétique de date en dehors de ce
 * module, cf. Principe 6 de la constitution).
 */
export interface AnneeMois {
  annee: string;
  moisNumero: string;
}

/**
 * Année et mois courants (Europe/Paris) pour un instant UTC donné — utilisé
 * par la résolution de `navigation` du moteur `page_web`
 * (contracts/connecteur-interface.md §2) pour substituer les placeholders
 * `{annee}`/`{mois_numero}`/`{mois_fr}` d'un motif déclaratif, sans jamais
 * coder en dur une année ou un mois dans une configuration de connecteur.
 */
export function parisAnneeMoisCourant(maintenant: Date = new Date()): AnneeMois {
  const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS_TZ, year: 'numeric', month: '2-digit' });
  const parts = dtf.formatToParts(maintenant).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return { annee: parts.year, moisNumero: parts.month };
}

/**
 * Décale un couple {@link AnneeMois} de `nombreMois` mois vers le passé
 * (un `nombreMois` négatif avance dans le temps), en gérant correctement le
 * franchissement d'une ou plusieurs frontières d'année — utilisé par
 * `volumetrie.ts`/`backfill-historique.ts` (feature 005, US1/US2/US3) pour
 * énumérer les mois cibles d'une collecte historique sans jamais faire
 * d'arithmétique de date en dehors de ce module (Principe 6).
 */
export function decalerAnneeMois(cible: AnneeMois, nombreMois: number): AnneeMois {
  const indexMoisAbsolu = Number(cible.annee) * 12 + (Number(cible.moisNumero) - 1) - nombreMois;
  const anneeResultat = Math.floor(indexMoisAbsolu / 12);
  const moisIndexZeroBase = ((indexMoisAbsolu % 12) + 12) % 12;
  return { annee: String(anneeResultat), moisNumero: String(moisIndexZeroBase + 1).padStart(2, '0') };
}

/**
 * Mois cible décalé de `nombreMoisAvant` mois avant le mois courant
 * (Europe/Paris) d'un instant UTC de référence — raccourci de
 * `decalerAnneeMois(parisAnneeMoisCourant(maintenant), nombreMoisAvant)`,
 * utilisé pour cibler un mois arbitrairement passé depuis "maintenant"
 * (feature 005, US1, FR-001). `nombreMoisAvant = 0` retourne le mois
 * courant, identique à `parisAnneeMoisCourant(maintenant)` (FR-002).
 */
export function parisAnneeMoisDecale(maintenant: Date, nombreMoisAvant: number): AnneeMois {
  return decalerAnneeMois(parisAnneeMoisCourant(maintenant), nombreMoisAvant);
}

