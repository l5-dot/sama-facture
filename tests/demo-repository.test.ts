/**
 * Tests du dépôt de démonstration : mêmes règles métier que la base
 * (permissions, isolation, cycle de vie des factures, paiements partiels).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DemoRepository } from '../src/lib/data/demo/repository';
import { resetDemoState } from '../src/lib/data/demo/db';
import { RepositoryError } from '../src/lib/data/types';
import { computeFinanceSummary, isConfirmedInvoice } from '../src/lib/finance';
import { defaultPeriod } from '../src/lib/period';
import { todayISO } from '../src/lib/dates';
import type { InvoiceDraftInput } from '../src/lib/data/types';
import type { PurchaseInput } from '../src/lib/types';

const ORG_A = 'org-takhabouli';
const ORG_B = 'org-atelier';

function purchaseInput(overrides: Partial<PurchaseInput> = {}): PurchaseInput {
  return {
    supplierName: 'Fournisseur test',
    supplierInvoiceNumber: 'F-001',
    purchaseDate: todayISO(),
    description: 'Achat de test',
    category: 'marchandises',
    quantity: 2,
    unitPrice: 5000,
    amountPaid: 4000,
    paymentMethod: 'especes',
    notes: null,
    ...overrides,
  };
}

function invoiceInput(overrides: Partial<InvoiceDraftInput> = {}): InvoiceDraftInput {
  return {
    kind: 'invoice',
    clientId: 'cli-mamadou',
    issueDate: todayISO(),
    dueDate: null,
    notes: null,
    discountType: 'none',
    discountValue: 0,
    items: [
      {
        productId: null,
        description: 'Prestation test',
        quantity: 1,
        unitPrice: 5000,
        discountPercent: 0,
        taxRate: 0,
      },
    ],
    ...overrides,
  };
}

async function expectRepositoryError(promise: Promise<unknown>, code: RepositoryError['code']) {
  await expect(promise).rejects.toBeInstanceOf(RepositoryError);
  await promise.catch((error: RepositoryError) => {
    expect(error.code).toBe(code);
  });
}

let repo: DemoRepository;

beforeEach(() => {
  window.localStorage.clear();
  repo = new DemoRepository(resetDemoState());
});

describe('organisations et isolation', () => {
  it('liste les organisations dont l’utilisateur est membre', async () => {
    const organizations = await repo.listOrganizations();
    expect(organizations).toHaveLength(2);
    expect(organizations.map((access) => access.organization.name)).toEqual([
      'Takhabouli Boutique',
      'Atelier Ndiaye Couture',
    ]);
    expect(organizations[0].role).toBe('owner');
    expect(organizations[1].role).toBe('admin');
  });

  it('n’expose jamais les achats d’une autre organisation', async () => {
    await repo.createPurchase(ORG_B, purchaseInput({ description: 'Achat atelier confidentiel' }));

    const purchasesA = await repo.listPurchases(ORG_A);
    const purchasesB = await repo.listPurchases(ORG_B);

    expect(purchasesA.some((p) => p.description === 'Achat atelier confidentiel')).toBe(false);
    expect(purchasesB.some((p) => p.description === 'Achat atelier confidentiel')).toBe(true);
    // Chaque organisation ne voit que ses propres données.
    expect(purchasesA.every((p) => p.organizationId === ORG_A)).toBe(true);
    expect(purchasesB.every((p) => p.organizationId === ORG_B)).toBe(true);
  });

  it('n’expose pas les factures d’une autre organisation', async () => {
    const invoicesA = await repo.listInvoices(ORG_A);
    const invoicesB = await repo.listInvoices(ORG_B);
    expect(invoicesB).toHaveLength(1);
    expect(invoicesA.every((invoice) => invoice.organizationId === ORG_A)).toBe(true);
    expect(invoicesA.some((invoice) => invoice.id === 'inv-b1')).toBe(false);
  });

  it('refuse une opération sur une facture d’une autre organisation', async () => {
    await expectRepositoryError(
      repo.recordPayment(ORG_B, {
        invoiceId: 'inv-1',
        amount: 1000,
        method: 'especes',
        paidAt: todayISO(),
      }),
      'not_found',
    );
  });

  it('refuse l’accès à une organisation inconnue', async () => {
    await expectRepositoryError(repo.listPurchases('org-inconnue'), 'forbidden');
  });
});

describe('permissions par rôle', () => {
  it('interdit au vendeur de saisir achats, dépenses et encaissements', async () => {
    await repo.setSimulatedRole(ORG_A, 'vendeur');
    await expectRepositoryError(repo.createPurchase(ORG_A, purchaseInput()), 'forbidden');
    await expectRepositoryError(
      repo.createExpense(ORG_A, {
        expenseDate: todayISO(),
        category: 'transport',
        description: 'Taxi',
        amount: 2000,
        reference: null,
        notes: null,
      }),
      'forbidden',
    );
    await expectRepositoryError(
      repo.recordPayment(ORG_A, {
        invoiceId: 'inv-3',
        amount: 1000,
        method: 'wave',
        paidAt: todayISO(),
      }),
      'forbidden',
    );
    // La lecture reste autorisée.
    await expect(repo.listPurchases(ORG_A)).resolves.toBeInstanceOf(Array);
  });

  it('autorise le comptable à saisir mais pas à supprimer', async () => {
    await repo.setSimulatedRole(ORG_A, 'comptable');
    const purchase = await repo.createPurchase(ORG_A, purchaseInput());
    expect(purchase.totalAmount).toBe(10000);
    await expectRepositoryError(repo.deletePurchase(ORG_A, purchase.id), 'forbidden');
  });

  it('autorise l’administrateur à supprimer un achat', async () => {
    await repo.setSimulatedRole(ORG_A, 'admin');
    const purchase = await repo.createPurchase(ORG_A, purchaseInput());
    await repo.deletePurchase(ORG_A, purchase.id);
    const purchases = await repo.listPurchases(ORG_A);
    expect(purchases.some((p) => p.id === purchase.id)).toBe(false);
  });

  it('interdit au comptable de gérer les factures', async () => {
    await repo.setSimulatedRole(ORG_A, 'comptable');
    await expectRepositoryError(repo.saveInvoice(ORG_A, invoiceInput()), 'forbidden');
  });
});

describe('cycle de vie des factures', () => {
  it('crée un brouillon, l’exclut du CA puis l’intègre après émission', async () => {
    const period = defaultPeriod(todayISO());
    const before = computeFinanceSummary(
      {
        invoices: await repo.listInvoices(ORG_A),
        payments: await repo.listPayments(ORG_A),
        purchases: await repo.listPurchases(ORG_A),
        expenses: await repo.listExpenses(ORG_A),
      },
      period,
    );

    const draft = await repo.saveInvoice(ORG_A, invoiceInput());
    expect(draft.status).toBe('draft');
    expect(draft.number).toBe('FACT-0011');

    const afterDraft = await repo.getServerSummary(ORG_A, period);
    expect(afterDraft.invoicedHt).toBe(before.revenue.netHt);
    expect(afterDraft.draftInvoicesCount).toBe(before.revenue.draftCount + 1);

    await repo.setInvoiceStatus(ORG_A, draft.id, 'sent');
    const afterEmit = await repo.getServerSummary(ORG_A, period);
    expect(afterEmit.invoicedHt).toBe(before.revenue.netHt + 5000);
    expect(afterEmit.draftInvoicesCount).toBe(before.revenue.draftCount);
  });

  it('rend une facture émise immutable', async () => {
    const draft = await repo.saveInvoice(ORG_A, invoiceInput());
    await repo.setInvoiceStatus(ORG_A, draft.id, 'sent');
    await expectRepositoryError(
      repo.saveInvoice(ORG_A, invoiceInput({ id: draft.id, items: [] })),
      'conflict',
    );
    await expectRepositoryError(repo.deleteInvoice(ORG_A, draft.id), 'forbidden');
  });

  it('numérote les avoirs séparément', async () => {
    const credit = await repo.saveInvoice(ORG_A, invoiceInput({ kind: 'credit_note' }));
    expect(credit.number).toBe('AV-0002');
    const invoice = await repo.saveInvoice(ORG_A, invoiceInput());
    expect(invoice.number).toBe('FACT-0011');
  });

  it('interdit la suppression d’une facture émise', async () => {
    await expectRepositoryError(repo.deleteInvoice(ORG_A, 'inv-2'), 'forbidden');
  });

  it('supprime un brouillon', async () => {
    await repo.deleteInvoice(ORG_A, 'inv-4');
    const invoices = await repo.listInvoices(ORG_A);
    expect(invoices.some((invoice) => invoice.id === 'inv-4')).toBe(false);
  });

  it('interdit d’annuler une facture encaissée', async () => {
    await expectRepositoryError(repo.setInvoiceStatus(ORG_A, 'inv-1', 'cancelled'), 'conflict');
  });

  it('annule une facture non encaissée et l’exclut du CA', async () => {
    await repo.setInvoiceStatus(ORG_A, 'inv-3', 'cancelled');
    const invoices = await repo.listInvoices(ORG_A);
    const cancelled = invoices.find((invoice) => invoice.id === 'inv-3');
    expect(cancelled?.status).toBe('cancelled');
    expect(isConfirmedInvoice(cancelled!)).toBe(false);
  });

  it('refuse de fixer manuellement un statut payé', async () => {
    await expectRepositoryError(repo.setInvoiceStatus(ORG_A, 'inv-3', 'paid'), 'validation');
  });
});

describe('paiements partiels', () => {
  it('met à jour le statut et le reste à payer', async () => {
    await repo.recordPayment(ORG_A, {
      invoiceId: 'inv-3',
      amount: 30000,
      method: 'wave',
      paidAt: todayISO(),
    });
    let invoice = (await repo.listInvoices(ORG_A)).find((item) => item.id === 'inv-3');
    expect(invoice?.amountPaid).toBe(30000);
    expect(invoice?.amountDue).toBeCloseTo(89680 - 30000, 2);
    expect(invoice?.status).toBe('partial');

    await repo.recordPayment(ORG_A, {
      invoiceId: 'inv-3',
      amount: 59680,
      method: 'virement',
      paidAt: todayISO(),
    });
    invoice = (await repo.listInvoices(ORG_A)).find((item) => item.id === 'inv-3');
    expect(invoice?.amountDue).toBe(0);
    expect(invoice?.status).toBe('paid');
  });

  it('refuse un paiement supérieur au reste à payer', async () => {
    await expectRepositoryError(
      repo.recordPayment(ORG_A, {
        invoiceId: 'inv-3',
        amount: 89681,
        method: 'wave',
        paidAt: todayISO(),
      }),
      'validation',
    );
  });

  it('refuse d’encaisser un brouillon, une annulée ou un avoir', async () => {
    const today = todayISO();
    await expectRepositoryError(
      repo.recordPayment(ORG_A, { invoiceId: 'inv-4', amount: 1000, method: 'especes', paidAt: today }),
      'validation',
    );
    await expectRepositoryError(
      repo.recordPayment(ORG_A, { invoiceId: 'inv-5', amount: 1000, method: 'especes', paidAt: today }),
      'validation',
    );
    await expectRepositoryError(
      repo.recordPayment(ORG_A, { invoiceId: 'inv-6', amount: 1000, method: 'especes', paidAt: today }),
      'validation',
    );
  });

  it('refuse un montant nul ou négatif', async () => {
    await expectRepositoryError(
      repo.recordPayment(ORG_A, { invoiceId: 'inv-3', amount: 0, method: 'wave', paidAt: todayISO() }),
      'validation',
    );
  });
});

describe('achats et dépenses', () => {
  it('recalcule le total d’un achat et son reste à payer', async () => {
    const purchase = await repo.createPurchase(
      ORG_A,
      purchaseInput({ quantity: 3, unitPrice: 2500, amountPaid: 5000 }),
    );
    expect(purchase.totalAmount).toBe(7500);
    expect(purchase.amountDue).toBe(2500);
    expect(purchase.isCogs).toBe(true);
  });

  it('refuse un montant payé supérieur au total', async () => {
    await expectRepositoryError(
      repo.createPurchase(ORG_A, purchaseInput({ quantity: 1, unitPrice: 1000, amountPaid: 2000 })),
      'validation',
    );
  });

  it('refuse une date d’achat future', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    await expectRepositoryError(
      repo.createPurchase(ORG_A, purchaseInput({ purchaseDate: future.toISOString().slice(0, 10) })),
      'validation',
    );
  });

  it('met à jour un achat existant', async () => {
    const purchase = await repo.createPurchase(ORG_A, purchaseInput());
    const updated = await repo.updatePurchase(
      ORG_A,
      purchase.id,
      purchaseInput({ quantity: 4, unitPrice: 3000, amountPaid: 12000 }),
    );
    expect(updated.totalAmount).toBe(12000);
    expect(updated.amountDue).toBe(0);
  });

  it('crée et supprime une dépense avec les bons droits', async () => {
    const expense = await repo.createExpense(ORG_A, {
      expenseDate: todayISO(),
      category: 'electricite_internet',
      description: 'Facture Sénélec',
      amount: 35000,
      reference: 'SEN-1',
      notes: null,
    });
    expect(expense.amount).toBe(35000);
    await repo.deleteExpense(ORG_A, expense.id);
    const expenses = await repo.listExpenses(ORG_A);
    expect(expenses.some((item) => item.id === expense.id)).toBe(false);
  });
});

describe('journal et agrégats', () => {
  it('exclut les brouillons du journal', async () => {
    const period = defaultPeriod(todayISO());
    const journal = await repo.listJournal(ORG_A, period);
    expect(journal.some((row) => row.reference === 'FACT-0004')).toBe(false);
    expect(journal.some((row) => row.reference === 'FACT-0005')).toBe(false);
    expect(journal.every((row) => row.occurredOn >= period.start && row.occurredOn <= period.end)).toBe(true);
  });

  it('renvoie les mêmes agrégats que le moteur de calcul', async () => {
    const period = defaultPeriod(todayISO());
    const [invoices, payments, purchases, expenses] = await Promise.all([
      repo.listInvoices(ORG_A),
      repo.listPayments(ORG_A),
      repo.listPurchases(ORG_A),
      repo.listExpenses(ORG_A),
    ]);
    const engine = computeFinanceSummary({ invoices, payments, purchases, expenses }, period);
    const server = await repo.getServerSummary(ORG_A, period);
    expect(server.invoicedHt).toBe(engine.revenue.netHt);
    expect(server.cashIn).toBe(engine.cashIn);
    expect(server.cashOut).toBe(engine.cashOut);
    expect(server.purchasesTotal).toBe(engine.purchasesTotal);
    expect(server.expensesTotal).toBe(engine.expensesTotal);
    expect(server.outstanding).toBe(engine.revenue.outstanding);
    expect(server.estimatedResult).toBe(engine.estimatedResult);
    expect(server.cogsAvailable).toBe(engine.cogsAvailable);
  });
});
