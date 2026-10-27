/**
 * Dates métier au format ISO `YYYY-MM-DD` (sans heure).
 *
 * On évite volontairement `Date.toISOString()` pour les dates calendaires :
 * une date saisie à Dakar (UTC+0) reste identique, mais un navigateur à
 * UTC+2 verrait la date reculer d'un jour. Les helpers ci-dessous travaillent
 * en composants locaux et formatent manuellement.
 */

export type ISODate = string;

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse `YYYY-MM-DD` en Date locale (minuit local), sans dérive de fuseau. */
export function parseISODate(value: ISODate): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Date invalide : ${value}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseISODate(value);
  return toISODate(date) === value;
}

export function todayISO(): ISODate {
  return toISODate(new Date());
}

export function startOfMonth(date: Date): ISODate {
  return toISODate(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonth(date: Date): ISODate {
  return toISODate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function startOfQuarter(date: Date): ISODate {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return toISODate(new Date(date.getFullYear(), quarterStartMonth, 1));
}

export function endOfQuarter(date: Date): ISODate {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3;
  return toISODate(new Date(date.getFullYear(), quarterStartMonth + 3, 0));
}

export function startOfYear(date: Date): ISODate {
  return toISODate(new Date(date.getFullYear(), 0, 1));
}

export function endOfYear(date: Date): ISODate {
  return toISODate(new Date(date.getFullYear(), 11, 31));
}

export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

export function addYears(date: Date, years: number): Date {
  return new Date(date.getFullYear() + years, date.getMonth(), 1);
}

/** La date est-elle dans l'intervalle [start, end] (bornes incluses) ? */
export function isBetween(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** Nombre de jours entre deux dates ISO (end - start). */
export function daysBetween(start: ISODate, end: ISODate): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime();
  return Math.round(ms / 86_400_000);
}

const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

export function monthShort(index: number): string {
  return MONTHS_SHORT[index] ?? '';
}

export function monthLong(index: number): string {
  return MONTHS_LONG[index] ?? '';
}

/** 02/09/2026 */
export function formatDateFR(value: ISODate | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

/** « 2 oct. 2026 » */
export function formatDateShort(value: ISODate): string {
  const date = parseISODate(value);
  return `${date.getDate()} ${monthShort(date.getMonth())} ${date.getFullYear()}`;
}
