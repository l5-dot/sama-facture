import { describe, expect, it } from 'vitest';
import { formatMoney, formatPercent, lineSubtotal, lineTax, parseAmount, ratio, round2, sum } from '../src/lib/money';

const NBSP = '\u202f';

describe('round2', () => {
  it('arrondit au centime sans dérive flottante', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(Number.NaN)).toBe(0);
  });

  it('conserve les entiers FCFA', () => {
    expect(round2(35000)).toBe(35000);
  });
});

describe('parseAmount', () => {
  it('accepte les chaînes renvoyées par PostgREST (numeric)', () => {
    expect(parseAmount('12500.00')).toBe(12500);
    expect(parseAmount('0.00')).toBe(0);
    expect(parseAmount('12,5')).toBe(12.5);
  });

  it('traite null, undefined et texte invalide comme zéro', () => {
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
  });
});

describe('sum / lignes', () => {
  it('additionne des montants arrondis', () => {
    expect(sum([0.1, 0.2])).toBe(0.3);
    expect(sum([])).toBe(0);
    expect(sum([1000, null, undefined, 2500])).toBe(3500);
  });

  it('calcule une ligne avec remise et TVA', () => {
    expect(lineSubtotal(2, 8000)).toBe(16000);
    expect(lineSubtotal(2, 8000, 10)).toBe(14400);
    expect(lineTax(2, 8000, 10, 18)).toBe(2592);
  });
});

describe('formatMoney', () => {
  it('affiche le FCFA sans décimale et avec espaces fines', () => {
    expect(formatMoney(35000, 'XOF')).toBe(`35${NBSP}000 FCFA`);
    expect(formatMoney(1234.6, 'XOF')).toBe(`1${NBSP}235 FCFA`);
    expect(formatMoney(0, 'XOF')).toBe('0 FCFA');
  });

  it('gère les montants négatifs et le signe explicite', () => {
    expect(formatMoney(-35000, 'XOF')).toBe(`−35${NBSP}000 FCFA`);
    expect(formatMoney(35000, 'XOF', { signed: true })).toBe(`+35${NBSP}000 FCFA`);
  });

  it('affiche deux décimales pour les autres devises', () => {
    expect(formatMoney(1234.5, 'EUR')).toBe(`1${NBSP}234,50 EUR`);
    expect(formatMoney(1234.5, 'EUR', { withSymbol: false })).toBe(`1${NBSP}234,50`);
  });

  it('supporte les montants non finis sans casser l’affichage', () => {
    expect(formatMoney(Number.NaN, 'XOF')).toBe('0 FCFA');
  });
});

describe('formatPercent / ratio', () => {
  it('formate un pourcentage lisible', () => {
    expect(formatPercent(29.69)).toBe('29,7\u202f%');
    expect(formatPercent(0)).toBe('0\u202f%');
    expect(formatPercent(Number.NaN)).toBe('—');
  });

  it('retourne null si le dénominateur est nul', () => {
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(10, 40)).toBe(25);
  });
});
