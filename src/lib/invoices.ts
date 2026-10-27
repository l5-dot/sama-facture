/**
 * Calculs de facture partagés par l'aperçu (navigateur) et le mode démo.
 * En production, PostgreSQL refait ces calculs dans `recalculate_invoice()` :
 * les valeurs envoyées par le navigateur ne sont jamais utilisées comme
 * source de vérité.
 *
 * Convention de remise :
 *   - remise de ligne : pourcentage appliqué au brut de la ligne ;
 *   - remise globale : répartie au prorata des lignes, la TVA est calculée sur
 *     le net après remise (on ne taxe pas un montant qui n'est pas facturé).
 */

import { round2, sum } from './money';
import type { InvoiceItem, InvoiceStatus } from './types';

export interface InvoiceComputation {
  items: Array<InvoiceItem & { lineSubtotalHt: number }>;
  subtotalHt: number;
  discountTotal: number;
  netHt: number;
  taxTotal: number;
  totalTtc: number;
}

export function computeInvoiceTotals(
  items: InvoiceItem[],
  discountType: 'none' | 'percent' | 'fixed',
  discountValue: number,
): InvoiceComputation {
  const computedItems = items.map((item) => {
    const gross = round2(item.quantity * item.unitPrice);
    const subtotal = round2(gross * (1 - clamp(item.discountPercent, 0, 100) / 100));
    return { ...item, lineSubtotalHt: subtotal };
  });

  const subtotalHt = sum(computedItems.map((item) => item.lineSubtotalHt));

  const discountTotal =
    discountType === 'percent'
      ? round2((subtotalHt * clamp(discountValue, 0, 100)) / 100)
      : discountType === 'fixed'
        ? round2(Math.min(Math.max(discountValue, 0), subtotalHt))
        : 0;

  const taxTotal = sum(
    computedItems.map((item) => {
      const discountedLine =
        subtotalHt > 0 ? round2(item.lineSubtotalHt - (discountTotal * item.lineSubtotalHt) / subtotalHt) : 0;
      return round2((discountedLine * clamp(item.taxRate, 0, 100)) / 100);
    }),
  );

  const netHt = round2(subtotalHt - discountTotal);

  return {
    items: computedItems,
    subtotalHt,
    discountTotal,
    netHt,
    taxTotal,
    totalTtc: round2(netHt + taxTotal),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Statut déduit des paiements, utilisé en mode démo et pour l'aperçu.
 * Les statuts draft et cancelled ne sont jamais écrasés par un paiement.
 */
export function statusFromPayments(
  currentStatus: InvoiceStatus,
  totalTtc: number,
  amountPaid: number,
): InvoiceStatus {
  if (currentStatus === 'draft' || currentStatus === 'cancelled') return currentStatus;
  if (amountPaid <= 0) return 'sent';
  return amountPaid >= totalTtc - 0.005 ? 'paid' : 'partial';
}

/** Numérotation lisible : FACT-0001, AV-0001. */
export function formatDocumentNumber(kind: 'invoice' | 'credit_note', value: number): string {
  return `${kind === 'invoice' ? 'FACT' : 'AV'}-${String(value).padStart(4, '0')}`;
}

/** Ajoute 30 jours à une date ISO (échéance par défaut). */
export function defaultDueDate(issueDate: string, days = 30): string {
  const [y, m, d] = issueDate.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
