/**
 * Agrégats financiers calculés par PostgreSQL : mêmes règles que le moteur
 * client, mais sur les données faisant autorité.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  asAnon,
  asSuperuser,
  asUser,
  createInvoiceAsOwner,
  createTestDatabase,
  financeSummary,
  numeric,
  recordPaymentAsOwner,
  seedOrganizations,
  USER_OTHER,
  USER_OWNER,
  type SeedResult,
} from './helpers';
import { OCTOBER_EXPECTED } from '../fixtures';

let db: PGlite;
let seed: SeedResult;
let orgBoundary: string;

async function createPurchase(
  organizationId: string,
  values: {
    date: string;
    category: string;
    quantity: number;
    unitPrice: number;
    amountPaid: number;
  },
): Promise<void> {
  await asUser(db, USER_OWNER);
  await db.query(
    `insert into purchases
      (organization_id, supplier_name, purchase_date, description, category, quantity, unit_price, amount_paid)
     values ($1, 'Fournisseur test', $2, 'Achat test', $3, $4, $5, $6)`,
    [organizationId, values.date, values.category, values.quantity, values.unitPrice, values.amountPaid],
  );
}

async function createExpense(
  organizationId: string,
  date: string,
  category: string,
  amount: number,
): Promise<void> {
  await asUser(db, USER_OWNER);
  await db.query(
    `insert into expenses (organization_id, expense_date, category, description, amount)
     values ($1, $2, $3, 'Dépense test', $4)`,
    [organizationId, date, category, amount],
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  seed = await seedOrganizations(db);

  const invoice1 = await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-10-03',
    items: [
      { description: 'T-shirts', quantity: 2, unitPrice: 8000 },
      { description: 'Chaussures', quantity: 1, unitPrice: 19000 },
    ],
  });
  await recordPaymentAsOwner(db, seed.orgA, invoice1.id, 35000, '2026-10-05');

  const invoice2 = await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-10-09',
    items: [{ description: 'Sac', quantity: 1, unitPrice: 25000 }],
  });
  await recordPaymentAsOwner(db, seed.orgA, invoice2.id, 10000, '2026-10-11');

  await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-10-17',
    discountType: 'percent',
    discountValue: 5,
    items: [{ description: 'Lot grossiste', quantity: 10, unitPrice: 8000, taxRate: 18 }],
  });

  await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-10-24',
    emit: false,
    items: [{ description: 'Brouillon', quantity: 3, unitPrice: 8000 }],
  });

  const cancelled = await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-10-19',
    items: [{ description: 'Livraison', quantity: 1, unitPrice: 3000 }],
  });
  await asUser(db, USER_OWNER);
  await db.query("update invoices set status = 'cancelled' where id = $1", [cancelled.id]);

  await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-10-22',
    kind: 'credit_note',
    items: [{ description: 'Retour', quantity: 1, unitPrice: 8000 }],
  });

  const prior = await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-09-20',
    items: [{ description: 'Facture septembre', quantity: 1, unitPrice: 95000 }],
  });
  await recordPaymentAsOwner(db, seed.orgA, prior.id, 40000, '2026-10-14');

  await createPurchase(seed.orgA, {
    date: '2026-10-07',
    category: 'marchandises',
    quantity: 20,
    unitPrice: 4500,
    amountPaid: 60000,
  });
  await createPurchase(seed.orgA, {
    date: '2026-10-15',
    category: 'fournitures',
    quantity: 10,
    unitPrice: 1500,
    amountPaid: 15000,
  });
  await createPurchase(seed.orgA, {
    date: '2026-10-21',
    category: 'equipement',
    quantity: 1,
    unitPrice: 250000,
    amountPaid: 100000,
  });
  await createPurchase(seed.orgA, {
    date: '2026-11-02',
    category: 'marchandises',
    quantity: 5,
    unitPrice: 1000,
    amountPaid: 5000,
  });

  await createExpense(seed.orgA, '2026-10-01', 'loyer', 75000);
  await createExpense(seed.orgA, '2026-10-30', 'salaires', 150000);
  await createExpense(seed.orgA, '2026-11-01', 'transport', 10000);

  // Organisation dédiée aux bornes de période.
  await asUser(db, USER_OWNER);
  orgBoundary = (
    await db.query<{ id: string }>(
      "insert into organizations (name) values ('Organisation bornes') returning id",
    )
  ).rows[0].id;
  await createInvoiceAsOwner(db, {
    organizationId: orgBoundary,
    clientId: null,
    issueDate: '2026-10-31',
    items: [{ description: 'Dernier jour', quantity: 1, unitPrice: 10000 }],
  });
  await createInvoiceAsOwner(db, {
    organizationId: orgBoundary,
    clientId: null,
    issueDate: '2026-11-01',
    items: [{ description: 'Hors période', quantity: 1, unitPrice: 20000 }],
  });
});

afterAll(async () => {
  await db.close();
});

describe('finance_summary — octobre 2026', () => {
  it('reprend les agrégats attendus', async () => {
    await asUser(db, USER_OWNER);
    const summary = await financeSummary(db, seed.orgA, '2026-10-01', '2026-10-31');

    expect(numeric(summary.invoiced_ht)).toBe(OCTOBER_EXPECTED.invoicedHt);
    expect(numeric(summary.invoiced_tax)).toBe(OCTOBER_EXPECTED.invoicedTax);
    expect(numeric(summary.invoiced_ttc)).toBe(OCTOBER_EXPECTED.invoicedTtc);
    expect(numeric(summary.credited_ht)).toBe(OCTOBER_EXPECTED.creditedHt);
    expect(numeric(summary.collected_on_invoices)).toBe(OCTOBER_EXPECTED.paidOnIssued);
    expect(numeric(summary.outstanding)).toBe(OCTOBER_EXPECTED.outstanding);
    expect(numeric(summary.cash_in)).toBe(OCTOBER_EXPECTED.cashIn);
    expect(numeric(summary.purchases_total)).toBe(OCTOBER_EXPECTED.purchasesTotal);
    expect(numeric(summary.purchases_paid)).toBe(OCTOBER_EXPECTED.purchasesPaid);
    expect(numeric(summary.purchases_due)).toBe(OCTOBER_EXPECTED.purchasesDue);
    expect(numeric(summary.cogs_total)).toBe(OCTOBER_EXPECTED.cogsTotal);
    expect(numeric(summary.operating_purchases_total)).toBe(OCTOBER_EXPECTED.operatingPurchasesTotal);
    expect(numeric(summary.capex_total)).toBe(OCTOBER_EXPECTED.capexTotal);
    expect(numeric(summary.expenses_total)).toBe(OCTOBER_EXPECTED.expensesTotal);
    expect(numeric(summary.cash_out)).toBe(OCTOBER_EXPECTED.cashOut);
    expect(numeric(summary.net_cash)).toBe(OCTOBER_EXPECTED.netCash);
    expect(numeric(summary.gross_margin)).toBe(OCTOBER_EXPECTED.grossMargin);
    expect(numeric(summary.estimated_result)).toBe(OCTOBER_EXPECTED.estimatedResult);
    expect(Number(summary.draft_invoices_count)).toBe(OCTOBER_EXPECTED.draftCount);
    expect(numeric(summary.draft_invoices_total)).toBe(OCTOBER_EXPECTED.draftTtc);
    expect(Number(summary.cancelled_invoices_count)).toBe(OCTOBER_EXPECTED.cancelledCount);
    expect(numeric(summary.cancelled_invoices_total)).toBe(OCTOBER_EXPECTED.cancelledTtc);
    expect(summary.cogs_available).toBe(true);
    expect(summary.partial_estimate).toBe(false);
  });

  it('exclut réellement brouillons et annulées (pas seulement en apparence)', async () => {
    await asUser(db, USER_OWNER);
    const summary = await financeSummary(db, seed.orgA, '2026-10-01', '2026-10-31');
    // CA si l'on incluait brouillon (24 000) et annulée (3 000) : 155 000.
    expect(numeric(summary.invoiced_ht)).not.toBe(155000);
    expect(numeric(summary.invoiced_ht)).toBe(128000);

    const manual = await db.query<{ confirmed: string; drafts: string }>(
      `select
         coalesce(sum(case when status in ('sent','partial','paid') then
           case when kind = 'invoice' then net_ht else -net_ht end else 0 end), 0) as confirmed,
         coalesce(sum(case when status = 'draft' then total_ttc else 0 end), 0) as drafts
       from invoices
       where organization_id = $1 and issue_date between '2026-10-01' and '2026-10-31'`,
      [seed.orgA],
    );
    expect(numeric(manual.rows[0].confirmed)).toBe(128000);
    expect(numeric(manual.rows[0].drafts)).toBe(24000);
  });

  it('distingue trésorerie et résultat estimé', async () => {
    await asUser(db, USER_OWNER);
    const summary = await financeSummary(db, seed.orgA, '2026-10-01', '2026-10-31');
    expect(numeric(summary.net_cash)).toBe(-315000);
    expect(numeric(summary.estimated_result)).toBe(-202000);
    expect(numeric(summary.net_cash)).not.toBe(numeric(summary.estimated_result));
  });

  it('exclut les investissements du résultat estimé', async () => {
    await asUser(db, USER_OWNER);
    const summary = await financeSummary(db, seed.orgA, '2026-10-01', '2026-10-31');
    // Avec le capex (250 000), le résultat serait -452 000.
    expect(numeric(summary.estimated_result)).toBe(-202000);
    expect(numeric(summary.capex_total)).toBe(250000);
  });

  it('ne compte que les achats payés en trésorerie', async () => {
    await asUser(db, USER_OWNER);
    const summary = await financeSummary(db, seed.orgA, '2026-10-01', '2026-10-31');
    expect(numeric(summary.cash_out)).toBe(
      numeric(summary.purchases_paid) + numeric(summary.expenses_total),
    );
    expect(numeric(summary.cash_out)).toBe(400000);
  });

  it('respecte une période personnalisée et ses bornes', async () => {
    await asUser(db, USER_OWNER);
    const narrow = await financeSummary(db, seed.orgA, '2026-10-03', '2026-10-09');
    expect(numeric(narrow.invoiced_ht)).toBe(60000);
    expect(numeric(narrow.cash_in)).toBe(35000);
    expect(numeric(narrow.outstanding)).toBe(15000);
    // L'achat de marchandises du 07/10 (90 000) tombe dans la période étroite.
    expect(numeric(narrow.purchases_total)).toBe(90000);
    expect(Number(narrow.draft_invoices_count)).toBe(0);
    expect(narrow.cogs_available).toBe(true);
    expect(numeric(narrow.gross_margin)).toBe(-30000);
    // Aucune dépense sur la période alors qu'il y a du CA : estimation partielle.
    expect(narrow.partial_estimate).toBe(true);

    const boundary = await financeSummary(db, orgBoundary, '2026-10-01', '2026-10-31');
    expect(numeric(boundary.invoiced_ht)).toBe(10000);
  });

  it('signale une marge brute indisponible avec null', async () => {
    await asUser(db, USER_OWNER);
    const boundary = await financeSummary(db, orgBoundary, '2026-10-01', '2026-10-31');
    expect(boundary.gross_margin).toBeNull();
    expect(boundary.cogs_available).toBe(false);
  });

  it('refuse une période invalide', async () => {
    await asUser(db, USER_OWNER);
    await expect(financeSummary(db, seed.orgA, '2026-10-31', '2026-10-01')).rejects.toThrow();
  });

  it('refuse l’accès à une organisation dont on n’est pas membre', async () => {
    await asUser(db, USER_OTHER);
    await expect(financeSummary(db, seed.orgA, '2026-10-01', '2026-10-31')).rejects.toThrow(
      /Accès refusé/,
    );
  });

  it('refuse l’appel anonyme à la fonction financière', async () => {
    await asAnon(db);
    await expect(financeSummary(db, seed.orgA, '2026-10-01', '2026-10-31')).rejects.toThrow();
    await asSuperuser(db);
  });
});

describe('journal financier (vue)', () => {
  it('ne contient que les opérations confirmées et de la bonne organisation', async () => {
    await asUser(db, USER_OWNER);
    const journal = await db.query<{
      source: string;
      cash_in: string;
      cash_out: string;
      organization_id: string;
    }>(
      `select source, cash_in, cash_out, organization_id
       from v_finance_transactions
       where organization_id = $1
         and occurred_on between '2026-10-01' and '2026-10-31'`,
      [seed.orgA],
    );

    expect(journal.rows).toHaveLength(12);
    expect(journal.rows.every((row) => row.organization_id === seed.orgA)).toBe(true);
    const cashIn = journal.rows.reduce((acc, row) => acc + Number(row.cash_in), 0);
    const cashOut = journal.rows.reduce((acc, row) => acc + Number(row.cash_out), 0);
    expect(cashIn).toBe(85000);
    expect(cashOut).toBe(400000);
    expect(journal.rows.filter((row) => row.source === 'facture')).toHaveLength(3);
    expect(journal.rows.filter((row) => row.source === 'avoir')).toHaveLength(1);
    expect(journal.rows.filter((row) => row.source === 'paiement')).toHaveLength(3);
    expect(journal.rows.filter((row) => row.source === 'achat')).toHaveLength(3);
    expect(journal.rows.filter((row) => row.source === 'depense')).toHaveLength(2);
  });

  it('est isolée entre organisations', async () => {
    await asUser(db, USER_OTHER);
    const other = await db.query<{ count: number }>(
      'select count(*)::int as count from v_finance_transactions',
    );
    expect(other.rows[0].count).toBe(0);
    await asSuperuser(db);
  });
});
