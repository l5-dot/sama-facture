/**
 * Utilitaires monétaires.
 *
 * Règle : tous les calculs passent par `round2` pour éviter les dérives de
 * virgule flottante (ex. 0.1 + 0.2). La base stocke en numeric(14,2) et
 * recalcule les totaux de facture : le client ne fait qu'une estimation
 * d'affichage.
 */

/** Arrondi commercial à 2 décimales (demi vers le haut, gère les négatifs). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // + Number.EPSILON relatif pour corriger 1.005 -> 1.01
  return (sign * Math.round((abs + Number.EPSILON * abs) * 100)) / 100;
}

/** Convertit une valeur API (number | string | null) en nombre sûr. */
export function parseAmount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Somme sûre de montants. */
export function sum(values: Array<number | null | undefined>): number {
  return round2(values.reduce<number>((acc, v) => acc + (v ?? 0), 0));
}

/** Montant d'une ligne : quantité × prix unitaire, remise ligne déduite. */
export function lineSubtotal(quantity: number, unitPrice: number, discountPercent = 0): number {
  const gross = round2(quantity * unitPrice);
  return round2(gross * (1 - Math.min(Math.max(discountPercent, 0), 100) / 100));
}

/** TVA d'une ligne. */
export function lineTax(quantity: number, unitPrice: number, discountPercent = 0, taxRate = 0): number {
  return round2(lineSubtotal(quantity, unitPrice, discountPercent) * (taxRate / 100));
}

function groupThousands(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); // espace fine insécable
}

const ZERO_DECIMAL_CURRENCIES = new Set(['XOF', 'XAF', 'GNF', 'JPY', 'CLP', 'KRW', 'VND']);

/**
 * Formate un montant.
 * - XOF/XAF : « 16 000 FCFA » (le franc CFA n'a pas de subdivision usuelle)
 * - autres : 2 décimales.
 */
export function formatMoney(
  amount: number,
  currency = 'XOF',
  options: { withSymbol?: boolean; decimals?: number; signed?: boolean } = {},
): string {
  const { withSymbol = true, signed = false } = options;
  const safe = Number.isFinite(amount) ? amount : 0;
  const isZeroDecimal = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase());
  const decimals = options.decimals ?? (isZeroDecimal ? 0 : 2);
  const rounded = decimals === 0 ? Math.round(safe) : round2(safe);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const formatted = groupThousands(intPart) + (decPart ? `,${decPart}` : '');
  const symbol = currency.toUpperCase() === 'XOF' ? 'FCFA' : currency.toUpperCase();
  const prefix = negative ? '−' : signed && rounded > 0 ? '+' : '';
  return `${prefix}${formatted}${withSymbol ? ` ${symbol}` : ''}`;
}

/** Formate un pourcentage lisible (1 décimale max). */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals).replace('.', ',').replace(/,0$/, '')}\u202f%`;
}

/** Ratio en pourcentage, null si le dénominateur est nul. */
export function ratio(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole === 0) return null;
  return (part / whole) * 100;
}
