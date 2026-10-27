/**
 * =============================================================================
 * MOTEUR DE CALCUL FINANCIER — Sama Facture
 * =============================================================================
 *
 * Ce module est volontairement pur (aucune dépendance à React ni à Supabase) :
 * il est identique en mode démonstration et en production, et couvert par des
 * tests. En production, `finance_summary()` en base applique les mêmes règles
 * sur les données faisant autorité ; le moteur sert à l'affichage détaillé, aux
 * graphiques et à la vérification croisée.
 *
 * -----------------------------------------------------------------------------
 * DÉFINITIONS ET FORMULES
 * -----------------------------------------------------------------------------
 *
 * 1. FACTURES PRISES EN COMPTE DANS LE CHIFFRE D'AFFAIRES
 *    Statuts confirmés : sent (émise), partial (partiellement payée), paid.
 *    Exclus : draft (brouillon) et cancelled (annulée).
 *    Un avoir (kind = credit_note), s'il est confirmé, vient en déduction.
 *
 *      CA net HT      = Σ net_ht(factures confirmées) − Σ net_ht(avoirs confirmés)
 *      TVA collectée  = Σ tax_total(factures) − Σ tax_total(avoirs)
 *      CA net TTC     = Σ total_ttc(factures) − Σ total_ttc(avoirs)
 *
 *    `net_ht` est déjà net des remises de ligne ET de la remise globale : le
 *    serveur répartit la remise globale au prorata et calcule la TVA sur le net.
 *    On n'additionne donc jamais `subtotal_ht` et `discount_total` à la main,
 *    ce qui éviterait les doubles comptages.
 *
 * 2. ENCAISSEMENTS
 *    Deux notions distinctes, jamais additionnées entre elles :
 *      • encaissé sur les factures de la période = Σ amount_paid des factures
 *        confirmées émises dans la période (vision « facture ») ;
 *      • trésorerie encaissée = Σ paiements dont la date de paiement tombe dans
 *        la période (vision « caisse », quel que soit le mois de la facture).
 *    Le tableau de bord affiche la seconde comme « montant encaissé » et la
 *    première comme « déjà réglé sur ces factures ».
 *
 * 3. RESTE À RECEVOIR
 *      = Σ max(total_ttc − amount_paid, 0) des factures confirmées de la période.
 *    Les avoirs ne créent pas de créance et sont exclus.
 *
 * 4. ACHATS
 *      total achat = quantité × prix unitaire (recalculé, jamais fourni par le
 *      navigateur en production).
 *      reste à payer = total − montant payé.
 *      Les achats de catégorie marchandises / matières premières alimentent le
 *      COGS (approche simplifiée : achats de la période, pas de valorisation de
 *      stock). Fournitures, services et « autre » sont des charges
 *      d'exploitation. Les équipements (capex) sont exclus du résultat estimé.
 *
 * 5. TRÉSORERIE NETTE
 *      = trésorerie encaissée − (achats payés + dépenses payées)
 *    Ce n'est PAS un bénéfice : un achat à crédit n'apparaît pas ici, un
 *    encaissement d'une facture de l'an dernier peut y apparaître.
 *
 * 6. MARGE BRUTE
 *      = CA net HT − COGS, uniquement si au moins un achat COGS existe sur la
 *      période ; sinon `null` (donnée indisponible, pas zéro).
 *
 * 7. RÉSULTAT ESTIMÉ
 *      = CA net HT − COGS − achats d'exploitation − dépenses
 *    Les équipements (capex) sont exclus. Il s'agit d'une estimation de
 *    gestion, jamais d'un résultat comptable certifié.
 *
 * 8. QUALITÉ DE L'ESTIMATION
 *      • « Données insuffisantes » : aucune facture confirmée ni mouvement.
 *      • « Estimation partielle » : pas d'achat COGS sur la période, ou aucune
 *        charge enregistrée alors qu'il existe du chiffre d'affaires.
 *      • « Estimation complète » sinon — ce qui ne vaut toujours pas
 *        certification comptable.
 */

import {
  EXPENSE_CATEGORIES,
  PURCHASE_CATEGORIES,
} from './constants';
import { isBetween } from './dates';
import { round2, sum } from './money';
import type { Period } from './period';
import { monthsInPeriod } from './period';
import type {
  Expense,
  ExpenseCategory,
  FinanceJournalRow,
  Invoice,
  InvoiceStatus,
  Payment,
  Purchase,
  PurchaseCategory,
} from './types';

export type EstimateConfidence = 'complete' | 'partial' | 'insufficient';

/** Statuts qui comptent comme du chiffre d'affaires réalisé. */
export const CONFIRMED_REVENUE_STATUSES: readonly InvoiceStatus[] = ['sent', 'partial', 'paid'];

export function isConfirmedInvoice(invoice: Invoice): boolean {
  return CONFIRMED_REVENUE_STATUSES.includes(invoice.status);
}

export function isRevenueInvoice(invoice: Invoice): boolean {
  return isConfirmedInvoice(invoice) && invoice.kind === 'invoice';
}

export function isConfirmedCreditNote(invoice: Invoice): boolean {
  return isConfirmedInvoice(invoice) && invoice.kind === 'credit_note';
}

export function purchaseIsCogs(category: PurchaseCategory): boolean {
  return PURCHASE_CATEGORIES[category]?.cogs ?? false;
}

export function purchaseIsCapex(category: PurchaseCategory): boolean {
  return PURCHASE_CATEGORIES[category]?.capex ?? false;
}

/** Total d'un achat recalculé (quantité × prix unitaire). */
export function purchaseTotal(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

export interface FinanceDataset {
  invoices: Invoice[];
  payments: Payment[];
  purchases: Purchase[];
  expenses: Expense[];
}

export type FinanceDatasetInput = Partial<FinanceDataset>;

function dataset(input: FinanceDatasetInput): FinanceDataset {
  return {
    invoices: input.invoices ?? [],
    payments: input.payments ?? [],
    purchases: input.purchases ?? [],
    expenses: input.expenses ?? [],
  };
}

export function invoicesInPeriod(invoices: Invoice[], period: Period): Invoice[] {
  return invoices.filter((invoice) => isBetween(invoice.issueDate, period.start, period.end));
}

export function paymentsInPeriod(payments: Payment[], period: Period): Payment[] {
  return payments.filter((payment) => isBetween(payment.paidAt, period.start, period.end));
}

export function purchasesInPeriod(purchases: Purchase[], period: Period): Purchase[] {
  return purchases.filter((purchase) => isBetween(purchase.purchaseDate, period.start, period.end));
}

export function expensesInPeriod(expenses: Expense[], period: Period): Expense[] {
  return expenses.filter((expense) => isBetween(expense.expenseDate, period.start, period.end));
}

// -----------------------------------------------------------------------------
// Chiffre d'affaires
// -----------------------------------------------------------------------------
export interface RevenueSummary {
  /** CA net HT, avoirs déduits. */
  netHt: number;
  /** CA net TTC, avoirs déduits. */
  netTtc: number;
  /** TVA collectée nette des avoirs. */
  tax: number;
  /** Factures seules, avant déduction des avoirs. */
  issuedHt: number;
  issuedTtc: number;
  /** Avoirs confirmés de la période (montant positif). */
  creditedHt: number;
  creditedTtc: number;
  /** Déjà réglé sur les factures émises dans la période. */
  paidOnIssued: number;
  /** Reste à recevoir sur les factures émises dans la période. */
  outstanding: number;
  invoiceCount: number;
  creditNoteCount: number;
  paidCount: number;
  partialCount: number;
  draftCount: number;
  draftHt: number;
  draftTtc: number;
  cancelledCount: number;
  cancelledHt: number;
  cancelledTtc: number;
}

export function computeRevenue(
  allInvoices: Invoice[],
  period: Period,
): RevenueSummary {
  const invoices = invoicesInPeriod(allInvoices, period);

  const issued = invoices.filter(isRevenueInvoice);
  const credits = invoices.filter(isConfirmedCreditNote);

  const issuedHt = sum(issued.map((i) => i.netHt));
  const issuedTtc = sum(issued.map((i) => i.totalTtc));
  const issuedTax = sum(issued.map((i) => i.taxTotal));
  const creditedHt = sum(credits.map((i) => i.netHt));
  const creditedTtc = sum(credits.map((i) => i.totalTtc));
  const creditedTax = sum(credits.map((i) => i.taxTotal));

  const draft = invoices.filter((i) => i.status === 'draft');
  const cancelled = invoices.filter((i) => i.status === 'cancelled');

  return {
    netHt: round2(issuedHt - creditedHt),
    netTtc: round2(issuedTtc - creditedTtc),
    tax: round2(issuedTax - creditedTax),
    issuedHt,
    issuedTtc,
    creditedHt,
    creditedTtc,
    paidOnIssued: sum(issued.map((i) => i.amountPaid)),
    outstanding: sum(issued.map((i) => Math.max(round2(i.totalTtc - i.amountPaid), 0))),
    invoiceCount: issued.length,
    creditNoteCount: credits.length,
    paidCount: issued.filter((i) => i.status === 'paid').length,
    partialCount: issued.filter((i) => i.status === 'partial').length,
    draftCount: draft.filter((i) => i.kind === 'invoice').length,
    draftHt: sum(draft.filter((i) => i.kind === 'invoice').map((i) => i.netHt)),
    draftTtc: sum(draft.filter((i) => i.kind === 'invoice').map((i) => i.totalTtc)),
    cancelledCount: cancelled.filter((i) => i.kind === 'invoice').length,
    cancelledHt: sum(cancelled.filter((i) => i.kind === 'invoice').map((i) => i.netHt)),
    cancelledTtc: sum(cancelled.filter((i) => i.kind === 'invoice').map((i) => i.totalTtc)),
  };
}

// -----------------------------------------------------------------------------
// Résumé financier complet
// -----------------------------------------------------------------------------
export interface FinanceSummary {
  revenue: RevenueSummary;
  /** Trésorerie encaissée sur la période (paiements datés). */
  cashIn: number;
  /** Achats payés + dépenses de la période. */
  cashOut: number;
  netCash: number;
  purchasesTotal: number;
  purchasesPaid: number;
  purchasesDue: number;
  purchasesCount: number;
  cogsTotal: number;
  operatingPurchasesTotal: number;
  capexTotal: number;
  expensesTotal: number;
  expensesCount: number;
  /** COGS + achats d'exploitation + dépenses. */
  costsTotal: number;
  /** CA net − COGS ; null si aucun achat COGS n'est renseigné. */
  grossMargin: number | null;
  grossMarginRate: number | null;
  /** CA net − COGS − charges. */
  estimatedResult: number;
  estimatedResultRate: number | null;
  cogsAvailable: boolean;
  partialEstimate: boolean;
  confidence: EstimateConfidence;
  warnings: string[];
}

export function computeFinanceSummary(
  input: FinanceDatasetInput,
  period: Period,
): FinanceSummary {
  if (period.end < period.start) {
    throw new Error('Période invalide : la fin précède le début.');
  }

  const data = dataset(input);
  const revenue = computeRevenue(data.invoices, period);
  const payments = paymentsInPeriod(data.payments, period);
  const purchases = purchasesInPeriod(data.purchases, period);
  const expenses = expensesInPeriod(data.expenses, period);

  const cashIn = sum(payments.map((p) => p.amount));
  const purchasesTotal = sum(purchases.map((p) => purchaseTotal(p.quantity, p.unitPrice)));
  const purchasesPaid = sum(purchases.map((p) => p.amountPaid));
  const purchasesDue = sum(
    purchases.map((p) => Math.max(round2(purchaseTotal(p.quantity, p.unitPrice) - p.amountPaid), 0)),
  );
  const cogsTotal = sum(
    purchases.filter((p) => purchaseIsCogs(p.category)).map((p) => purchaseTotal(p.quantity, p.unitPrice)),
  );
  const capexTotal = sum(
    purchases.filter((p) => purchaseIsCapex(p.category)).map((p) => purchaseTotal(p.quantity, p.unitPrice)),
  );
  const operatingPurchasesTotal = round2(purchasesTotal - cogsTotal - capexTotal);
  const expensesTotal = sum(expenses.map((e) => e.amount));
  const cashOut = round2(purchasesPaid + expensesTotal);
  const netCash = round2(cashIn - cashOut);

  const cogsAvailable = purchases.some((p) => purchaseIsCogs(p.category));
  const grossMargin = cogsAvailable ? round2(revenue.netHt - cogsTotal) : null;
  const costsTotal = round2(cogsTotal + operatingPurchasesTotal + expensesTotal);
  const estimatedResult = round2(revenue.netHt - costsTotal);

  const warnings: string[] = [];
  if (!cogsAvailable) {
    warnings.push(
      "Aucun achat de marchandises ou de matières premières sur la période : le coût des marchandises vendues n'est pas disponible.",
    );
  }
  if (revenue.netHt > 0 && expenses.length === 0) {
    warnings.push(
      "Aucune dépense enregistrée sur la période : le résultat estimé ne tient pas compte du loyer, des salaires ou des frais bancaires.",
    );
  }
  if (revenue.draftCount > 0) {
    warnings.push(
      `${revenue.draftCount} facture(s) brouillon exclue(s) du chiffre d'affaires pour un total de ${revenue.draftTtc} FCFA.`,
    );
  }
  if (revenue.cancelledCount > 0) {
    warnings.push(`${revenue.cancelledCount} facture(s) annulée(s) exclue(s) du chiffre d'affaires.`);
  }

  const hasActivity =
    revenue.invoiceCount > 0 ||
    revenue.creditNoteCount > 0 ||
    payments.length > 0 ||
    purchases.length > 0 ||
    expenses.length > 0;

  // Estimation partielle si le COGS manque, ou si aucun frais d'exploitation
  // n'est enregistré alors qu'il y a du chiffre d'affaires.
  const partialEstimate = !cogsAvailable || (revenue.netHt > 0 && expenses.length === 0);

  const confidence: EstimateConfidence = !hasActivity
    ? 'insufficient'
    : partialEstimate
      ? 'partial'
      : 'complete';

  return {
    revenue,
    cashIn,
    cashOut,
    netCash,
    purchasesTotal,
    purchasesPaid,
    purchasesDue,
    purchasesCount: purchases.length,
    cogsTotal,
    operatingPurchasesTotal,
    capexTotal,
    expensesTotal,
    expensesCount: expenses.length,
    costsTotal,
    grossMargin,
    grossMarginRate: grossMargin === null ? null : ratioPercent(grossMargin, revenue.netHt),
    estimatedResult,
    estimatedResultRate: ratioPercent(estimatedResult, revenue.netHt),
    cogsAvailable,
    partialEstimate,
    confidence,
    warnings,
  };
}

function ratioPercent(part: number, whole: number): number | null {
  if (!whole) return null;
  return round2((part / whole) * 100);
}

// -----------------------------------------------------------------------------
// Totaux des modules Achats / Dépenses (hors période)
// -----------------------------------------------------------------------------
export interface PurchaseTotals {
  count: number;
  total: number;
  paid: number;
  due: number;
  unpaidCount: number;
  partialCount: number;
  paidCount: number;
  cogsTotal: number;
  operatingTotal: number;
  capexTotal: number;
}

export function computePurchaseTotals(purchases: Purchase[]): PurchaseTotals {
  const total = sum(purchases.map((p) => purchaseTotal(p.quantity, p.unitPrice)));
  const paid = sum(purchases.map((p) => p.amountPaid));
  return {
    count: purchases.length,
    total,
    paid,
    due: round2(total - paid),
    unpaidCount: purchases.filter((p) => p.amountPaid <= 0).length,
    partialCount: purchases.filter((p) => p.amountPaid > 0 && p.amountPaid < purchaseTotal(p.quantity, p.unitPrice)).length,
    paidCount: purchases.filter((p) => p.amountPaid >= purchaseTotal(p.quantity, p.unitPrice)).length,
    cogsTotal: sum(
      purchases.filter((p) => purchaseIsCogs(p.category)).map((p) => purchaseTotal(p.quantity, p.unitPrice)),
    ),
    operatingTotal: sum(
      purchases
        .filter((p) => !purchaseIsCogs(p.category) && !purchaseIsCapex(p.category))
        .map((p) => purchaseTotal(p.quantity, p.unitPrice)),
    ),
    capexTotal: sum(
      purchases.filter((p) => purchaseIsCapex(p.category)).map((p) => purchaseTotal(p.quantity, p.unitPrice)),
    ),
  };
}

export interface ExpenseTotals {
  count: number;
  total: number;
}

export function computeExpenseTotals(expenses: Expense[]): ExpenseTotals {
  return { count: expenses.length, total: sum(expenses.map((e) => e.amount)) };
}

// -----------------------------------------------------------------------------
// Répartitions par catégorie
// -----------------------------------------------------------------------------
export interface CategorySlice {
  key: string;
  label: string;
  total: number;
  count: number;
}

export function expenseBreakdown(expenses: Expense[], period?: Period): CategorySlice[] {
  const rows = period ? expensesInPeriod(expenses, period) : expenses;
  const map = new Map<ExpenseCategory, { total: number; count: number }>();
  for (const expense of rows) {
    const current = map.get(expense.category) ?? { total: 0, count: 0 };
    current.total += expense.amount;
    current.count += 1;
    map.set(expense.category, current);
  }
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: EXPENSE_CATEGORIES[key]?.label ?? key,
      total: round2(value.total),
      count: value.count,
    }))
    .sort((a, b) => b.total - a.total);
}

export function purchaseBreakdown(purchases: Purchase[], period?: Period): CategorySlice[] {
  const rows = period ? purchasesInPeriod(purchases, period) : purchases;
  const map = new Map<PurchaseCategory, { total: number; count: number }>();
  for (const purchase of rows) {
    const current = map.get(purchase.category) ?? { total: 0, count: 0 };
    current.total += purchaseTotal(purchase.quantity, purchase.unitPrice);
    current.count += 1;
    map.set(purchase.category, current);
  }
  return [...map.entries()]
    .map(([key, value]) => ({
      key,
      label: PURCHASE_CATEGORIES[key]?.label ?? key,
      total: round2(value.total),
      count: value.count,
    }))
    .sort((a, b) => b.total - a.total);
}

// -----------------------------------------------------------------------------
// Série mensuelle (graphiques)
// -----------------------------------------------------------------------------
export interface MonthlyPoint {
  key: string;
  label: string;
  revenueHt: number;
  cashIn: number;
  purchases: number;
  expenses: number;
  result: number;
}

export function buildMonthlySeries(input: FinanceDatasetInput, period: Period): MonthlyPoint[] {
  const data = dataset(input);
  return monthsInPeriod(period).map((month) => {
    const prefix = month.key;

    const revenue = data.invoices
      .filter((i) => isConfirmedInvoice(i) && i.issueDate.startsWith(prefix))
      .reduce(
        (acc, invoice) => acc + (invoice.kind === 'credit_note' ? -invoice.netHt : invoice.netHt),
        0,
      );

    const cash = data.payments
      .filter((p) => p.paidAt.startsWith(prefix))
      .reduce((acc, payment) => acc + payment.amount, 0);

    const monthPurchases = data.purchases.filter((p) => p.purchaseDate.startsWith(prefix));
    const purchases = monthPurchases.reduce(
      (acc, purchase) => acc + purchaseTotal(purchase.quantity, purchase.unitPrice),
      0,
    );
    // Le résultat estimé exclut les investissements (équipements), comme le
    // résumé global : la somme des mois doit égaler le résultat de la période.
    const resultCost = monthPurchases
      .filter((purchase) => !purchaseIsCapex(purchase.category))
      .reduce((acc, purchase) => acc + purchaseTotal(purchase.quantity, purchase.unitPrice), 0);

    const expenses = data.expenses
      .filter((e) => e.expenseDate.startsWith(prefix))
      .reduce((acc, expense) => acc + expense.amount, 0);

    return {
      key: month.key,
      label: month.label,
      revenueHt: round2(revenue),
      cashIn: round2(cash),
      purchases: round2(purchases),
      expenses: round2(expenses),
      result: round2(revenue - resultCost - expenses),
    };
  });
}

// -----------------------------------------------------------------------------
// Journal des opérations
// -----------------------------------------------------------------------------
const SOURCE_ORDER: Record<FinanceJournalRow['source'], number> = {
  facture: 0,
  avoir: 1,
  paiement: 2,
  achat: 3,
  depense: 4,
};

/**
 * Journal unifié d'une période. Les factures brouillon et annulées n'y figurent
 * pas ; les avoirs apparaissent en négatif ; un encaissement est une ligne
 * distincte de la facture qu'il règle.
 */
export function buildJournal(input: FinanceDatasetInput, period: Period): FinanceJournalRow[] {
  const data = dataset(input);
  const rows: FinanceJournalRow[] = [];

  for (const invoice of invoicesInPeriod(data.invoices, period)) {
    if (!isConfirmedInvoice(invoice)) continue;
    const sign = invoice.kind === 'credit_note' ? -1 : 1;
    rows.push({
      id: `invoice-${invoice.id}`,
      occurredOn: invoice.issueDate,
      source: invoice.kind === 'credit_note' ? 'avoir' : 'facture',
      sourceId: invoice.id,
      reference: invoice.number,
      counterparty: invoice.clientName ?? 'Client de passage',
      category: invoice.kind === 'credit_note' ? 'avoir' : 'vente',
      amountHt: round2(sign * invoice.netHt),
      amountTax: round2(sign * invoice.taxTotal),
      amountTtc: round2(sign * invoice.totalTtc),
      cashIn: 0,
      cashOut: 0,
      isCogs: false,
    });
  }

  for (const payment of paymentsInPeriod(data.payments, period)) {
    rows.push({
      id: `payment-${payment.id}`,
      occurredOn: payment.paidAt,
      source: 'paiement',
      sourceId: payment.id,
      reference: payment.invoiceNumber ?? payment.reference ?? '—',
      counterparty: payment.clientName ?? 'Client de passage',
      category: 'encaissement',
      amountHt: 0,
      amountTax: 0,
      amountTtc: 0,
      cashIn: payment.amount,
      cashOut: 0,
      isCogs: false,
    });
  }

  for (const purchase of purchasesInPeriod(data.purchases, period)) {
    const total = purchaseTotal(purchase.quantity, purchase.unitPrice);
    rows.push({
      id: `purchase-${purchase.id}`,
      occurredOn: purchase.purchaseDate,
      source: 'achat',
      sourceId: purchase.id,
      reference: purchase.supplierInvoiceNumber ?? '—',
      counterparty: purchase.supplierName ?? 'Fournisseur non renseigné',
      category: purchase.category,
      amountHt: total,
      amountTax: 0,
      amountTtc: total,
      cashIn: 0,
      cashOut: purchase.amountPaid,
      isCogs: purchaseIsCogs(purchase.category),
    });
  }

  for (const expense of expensesInPeriod(data.expenses, period)) {
    rows.push({
      id: `expense-${expense.id}`,
      occurredOn: expense.expenseDate,
      source: 'depense',
      sourceId: expense.id,
      reference: expense.reference ?? '—',
      counterparty: '—',
      category: expense.category,
      amountHt: expense.amount,
      amountTax: 0,
      amountTtc: expense.amount,
      cashIn: 0,
      cashOut: expense.amount,
      isCogs: false,
    });
  }

  return rows.sort((a, b) => {
    if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
    const bySource = SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
    if (bySource !== 0) return bySource;
    return a.reference.localeCompare(b.reference);
  });
}

/**
 * Contrôle de cohérence utilisé par l'interface : compare le résumé calculé
 * côté client aux agrégats renvoyés par la base. Un écart signale un bug de
 * synchronisation, pas une différence d'arrondi (tolérance 1 FCFA).
 */
export function reconcileWithServer(
  client: FinanceSummary,
  server: {
    invoicedHt: number;
    invoicedTax: number;
    cashIn: number;
    cashOut: number;
    purchasesTotal: number;
    expensesTotal: number;
    outstanding: number;
    estimatedResult: number;
  },
  tolerance = 1,
): string[] {
  const checks: Array<[string, number, number]> = [
    ['CA net HT', client.revenue.netHt, server.invoicedHt],
    ['TVA collectée', client.revenue.tax, server.invoicedTax],
    ['Trésorerie encaissée', client.cashIn, server.cashIn],
    ['Décaissements', client.cashOut, server.cashOut],
    ['Achats', client.purchasesTotal, server.purchasesTotal],
    ['Dépenses', client.expensesTotal, server.expensesTotal],
    ['Reste à recevoir', client.revenue.outstanding, server.outstanding],
    ['Résultat estimé', client.estimatedResult, server.estimatedResult],
  ];
  return checks
    .filter(([, a, b]) => Math.abs(round2(a) - round2(b)) > tolerance)
    .map(([label, a, b]) => `${label} : client ${a} ≠ base ${b}`);
}
