import { describe, expect, it } from 'vitest';
import {
  buildCustomPeriod,
  buildPeriod,
  defaultPeriod,
  monthsInPeriod,
  periodIncludesToday,
  previousPeriod,
  shiftPeriod,
} from '../src/lib/period';

const anchor = new Date(2026, 9, 27); // 27 octobre 2026

describe('buildPeriod', () => {
  it('construit un mois complet', () => {
    const period = buildPeriod('month', anchor);
    expect(period.start).toBe('2026-10-01');
    expect(period.end).toBe('2026-10-31');
    expect(period.label).toBe('octobre 2026');
  });

  it('construit un trimestre complet', () => {
    const period = buildPeriod('quarter', anchor);
    expect(period.start).toBe('2026-10-01');
    expect(period.end).toBe('2026-12-31');
    expect(period.label).toBe('T4 2026');
  });

  it('construit une année complète (année bissextile incluse)', () => {
    const period = buildPeriod('year', new Date(2028, 1, 10));
    expect(period.start).toBe('2028-01-01');
    expect(period.end).toBe('2028-12-31');
    expect(period.label).toBe('2028');
  });

  it('gère les mois de 30, 28 et 31 jours', () => {
    expect(buildPeriod('month', new Date(2026, 1, 14)).end).toBe('2026-02-28');
    expect(buildPeriod('month', new Date(2028, 1, 14)).end).toBe('2028-02-29');
    expect(buildPeriod('month', new Date(2026, 3, 14)).end).toBe('2026-04-30');
  });
});

describe('navigation de période', () => {
  it('recule et avance d’un mois', () => {
    const month = buildPeriod('month', anchor);
    expect(shiftPeriod(month, -1).start).toBe('2026-09-01');
    expect(shiftPeriod(month, 1).start).toBe('2026-11-01');
  });

  it('recule d’un trimestre et d’une année', () => {
    const quarter = buildPeriod('quarter', anchor);
    expect(shiftPeriod(quarter, -1).end).toBe('2026-09-30');
    const year = buildPeriod('year', anchor);
    expect(shiftPeriod(year, -1).start).toBe('2025-01-01');
  });

  it('ne modifie pas une période personnalisée', () => {
    const custom = buildCustomPeriod('2026-03-10', '2026-04-02');
    expect(shiftPeriod(custom, -1)).toEqual(custom);
  });
});

describe('période personnalisée', () => {
  it('échange les bornes saisies à l’envers', () => {
    const period = buildCustomPeriod('2026-10-31', '2026-10-01');
    expect(period.start).toBe('2026-10-01');
    expect(period.end).toBe('2026-10-31');
  });

  it('refuse une date invalide', () => {
    expect(() => buildCustomPeriod('2026-13-01', '2026-12-31')).toThrow();
    expect(() => buildCustomPeriod('01/10/2026', '2026-10-31')).toThrow();
  });

  it('inclut les bornes', () => {
    const period = buildCustomPeriod('2026-10-01', '2026-10-31');
    expect(periodIncludesToday(period, '2026-10-01')).toBe(true);
    expect(periodIncludesToday(period, '2026-10-31')).toBe(true);
    expect(periodIncludesToday(period, '2026-11-01')).toBe(false);
  });

  it('calcule une période précédente de même durée', () => {
    const previous = previousPeriod(buildCustomPeriod('2026-10-10', '2026-10-19'));
    expect(previous.start).toBe('2026-09-30');
    expect(previous.end).toBe('2026-10-09');
  });
});

describe('monthsInPeriod', () => {
  it('découpe un trimestre en trois mois', () => {
    const months = monthsInPeriod(buildPeriod('quarter', anchor));
    expect(months.map((month) => month.key)).toEqual(['2026-10', '2026-11', '2026-12']);
  });

  it('découpe une période sur deux années', () => {
    const months = monthsInPeriod(buildCustomPeriod('2025-11-15', '2026-02-10'));
    expect(months.map((month) => month.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('retourne un seul mois pour une période intra-mois', () => {
    expect(monthsInPeriod(buildCustomPeriod('2026-10-03', '2026-10-09'))).toHaveLength(1);
  });
});

describe('defaultPeriod', () => {
  it('utilise le mois courant', () => {
    const period = defaultPeriod('2026-10-27');
    expect(period.start).toBe('2026-10-01');
    expect(period.end).toBe('2026-10-31');
  });
});
