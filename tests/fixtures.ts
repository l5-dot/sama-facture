import type { Period } from '../src/lib/period';
import type {
  Expense,
  Invoice,
  InvoiceStatus,
  Payment,
  Purchase,
  PurchaseCategory,
} from '../src/lib/types';

export const ORG = 'org-test';

export const OCT_2026: Period = {
  preset: 'custom',
  start: '2026-10-01',
  end: '2026-10-31',
  label: 'Octobre 2026',
};

export const SEPT_2026: Period = {
  preset: 'custom',
  start: '2026-09-01',
  end: '2026-09-30',
  label: 'Septembre 2026',
};

let invoiceCounter = 0;

export function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  invoiceCounter += 1;
  const netHt = overrides.netHt ?? 100000;
  const taxTotal = overrides.taxTotal ?? 0;
  const totalTtc = overrides.totalTtc ?? netHt + taxTotal;
  const amountPaid = overrides.amountPaid ?? 0;
  return {
    id: `inv-${invoiceCounter}`,
    organizationId: ORG,
    clientId: 'cli-1',
    clientName: 'Client Test',
    number: `FACT-${String(invoiceCounter).padStart(4, '0')}`,
    kind: 'invoice',
    status: 'sent' as InvoiceStatus,
    issueDate: '2026-10-05',
    dueDate: '2026-11-05',
    currency: 'XOF',
    notes: null,
    discountType: 'none',
    discountValue: 0,
    subtotalHt: netHt,
    discountTotal: 0,
    netHt,
    taxTotal,
    totalTtc,
    amountPaid,
    amountDue: Math.max(totalTtc - amountPaid, 0),
    items: [],
    ...overrides,
  };
}

let paymentCounter = 0;
export function makePayment(overrides: Partial<Payment> = {}): Payment {
  paymentCounter += 1;
  return {
    id: `pay-${paymentCounter}`,
    organizationId: ORG,
    invoiceId: 'inv-1',
    invoiceNumber: 'FACT-0001',
    clientName: 'Client Test',
    amount: 10000,
    method: 'wave',
    paidAt: '2026-10-10',
    reference: null,
    notes: null,
    ...overrides,
  };
}

let purchaseCounter = 0;
export function makePurchase(overrides: Partial<Purchase> = {}): Purchase {
  purchaseCounter += 1;
  const quantity = overrides.quantity ?? 1;
  const unitPrice = overrides.unitPrice ?? 10000;
  const totalAmount = overrides.totalAmount ?? Math.round(quantity * unitPrice * 100) / 100;
  const amountPaid = overrides.amountPaid ?? 0;
  const category: PurchaseCategory = overrides.category ?? 'marchandises';
  const base: Purchase = {
    id: `pur-${purchaseCounter}`,
    organizationId: ORG,
    supplierName: 'Fournisseur Test',
    supplierInvoiceNumber: null,
    purchaseDate: '2026-10-10',
    description: 'Achat test',
    category,
    quantity,
    unitPrice,
    totalAmount,
    amountPaid,
    amountDue: overrides.amountDue ?? Math.round((totalAmount - amountPaid) * 100) / 100,
    isCogs: overrides.isCogs ?? (category === 'marchandises' || category === 'matieres_premieres'),
    isCapex: overrides.isCapex ?? category === 'equipement',
    paymentMethod: 'especes',
    notes: null,
  };
  return { ...base, ...overrides, totalAmount, amountDue: overrides.amountDue ?? Math.round((totalAmount - amountPaid) * 100) / 100 };
}

let expenseCounter = 0;
export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  expenseCounter += 1;
  return {
    id: `exp-${expenseCounter}`,
    organizationId: ORG,
    expenseDate: '2026-10-01',
    category: 'loyer',
    description: 'Loyer test',
    amount: 50000,
    reference: null,
    notes: null,
    ...overrides,
  };
}

/**
 * Jeu de données de référence pour les tests de calcul (octobre 2026).
 * Les montants sont volontairement variés : payé, partiel, impayé, avoir,
 * brouillon, annulée, TVA, remise, achats partiels, investissement.
 */
export function octoberDataset() {
  const invoices: Invoice[] = [
    makeInvoice({
      id: 'inv-paid',
      number: 'FACT-0001',
      status: 'paid',
      issueDate: '2026-10-03',
      netHt: 35000,
      totalTtc: 35000,
      amountPaid: 35000,
      amountDue: 0,
    }),
    makeInvoice({
      id: 'inv-partial',
      number: 'FACT-0002',
      status: 'partial',
      issueDate: '2026-10-09',
      netHt: 25000,
      totalTtc: 25000,
      amountPaid: 10000,
      amountDue: 15000,
    }),
    makeInvoice({
      id: 'inv-taxed',
      number: 'FACT-0003',
      status: 'sent',
      issueDate: '2026-10-17',
      netHt: 76000,
      taxTotal: 13680,
      totalTtc: 89680,
      discountType: 'percent',
      discountValue: 5,
      subtotalHt: 80000,
      discountTotal: 4000,
    }),
    makeInvoice({
      id: 'inv-draft',
      number: 'FACT-0004',
      status: 'draft',
      issueDate: '2026-10-24',
      netHt: 24000,
      totalTtc: 24000,
    }),
    makeInvoice({
      id: 'inv-cancelled',
      number: 'FACT-0005',
      status: 'cancelled',
      issueDate: '2026-10-19',
      netHt: 3000,
      totalTtc: 3000,
    }),
    makeInvoice({
      id: 'inv-credit',
      number: 'AV-0001',
      kind: 'credit_note',
      status: 'sent',
      issueDate: '2026-10-22',
      netHt: 8000,
      totalTtc: 8000,
    }),
    makeInvoice({
      id: 'inv-prior',
      number: 'FACT-0099',
      status: 'partial',
      issueDate: '2026-09-20',
      netHt: 95000,
      totalTtc: 95000,
      amountPaid: 40000,
      amountDue: 55000,
    }),
  ];

  const payments: Payment[] = [
    makePayment({ id: 'pay-1', invoiceId: 'inv-paid', amount: 35000, paidAt: '2026-10-05' }),
    makePayment({
      id: 'pay-2',
      invoiceId: 'inv-partial',
      invoiceNumber: 'FACT-0002',
      amount: 10000,
      paidAt: '2026-10-11',
    }),
    // Règlement d'une facture de septembre : trésorerie d'octobre, hors CA d'octobre.
    makePayment({
      id: 'pay-3',
      invoiceId: 'inv-prior',
      invoiceNumber: 'FACT-0099',
      amount: 40000,
      paidAt: '2026-10-14',
    }),
    // Hors période.
    makePayment({
      id: 'pay-4',
      invoiceId: 'inv-partial',
      invoiceNumber: 'FACT-0002',
      amount: 5000,
      paidAt: '2026-11-02',
    }),
  ];

  const purchases: Purchase[] = [
    makePurchase({
      id: 'pur-goods',
      category: 'marchandises',
      quantity: 20,
      unitPrice: 4500,
      amountPaid: 60000,
      purchaseDate: '2026-10-07',
    }),
    makePurchase({
      id: 'pur-supplies',
      category: 'fournitures',
      quantity: 10,
      unitPrice: 1500,
      amountPaid: 15000,
      purchaseDate: '2026-10-15',
    }),
    makePurchase({
      id: 'pur-capex',
      category: 'equipement',
      quantity: 1,
      unitPrice: 250000,
      amountPaid: 100000,
      purchaseDate: '2026-10-21',
    }),
    makePurchase({
      id: 'pur-november',
      category: 'marchandises',
      quantity: 5,
      unitPrice: 1000,
      amountPaid: 5000,
      purchaseDate: '2026-11-02',
    }),
  ];

  const expenses: Expense[] = [
    makeExpense({ id: 'exp-rent', category: 'loyer', amount: 75000, expenseDate: '2026-10-01' }),
    makeExpense({ id: 'exp-salaries', category: 'salaires', amount: 150000, expenseDate: '2026-10-30' }),
    makeExpense({ id: 'exp-november', category: 'transport', amount: 10000, expenseDate: '2026-11-01' }),
  ];

  return { invoices, payments, purchases, expenses };
}

export const OCTOBER_EXPECTED = {
  invoicedHt: 128000,
  invoicedTax: 13680,
  invoicedTtc: 141680,
  creditedHt: 8000,
  paidOnIssued: 45000,
  outstanding: 104680,
  cashIn: 85000,
  purchasesTotal: 355000,
  purchasesPaid: 175000,
  purchasesDue: 180000,
  cogsTotal: 90000,
  operatingPurchasesTotal: 15000,
  capexTotal: 250000,
  expensesTotal: 225000,
  cashOut: 400000,
  netCash: -315000,
  costsTotal: 330000,
  grossMargin: 38000,
  estimatedResult: -202000,
  draftCount: 1,
  draftTtc: 24000,
  cancelledCount: 1,
  cancelledTtc: 3000,
} as const;
