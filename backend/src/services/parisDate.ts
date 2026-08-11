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
