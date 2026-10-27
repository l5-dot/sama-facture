/**
 * Périodes d'analyse financière : mois, trimestre, année, personnalisée.
 * Toutes les bornes sont inclusives et exprimées en `YYYY-MM-DD`.
 */

import {
  addMonths,
  addYears,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  formatDateShort,
  isValidISODate,
  monthLong,
  parseISODate,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  todayISO,
  type ISODate,
} from './dates';

export type PeriodPreset = 'month' | 'quarter' | 'year' | 'custom';

export interface Period {
  preset: PeriodPreset;
  start: ISODate;
  end: ISODate;
  label: string;
}

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  month: 'Mois',
  quarter: 'Trimestre',
  year: 'Année',
  custom: 'Personnalisée',
};

function quarterOf(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Construit une période à partir d'une date d'ancrage.
 * Le jour d'ancrage est ignoré : la période est toujours entière.
 */
export function buildPeriod(preset: Exclude<PeriodPreset, 'custom'>, anchor: Date = new Date()): Period {
  switch (preset) {
    case 'month':
      return {
        preset,
        start: startOfMonth(anchor),
        end: endOfMonth(anchor),
        label: `${monthLong(anchor.getMonth())} ${anchor.getFullYear()}`,
      };
    case 'quarter':
      return {
        preset,
        start: startOfQuarter(anchor),
        end: endOfQuarter(anchor),
        label: `T${quarterOf(anchor)} ${anchor.getFullYear()}`,
      };
    case 'year':
      return {
        preset,
        start: startOfYear(anchor),
        end: endOfYear(anchor),
        label: `${anchor.getFullYear()}`,
      };
  }
}

/** Période personnalisée, bornes réordonnées si l'utilisateur inverse. */
export function buildCustomPeriod(start: ISODate, end: ISODate): Period {
  if (!isValidISODate(start) || !isValidISODate(end)) {
    throw new Error('Période personnalisée invalide : utiliser le format AAAA-MM-JJ.');
  }
  const [from, to] = start <= end ? [start, end] : [end, start];
  return {
    preset: 'custom',
    start: from,
    end: to,
    label: `${formatDateShort(from)} – ${formatDateShort(to)}`,
  };
}

/** Période par défaut : mois en cours. */
export function defaultPeriod(today: ISODate = todayISO()): Period {
  return buildPeriod('month', parseISODate(today));
}

/** Décale une période d'un cran (mois/trimestre/année). Sans effet si personnalisée. */
export function shiftPeriod(period: Period, direction: 1 | -1): Period {
  if (period.preset === 'custom') return period;
  const anchor = parseISODate(period.start);
  if (period.preset === 'month') return buildPeriod('month', addMonths(anchor, direction));
  if (period.preset === 'quarter') return buildPeriod('quarter', addMonths(anchor, direction * 3));
  return buildPeriod('year', addYears(anchor, direction));
}

/** Le jour courant est-il dans la période ? */
export function periodIncludesToday(period: Period, today: ISODate = todayISO()): boolean {
  return today >= period.start && today <= period.end;
}

/** Liste des mois (index 0-11 + année) couverts par la période, utile aux graphiques. */
export function monthsInPeriod(period: Period): Array<{ year: number; month: number; key: string; label: string }> {
  const start = parseISODate(period.start);
  const end = parseISODate(period.end);
  const months: Array<{ year: number; month: number; key: string; label: string }> = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  let guard = 0;
  while (cursor <= last && guard < 240) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    months.push({
      year,
      month,
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: `${monthLong(month).slice(0, 3)} ${String(year).slice(2)}`,
    });
    cursor = addMonths(cursor, 1);
    guard += 1;
  }
  return months;
}

/** Période précédente de même durée (comparaisons). */
export function previousPeriod(period: Period): Period {
  if (period.preset !== 'custom') return shiftPeriod(period, -1);
  const start = parseISODate(period.start);
  const end = parseISODate(period.end);
  const span = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  const prevEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  const prevStart = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() - span + 1);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return buildCustomPeriod(iso(prevStart), iso(prevEnd));
}
