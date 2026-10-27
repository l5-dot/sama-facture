/**
 * Validation des saisies financières.
 *
 * Les mêmes règles existent en base (CHECK, triggers). Cette couche évite les
 * allers-retours inutiles et fournit des messages en français ; elle ne
 * constitue jamais la seule protection.
 */

import { EXPENSE_CATEGORY_ORDER, PURCHASE_CATEGORY_ORDER, PURCHASE_PAYMENT_METHOD_ORDER } from './constants';
import { isValidISODate, todayISO } from './dates';
import { parseAmount, round2 } from './money';
import type {
  ExpenseCategory,
  PaymentMethod,
  PurchaseCategory,
  PurchaseInput,
} from './types';

export type FieldErrors<T extends string = string> = Partial<Record<T, string>>;

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isPositiveNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export interface PurchaseFormValues {
  supplierName: string;
  supplierInvoiceNumber: string;
  purchaseDate: string;
  description: string;
  category: PurchaseCategory;
  quantity: string;
  unitPrice: string;
  amountPaid: string;
  paymentMethod: PaymentMethod | '';
  notes: string;
}

export function emptyPurchaseForm(purchaseDate = todayISO()): PurchaseFormValues {
  return {
    supplierName: '',
    supplierInvoiceNumber: '',
    purchaseDate,
    description: '',
    category: 'marchandises',
    quantity: '1',
    unitPrice: '',
    amountPaid: '',
    paymentMethod: '',
    notes: '',
  };
}

export interface NormalizedPurchase {
  supplierName: string | null;
  supplierInvoiceNumber: string | null;
  purchaseDate: string;
  description: string;
  category: PurchaseCategory;
  quantity: number;
  unitPrice: number;
  amountPaid: number;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  totalAmount: number;
  amountDue: number;
}

/**
 * Valide et normalise un achat. Le total et le reste à payer sont TOUJOURS
 * recalculés à partir de la quantité et du prix unitaire, jamais repris d'un
 * champ « montant total » envoyé par le navigateur.
 */
export function validatePurchase(
  values: PurchaseFormValues,
): { ok: true; value: NormalizedPurchase } | { ok: false; errors: FieldErrors<keyof PurchaseFormValues | 'form'> } {
  const errors: FieldErrors<keyof PurchaseFormValues | 'form'> = {};

  const description = cleanText(values.description, 500);
  if (!description) errors.description = 'La description est obligatoire.';
  if (!isValidISODate(values.purchaseDate)) errors.purchaseDate = 'Date d’achat invalide.';
  else if (values.purchaseDate > todayISO()) errors.purchaseDate = 'La date ne peut pas être dans le futur.';

  if (!PURCHASE_CATEGORY_ORDER.includes(values.category)) {
    errors.category = 'Catégorie d’achat inconnue.';
  }
  if (values.paymentMethod && !PURCHASE_PAYMENT_METHOD_ORDER.includes(values.paymentMethod)) {
    errors.paymentMethod = 'Mode de paiement inconnu.';
  }

  const quantity = parseAmount(values.quantity);
  if (!isPositiveNumber(quantity)) errors.quantity = 'La quantité doit être supérieure à 0.';
  else if (quantity > 1_000_000) errors.quantity = 'Quantité invraisemblable.';

  const unitPrice = parseAmount(values.unitPrice);
  if (!isPositiveNumber(unitPrice) && unitPrice !== 0) errors.unitPrice = 'Le prix unitaire doit être positif.';
  if (unitPrice > 10_000_000_000) errors.unitPrice = 'Prix unitaire invraisemblable.';

  const amountPaid = values.amountPaid.trim() === '' ? 0 : parseAmount(values.amountPaid);
  if (amountPaid < 0) errors.amountPaid = 'Le montant payé ne peut pas être négatif.';

  const totalAmount = round2(quantity * unitPrice);
  if (!errors.amountPaid && amountPaid > totalAmount + 0.005) {
    errors.amountPaid = 'Le montant payé dépasse le total de l’achat.';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      supplierName: cleanText(values.supplierName, 160),
      supplierInvoiceNumber: cleanText(values.supplierInvoiceNumber, 80),
      purchaseDate: values.purchaseDate,
      description: description as string,
      category: values.category,
      quantity,
      unitPrice,
      amountPaid: round2(amountPaid),
      paymentMethod: values.paymentMethod || null,
      notes: cleanText(values.notes, 1000),
      totalAmount,
      amountDue: round2(totalAmount - amountPaid),
    },
  };
}

export interface ExpenseFormValues {
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: string;
  reference: string;
  notes: string;
}

export function emptyExpenseForm(expenseDate = todayISO()): ExpenseFormValues {
  return {
    expenseDate,
    category: 'transport',
    description: '',
    amount: '',
    reference: '',
    notes: '',
  };
}

export interface NormalizedExpense {
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  reference: string | null;
  notes: string | null;
}

export function validateExpense(
  values: ExpenseFormValues,
): { ok: true; value: NormalizedExpense } | { ok: false; errors: FieldErrors<keyof ExpenseFormValues | 'form'> } {
  const errors: FieldErrors<keyof ExpenseFormValues | 'form'> = {};

  const description = cleanText(values.description, 500);
  if (!description) errors.description = 'La description est obligatoire.';

  if (!isValidISODate(values.expenseDate)) errors.expenseDate = 'Date de dépense invalide.';
  else if (values.expenseDate > todayISO()) errors.expenseDate = 'La date ne peut pas être dans le futur.';

  if (!EXPENSE_CATEGORY_ORDER.includes(values.category)) {
    errors.category = 'Catégorie de dépense inconnue.';
  }

  const amount = parseAmount(values.amount);
  if (!isPositiveNumber(amount)) errors.amount = 'Le montant doit être strictement positif.';
  else if (amount > 10_000_000_000) errors.amount = 'Montant invraisemblable.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      expenseDate: values.expenseDate,
      category: values.category,
      description: description as string,
      amount: round2(amount),
      reference: cleanText(values.reference, 80),
      notes: cleanText(values.notes, 1000),
    },
  };
}

/** Adapte un achat validé au format d'insertion (sans champs calculés). */
export function toPurchasePayload(
  purchase: NormalizedPurchase,
): Omit<PurchaseInput, 'totalAmount' | 'amountDue' | 'isCogs' | 'isCapex'> {
  return {
    supplierName: purchase.supplierName,
    supplierInvoiceNumber: purchase.supplierInvoiceNumber,
    purchaseDate: purchase.purchaseDate,
    description: purchase.description,
    category: purchase.category,
    quantity: purchase.quantity,
    unitPrice: purchase.unitPrice,
    amountPaid: purchase.amountPaid,
    paymentMethod: purchase.paymentMethod,
    notes: purchase.notes,
  };
}

/** Garde-fou sur le montant encaissable d'une facture. */
export function validatePaymentAmount(amount: number, amountDue: number): string | null {
  if (!isPositiveNumber(amount)) return 'Le montant doit être strictement positif.';
  if (round2(amount) > round2(amountDue) + 0.005) return 'Le montant dépasse le reste à payer.';
  return null;
}

/** Garde-fou sur une période personnalisée. */
export function validateCustomPeriod(start: string, end: string): string | null {
  if (!isValidISODate(start) || !isValidISODate(end)) return 'Renseignez deux dates valides.';
  if (start > end) return 'La date de début doit précéder la date de fin.';
  return null;
}
