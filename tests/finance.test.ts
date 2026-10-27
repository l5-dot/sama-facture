import { describe, expect, it } from 'vitest';
import {
  buildJournal,
  buildMonthlySeries,
  computeExpenseTotals,
  computeFinanceSummary,
  computePurchaseTotals,
  computeRevenue,
  expenseBreakdown,
  isConfirmedInvoice,
  purchaseBreakdown,
  purchaseTotal,
  reconcileWithServer,
} from '../src/lib/finance';
import { buildCustomPeriod } from '../src/lib/period';
import {
  makeExpense,
  makeInvoice,
  makePayment,
  makePurchase,
  OCTOBER_EXPECTED,
  OCT_2026,
  octoberDataset,
} from './fixtures';

describe('chiffre d’affaires', () => {
  it('exclut les brouillons et les factures annulées', () => {
    const { invoices } = octoberDataset();
    const revenue = computeRevenue(invoices, OCT_2026);

    // 35 000 + 25 000 + 76 000 = 136 000, moins l'avoir de 8 000.
    expect(revenue.netHt).toBe(128000);
    expect(revenue.issuedHt).toBe(136000);
    expect(revenue.creditedHt).toBe(8000);
    expect(revenue.draftHt).toBe(24000);
    expect(revenue.cancelledHt).toBe(3000);
    expect(revenue.invoiceCount).toBe(3);
    expect(revenue.draftCount).toBe(1);
    expect(revenue.cancelledCount).toBe(1);
  });

  it('calcule la TVA nette des avoirs', () => {
    const { invoices } = octoberDataset();
    const revenue = computeRevenue(invoices, OCT_2026);
    expect(revenue.tax).toBe(13680);
    expect(revenue.netTtc).toBe(141680);
  });

  it('distingue montant réglé et reste à recevoir sur les factures de la période', () => {
    const { invoices } = octoberDataset();
    const revenue = computeRevenue(invoices, OCT_2026);
    expect(revenue.paidOnIssued).toBe(45000);
    expect(revenue.outstanding).toBe(104680); // 15 000 + 89 680
    expect(revenue.partialCount).toBe(1);
    expect(revenue.paidCount).toBe(1);
  });

  it('ne compte pas un avoir comme une créance', () => {
    const credit = makeInvoice({
      kind: 'credit_note',
      status: 'sent',
      netHt: 8000,
      totalTtc: 8000,
      amountPaid: 0,
      amountDue: 8000,
    });
    const revenue = computeRevenue([credit], OCT_2026);
    expect(revenue.netHt).toBe(-8000);
    expect(revenue.outstanding).toBe(0);
    expect(revenue.invoiceCount).toBe(0);
  });

  it('respecte les bornes d’une période personnalisée', () => {
    const { invoices } = octoberDataset();
    const narrow = buildCustomPeriod('2026-10-03', '2026-10-09');
    const revenue = computeRevenue(invoices, narrow);
    // Facture du 03/10 (35 000) + du 09/10 (25 000), rien d'autre.
    expect(revenue.netHt).toBe(60000);
    expect(revenue.invoiceCount).toBe(2);
    expect(revenue.draftCount).toBe(0);
  });

  it('ne confond pas une facture émise avec un brouillon', () => {
    expect(isConfirmedInvoice(makeInvoice({ status: 'draft' }))).toBe(false);
    expect(isConfirmedInvoice(makeInvoice({ status: 'cancelled' }))).toBe(false);
    expect(isConfirmedInvoice(makeInvoice({ status: 'sent' }))).toBe(true);
    expect(isConfirmedInvoice(makeInvoice({ status: 'partial' }))).toBe(true);
    expect(isConfirmedInvoice(makeInvoice({ status: 'paid' }))).toBe(true);
  });
});

describe('résumé financier d’octobre 2026', () => {
  const summary = computeFinanceSummary(octoberDataset(), OCT_2026);

  it('reprend tous les agrégats attendus', () => {
    expect(summary.revenue.netHt).toBe(OCTOBER_EXPECTED.invoicedHt);
    expect(summary.revenue.tax).toBe(OCTOBER_EXPECTED.invoicedTax);
    expect(summary.revenue.netTtc).toBe(OCTOBER_EXPECTED.invoicedTtc);
    expect(summary.revenue.creditedHt).toBe(OCTOBER_EXPECTED.creditedHt);
    expect(summary.revenue.paidOnIssued).toBe(OCTOBER_EXPECTED.paidOnIssued);
    expect(summary.revenue.outstanding).toBe(OCTOBER_EXPECTED.outstanding);
    expect(summary.revenue.draftTtc).toBe(OCTOBER_EXPECTED.draftTtc);
    expect(summary.revenue.cancelledTtc).toBe(OCTOBER_EXPECTED.cancelledTtc);
    expect(summary.cashIn).toBe(OCTOBER_EXPECTED.cashIn);
    expect(summary.purchasesTotal).toBe(OCTOBER_EXPECTED.purchasesTotal);
    expect(summary.purchasesPaid).toBe(OCTOBER_EXPECTED.purchasesPaid);
    expect(summary.purchasesDue).toBe(OCTOBER_EXPECTED.purchasesDue);
    expect(summary.cogsTotal).toBe(OCTOBER_EXPECTED.cogsTotal);
    expect(summary.operatingPurchasesTotal).toBe(OCTOBER_EXPECTED.operatingPurchasesTotal);
    expect(summary.capexTotal).toBe(OCTOBER_EXPECTED.capexTotal);
    expect(summary.expensesTotal).toBe(OCTOBER_EXPECTED.expensesTotal);
    expect(summary.cashOut).toBe(OCTOBER_EXPECTED.cashOut);
    expect(summary.netCash).toBe(OCTOBER_EXPECTED.netCash);
    expect(summary.costsTotal).toBe(OCTOBER_EXPECTED.costsTotal);
    expect(summary.grossMargin).toBe(OCTOBER_EXPECTED.grossMargin);
    expect(summary.estimatedResult).toBe(OCTOBER_EXPECTED.estimatedResult);
  });

  it('distingue trésorerie nette et bénéfice estimé', () => {
    expect(summary.netCash).not.toBe(summary.estimatedResult);
    expect(summary.netCash).toBe(-315000);
    expect(summary.estimatedResult).toBe(-202000);
  });

  it('n’ajoute pas deux fois les mêmes coûts', () => {
    expect(summary.purchasesTotal).toBe(
      summary.cogsTotal + summary.operatingPurchasesTotal + summary.capexTotal,
    );
    expect(summary.costsTotal).toBe(
      summary.cogsTotal + summary.operatingPurchasesTotal + summary.expensesTotal,
    );
    expect(summary.estimatedResult).toBe(summary.revenue.netHt - summary.costsTotal);
  });

  it('exclut les investissements du résultat estimé', () => {
    // Si le capex était déduit, le résultat serait -452 000.
    expect(summary.estimatedResult).toBe(-202000);
    expect(summary.estimatedResult).not.toBe(-452000);
  });

  it('calcule les taux sur le CA net', () => {
    expect(summary.grossMarginRate).toBe(29.69);
    expect(summary.estimatedResultRate).toBe(-157.81);
  });

  it('considère l’estimation complète quand COGS et charges existent', () => {
    expect(summary.cogsAvailable).toBe(true);
    expect(summary.partialEstimate).toBe(false);
    expect(summary.confidence).toBe('complete');
  });

  it('moyenne les achats payés en trésorerie, pas le total', () => {
    expect(summary.cashOut).toBe(summary.purchasesPaid + summary.expensesTotal);
    expect(summary.cashOut).not.toBe(summary.purchasesTotal + summary.expensesTotal);
  });
});

describe('qualité de l’estimation', () => {
  it('signale un COGS indisponible sans afficher une marge de zéro', () => {
    const data = {
      invoices: [makeInvoice({ netHt: 50000, totalTtc: 50000 })],
      payments: [makePayment({ amount: 50000, paidAt: '2026-10-12' })],
      purchases: [makePurchase({ category: 'fournitures', quantity: 1, unitPrice: 5000, amountPaid: 5000 })],
      expenses: [makeExpense({ amount: 10000 })],
    };
    const summary = computeFinanceSummary(data, OCT_2026);
    expect(summary.grossMargin).toBeNull();
    expect(summary.grossMarginRate).toBeNull();
    expect(summary.partialEstimate).toBe(true);
    expect(summary.confidence).toBe('partial');
    expect(summary.warnings.some((warning) => warning.includes('coût des marchandises'))).toBe(true);
    // Le résultat reste calculable mais partiel : 50 000 − 5 000 − 10 000.
    expect(summary.estimatedResult).toBe(35000);
  });

  it('signale l’absence de dépenses quand il y a du chiffre d’affaires', () => {
    const summary = computeFinanceSummary(
      {
        invoices: [makeInvoice({ netHt: 40000, totalTtc: 40000 })],
        purchases: [makePurchase({ quantity: 2, unitPrice: 5000, amountPaid: 10000 })],
      },
      OCT_2026,
    );
    expect(summary.warnings.some((warning) => warning.includes('Aucune dépense'))).toBe(true);
    expect(summary.confidence).toBe('partial');
  });

  it('signale des données insuffisantes sans aucune opération', () => {
    const summary = computeFinanceSummary({}, OCT_2026);
    expect(summary.revenue.netHt).toBe(0);
    expect(summary.estimatedResult).toBe(0);
    expect(summary.grossMargin).toBeNull();
    expect(summary.confidence).toBe('insufficient');
    expect(summary.warnings.length).toBeGreaterThan(0);
  });

  it('mentionne explicitement les brouillons exclus', () => {
    const summary = computeFinanceSummary(
      { invoices: [makeInvoice({ status: 'draft', totalTtc: 12000, netHt: 12000 })] },
      OCT_2026,
    );
    expect(summary.revenue.netHt).toBe(0);
    expect(summary.warnings.some((warning) => warning.toLowerCase().includes('brouillon'))).toBe(true);
  });
});

describe('périodes et trésorerie', () => {
  it('inclut les règlements de factures antérieures dans la trésorerie du mois', () => {
    const { invoices, payments } = octoberDataset();
    const september = computeRevenue(invoices, OCT_2026);
    const summary = computeFinanceSummary({ invoices, payments }, OCT_2026);
    // 40 000 encaissés en octobre sur une facture de septembre.
    expect(summary.cashIn).toBe(85000);
    expect(september.paidOnIssued).toBe(45000);
    expect(summary.cashIn - september.paidOnIssued).toBe(40000);
  });

  it('exclut les paiements de novembre', () => {
    const { payments } = octoberDataset();
    const summary = computeFinanceSummary({ payments }, OCT_2026);
    expect(summary.cashIn).toBe(85000);
  });

  it('calcule un mois sans activité à zéro', () => {
    const summary = computeFinanceSummary(octoberDataset(), buildCustomPeriod('2025-01-01', '2025-01-31'));
    expect(summary.revenue.netHt).toBe(0);
    expect(summary.cashIn).toBe(0);
    expect(summary.purchasesTotal).toBe(0);
    expect(summary.expensesTotal).toBe(0);
    expect(summary.estimatedResult).toBe(0);
  });
});

describe('achats et dépenses', () => {
  it('calcule les totaux d’achats avec impayés et partiels', () => {
    const purchases = [
      makePurchase({ quantity: 3, unitPrice: 1000, amountPaid: 3000 }),
      makePurchase({ quantity: 2, unitPrice: 5000, amountPaid: 0 }),
      makePurchase({ quantity: 1, unitPrice: 10000, amountPaid: 4000 }),
    ];
    const totals = computePurchaseTotals(purchases);
    expect(totals.total).toBe(23000);
    expect(totals.paid).toBe(7000);
    expect(totals.due).toBe(16000);
    expect(totals.paidCount).toBe(1);
    expect(totals.unpaidCount).toBe(1);
    expect(totals.partialCount).toBe(1);
  });

  it('recalcule le total d’un achat à partir de la quantité et du prix', () => {
    expect(purchaseTotal(2.5, 1250)).toBe(3125);
    const purchase = makePurchase({ quantity: 2, unitPrice: 7500, totalAmount: 1, amountPaid: 5000 });
    const totals = computePurchaseTotals([purchase]);
    expect(totals.total).toBe(15000);
    expect(totals.due).toBe(10000);
  });

  it('ventile les achats par nature', () => {
    const slices = purchaseBreakdown(octoberDataset().purchases, OCT_2026);
    expect(slices.map((slice) => slice.key)).toEqual(['equipement', 'marchandises', 'fournitures']);
    expect(slices.find((slice) => slice.key === 'marchandises')?.total).toBe(90000);
  });

  it('ventile les dépenses par catégorie, de la plus élevée à la plus faible', () => {
    const slices = expenseBreakdown(octoberDataset().expenses, OCT_2026);
    expect(slices[0]).toMatchObject({ key: 'salaires', total: 150000, count: 1 });
    expect(slices[1]).toMatchObject({ key: 'loyer', total: 75000 });
    expect(computeExpenseTotals(octoberDataset().expenses.filter((e) => e.expenseDate.startsWith('2026-10'))).total).toBe(225000);
  });
});

describe('série mensuelle', () => {
  it('répartit les montants par mois et exclut les investissements du résultat', () => {
    const dataset = octoberDataset();
    const quarter = buildCustomPeriod('2026-10-01', '2026-12-31');
    const series = buildMonthlySeries(dataset, quarter);
    expect(series).toHaveLength(3);

    const october = series[0];
    expect(october.revenueHt).toBe(128000);
    expect(october.cashIn).toBe(85000);
    expect(october.purchases).toBe(355000);
    expect(october.expenses).toBe(225000);
    // 128 000 − (90 000 + 15 000) − 225 000, capex exclu.
    expect(october.result).toBe(-202000);

    expect(series[1].purchases).toBe(5000);
    expect(series[1].expenses).toBe(10000);
  });

  it('la somme des résultats mensuels égale le résultat de la période', () => {
    const dataset = octoberDataset();
    const quarter = buildCustomPeriod('2026-10-01', '2026-12-31');
    const series = buildMonthlySeries(dataset, quarter);
    const sumResults = series.reduce((acc, point) => acc + point.result, 0);
    const summary = computeFinanceSummary(dataset, quarter);
    expect(Math.round(sumResults)).toBe(Math.round(summary.estimatedResult));
  });
});

describe('journal des opérations', () => {
  const journal = buildJournal(octoberDataset(), OCT_2026);

  it('exclut les brouillons et les annulées', () => {
    expect(journal.some((row) => row.reference === 'FACT-0004')).toBe(false);
    expect(journal.some((row) => row.reference === 'FACT-0005')).toBe(false);
  });

  it('présente un avoir en négatif', () => {
    const credit = journal.find((row) => row.source === 'avoir');
    expect(credit?.amountHt).toBe(-8000);
    expect(credit?.cashIn).toBe(0);
  });

  it('sépare la facture de son encaissement', () => {
    const facture = journal.find((row) => row.source === 'facture' && row.reference === 'FACT-0001');
    const payment = journal.find((row) => row.source === 'paiement' && row.reference === 'FACT-0001');
    expect(facture?.amountHt).toBe(35000);
    expect(facture?.cashIn).toBe(0);
    expect(payment?.cashIn).toBe(35000);
    expect(payment?.amountHt).toBe(0);
  });

  it('n’enregistre en trésorerie que le montant payé d’un achat', () => {
    const purchase = journal.find((row) => row.source === 'achat' && row.reference === '—' && row.amountHt === 90000);
    expect(purchase?.cashOut).toBe(60000);
    expect(purchase?.isCogs).toBe(true);
  });

  it('trie du plus récent au plus ancien', () => {
    const dates = journal.map((row) => row.occurredOn);
    const sorted = [...dates].sort((a, b) => (a < b ? 1 : -1));
    expect(dates).toEqual(sorted);
  });

  it('compte les lignes attendues sur octobre', () => {
    // 3 factures + 1 avoir + 3 paiements + 3 achats + 2 dépenses.
    expect(journal).toHaveLength(12);
  });
});

describe('rapprochement avec les agrégats serveur', () => {
  it('ne signale aucun écart quand tout concorde', () => {
    const summary = computeFinanceSummary(octoberDataset(), OCT_2026);
    const mismatches = reconcileWithServer(summary, {
      invoicedHt: 128000,
      invoicedTax: 13680,
      cashIn: 85000,
      cashOut: 400000,
      purchasesTotal: 355000,
      expensesTotal: 225000,
      outstanding: 104680,
      estimatedResult: -202000,
    });
    expect(mismatches).toEqual([]);
  });

  it('détecte un écart de calcul', () => {
    const summary = computeFinanceSummary(octoberDataset(), OCT_2026);
    const mismatches = reconcileWithServer(summary, {
      invoicedHt: 130000,
      invoicedTax: 13680,
      cashIn: 85000,
      cashOut: 400000,
      purchasesTotal: 355000,
      expensesTotal: 225000,
      outstanding: 104680,
      estimatedResult: -202000,
    });
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]).toContain('CA net HT');
  });

  it('tolère un écart d’arrondi d’un franc', () => {
    const summary = computeFinanceSummary(octoberDataset(), OCT_2026);
    expect(
      reconcileWithServer(summary, {
        invoicedHt: 128001,
        invoicedTax: 13680,
        cashIn: 85000,
        cashOut: 400000,
        purchasesTotal: 355000,
        expensesTotal: 225000,
        outstanding: 104680,
        estimatedResult: -202000,
      }),
    ).toEqual([]);
  });
});
