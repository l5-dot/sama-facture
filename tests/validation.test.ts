import { describe, expect, it } from 'vitest';
import {
  emptyExpenseForm,
  emptyPurchaseForm,
  toPurchasePayload,
  validateCustomPeriod,
  validateExpense,
  validatePaymentAmount,
  validatePurchase,
} from '../src/lib/validation';
import { todayISO } from '../src/lib/dates';

const validPurchase = {
  ...emptyPurchaseForm('2026-10-10'),
  supplierName: '  Marché   Sandaga ',
  description: ' Lot de 20 t-shirts ',
  quantity: '20',
  unitPrice: '4500',
  amountPaid: '60000',
  paymentMethod: 'especes' as const,
};

describe('validation des achats', () => {
  it('accepte un achat valide et calcule total et reste', () => {
    const result = validatePurchase(validPurchase);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalAmount).toBe(90000);
    expect(result.value.amountDue).toBe(30000);
    expect(result.value.supplierName).toBe('Marché Sandaga');
    expect(result.value.description).toBe('Lot de 20 t-shirts');
    expect(result.value.paymentMethod).toBe('especes');
  });

  it('refuse un montant payé supérieur au total', () => {
    const result = validatePurchase({ ...validPurchase, amountPaid: '90001' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.amountPaid).toContain('dépasse');
  });

  it('refuse une quantité nulle ou négative', () => {
    const zero = validatePurchase({ ...validPurchase, quantity: '0' });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.errors.quantity).toBeDefined();

    const negative = validatePurchase({ ...validPurchase, quantity: '-3' });
    expect(negative.ok).toBe(false);
  });

  it('refuse une description vide', () => {
    const result = validatePurchase({ ...validPurchase, description: '   ' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.description).toBeDefined();
  });

  it('refuse une date future ou invalide', () => {
    const future = new Date();
    future.setDate(future.getDate() + 2);
    const futureISO = future.toISOString().slice(0, 10);
    const result = validatePurchase({ ...validPurchase, purchaseDate: futureISO });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.purchaseDate).toContain('futur');

    const invalid = validatePurchase({ ...validPurchase, purchaseDate: '10/10/2026' });
    expect(invalid.ok).toBe(false);
  });

  it('refuse un montant payé négatif', () => {
    const result = validatePurchase({ ...validPurchase, amountPaid: '-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.amountPaid).toBeDefined();
  });

  it('accepte une quantité décimale et calcule au centime', () => {
    const result = validatePurchase({ ...validPurchase, quantity: '2.5', unitPrice: '1250', amountPaid: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.totalAmount).toBe(3125);
    expect(result.value.amountDue).toBe(3125);
    expect(result.value.amountPaid).toBe(0);
  });

  it('normalise les champs facultatifs vides en null', () => {
    const result = validatePurchase({ ...validPurchase, supplierName: '  ', notes: '', paymentMethod: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supplierName).toBeNull();
    expect(result.value.notes).toBeNull();
    expect(result.value.paymentMethod).toBeNull();
  });

  it('produit un payload sans champ calculé', () => {
    const result = validatePurchase(validPurchase);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const payload = toPurchasePayload(result.value) as Record<string, unknown>;
    expect(payload.total_amount).toBeUndefined();
    expect(payload.totalAmount).toBeUndefined();
    expect(payload.amountDue).toBeUndefined();
    expect(payload.quantity).toBe(20);
    expect(payload.amountPaid).toBe(60000);
  });

  it('refuse une catégorie inconnue', () => {
    const result = validatePurchase({ ...validPurchase, category: 'inconnue' as never });
    expect(result.ok).toBe(false);
  });

  it('accepte la date du jour', () => {
    const result = validatePurchase({ ...validPurchase, purchaseDate: todayISO() });
    expect(result.ok).toBe(true);
  });
});

describe('validation des dépenses', () => {
  const base = { ...emptyExpenseForm('2026-10-10'), description: 'Loyer', amount: '75000' };

  it('accepte une dépense valide', () => {
    const result = validateExpense(base);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount).toBe(75000);
    expect(result.value.category).toBe('transport');
  });

  it('refuse un montant nul ou négatif', () => {
    expect(validateExpense({ ...base, amount: '0' }).ok).toBe(false);
    expect(validateExpense({ ...base, amount: '-500' }).ok).toBe(false);
  });

  it('refuse une description vide et une date future', () => {
    expect(validateExpense({ ...base, description: '' }).ok).toBe(false);
    const future = new Date();
    future.setDate(future.getDate() + 1);
    expect(validateExpense({ ...base, expenseDate: future.toISOString().slice(0, 10) }).ok).toBe(false);
  });

  it('nettoie la référence et les notes', () => {
    const result = validateExpense({ ...base, reference: '  LOY-1026 ', notes: '  ' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reference).toBe('LOY-1026');
    expect(result.value.notes).toBeNull();
  });
});

describe('paiements et périodes', () => {
  it('refuse un paiement supérieur au reste dû', () => {
    expect(validatePaymentAmount(15001, 15000)).toContain('dépasse');
    expect(validatePaymentAmount(15000, 15000)).toBeNull();
    expect(validatePaymentAmount(0, 15000)).not.toBeNull();
    expect(validatePaymentAmount(-100, 15000)).not.toBeNull();
  });

  it('valide une période personnalisée cohérente', () => {
    expect(validateCustomPeriod('2026-10-01', '2026-10-31')).toBeNull();
    expect(validateCustomPeriod('2026-10-31', '2026-10-01')).toContain('précéder');
    expect(validateCustomPeriod('2026-10-01', '2026-13-01')).toContain('valides');
    expect(validateCustomPeriod('', '')).toContain('valides');
  });
});
