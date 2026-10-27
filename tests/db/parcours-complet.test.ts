/**
 * Parcours complet, de bout en bout, dans PostgreSQL : facture → encaissement
 * partiel → solde → achat de marchandises → dépense de transport → indicateurs.
 *
 * Reprend l'exemple d'un commerçant :
 *   • 300 000 FCFA de marchandises,
 *   • 50 000 FCFA de transport,
 *   • 500 000 FCFA encaissés auprès des clients.
 *
 * L'objectif est de vérifier, étape par étape, que les indicateurs bougent au bon
 * endroit et que l'argent restant n'est jamais présenté comme un bénéfice.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  asUser,
  asSuperuser,
  createInvoiceAsOwner,
  createTestDatabase,
  financeSummary,
  numeric,
  recordPaymentAsOwner,
  seedOrganizations,
  USER_OWNER,
  type SeedResult,
} from './helpers';

const START = '2026-10-01';
const END = '2026-10-31';

let db: PGlite;
let seed: SeedResult;

async function summary() {
  await asUser(db, USER_OWNER);
  const row = await financeSummary(db, seed.orgA, START, END);
  await asSuperuser(db);
  return row;
}

async function addPurchase(input: {
  date: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  amountPaid: number;
}): Promise<string> {
  await asUser(db, USER_OWNER);
  const result = await db.query<{ id: string }>(
    `insert into purchases
      (organization_id, purchase_date, description, category, quantity, unit_price, amount_paid, payment_method)
     values ($1, $2, $3, $4::public.purchase_category, $5, $6, $7, 'wave')
     returning id`,
    [
      seed.orgA,
      input.date,
      input.description,
      input.category,
      input.quantity,
      input.unitPrice,
      input.amountPaid,
    ],
  );
  await asSuperuser(db);
  return result.rows[0].id;
}

async function addExpense(input: {
  date: string;
  category: string;
  description: string;
  amount: number;
}): Promise<string> {
  await asUser(db, USER_OWNER);
  const result = await db.query<{ id: string }>(
    `insert into expenses (organization_id, expense_date, category, description, amount)
     values ($1, $2, $3::public.expense_category, $4, $5)
     returning id`,
    [seed.orgA, input.date, input.category, input.description, input.amount],
  );
  await asSuperuser(db);
  return result.rows[0].id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  seed = await seedOrganizations(db);
});

afterAll(async () => {
  await db.close();
});

describe('parcours complet d’un commerçant', () => {
  it('1. facture émise : le CA apparaît, mais rien n’est encaissé', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-05',
      items: [{ description: 'Vente de tissus', quantity: 1, unitPrice: 500000 }],
    });
    expect(invoice.number).toBe('FACT-0001');
    expect(invoice.totalTtc).toBe(500000);

    const row = await summary();
    expect(numeric(row.invoiced_ht)).toBe(500000);
    expect(numeric(row.cash_in)).toBe(0);
    // L'argent est dû par le client, pas encore dans la caisse.
    expect(numeric(row.net_cash)).toBe(0);
    expect(numeric(row.outstanding)).toBe(500000);
    expect(numeric(row.estimated_result)).toBe(500000);
    expect(row.partial_estimate).toBe(true);
  });

  it('2. encaissement partiel : la trésorerie monte, le reste dû diminue', async () => {
    await asUser(db, USER_OWNER);
    const invoiceId = (
      await db.query<{ id: string }>("select id from invoices where number = 'FACT-0001'")
    ).rows[0].id;
    await asSuperuser(db);

    await recordPaymentAsOwner(db, seed.orgA, invoiceId, 300000, '2026-10-10');

    const row = await summary();
    expect(numeric(row.cash_in)).toBe(300000);
    expect(numeric(row.outstanding)).toBe(200000);
    expect(numeric(row.collected_on_invoices)).toBe(300000);
    expect(numeric(row.net_cash)).toBe(300000);

    await asUser(db, USER_OWNER);
    const status = await db.query<{ status: string }>('select status from invoices where id = $1', [
      invoiceId,
    ]);
    expect(status.rows[0].status).toBe('partial');
    await asSuperuser(db);
  });

  it('3. solde de la facture : elle passe en « payée » sans changer le CA', async () => {
    await asUser(db, USER_OWNER);
    const invoiceId = (
      await db.query<{ id: string }>("select id from invoices where number = 'FACT-0001'")
    ).rows[0].id;
    await asSuperuser(db);

    await recordPaymentAsOwner(db, seed.orgA, invoiceId, 200000, '2026-10-15');

    const row = await summary();
    expect(numeric(row.cash_in)).toBe(500000);
    expect(numeric(row.outstanding)).toBe(0);
    expect(numeric(row.invoiced_ht)).toBe(500000);
    expect(numeric(row.estimated_result)).toBe(500000); // CA inchangé

    await asUser(db, USER_OWNER);
    const status = await db.query<{ status: string; amount_due: string }>(
      'select status, amount_due from invoices where id = $1',
      [invoiceId],
    );
    expect(status.rows[0].status).toBe('paid');
    expect(Number(status.rows[0].amount_due)).toBe(0);
    await asSuperuser(db);
  });

  it('4. deuxième facture non payée : elle compte dans le CA et dans le reste à recevoir', async () => {
    await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-20',
      items: [{ description: 'Commande de couvertures', quantity: 1, unitPrice: 300000 }],
    });

    const row = await summary();
    expect(numeric(row.invoiced_ht)).toBe(800000);
    expect(numeric(row.cash_in)).toBe(500000);
    expect(numeric(row.outstanding)).toBe(300000);
    expect(numeric(row.net_cash)).toBe(500000);
  });

  it('5. achat de marchandises : il sort de la caisse et devient un coût', async () => {
    const purchaseId = await addPurchase({
      date: '2026-10-02',
      description: 'Lot de marchandises',
      category: 'marchandises',
      quantity: 1,
      unitPrice: 300000,
      amountPaid: 300000,
    });

    const row = await summary();
    expect(numeric(row.purchases_total)).toBe(300000);
    expect(numeric(row.purchases_paid)).toBe(300000);
    expect(numeric(row.purchases_due)).toBe(0);
    expect(numeric(row.cogs_total)).toBe(300000);
    expect(row.cogs_available).toBe(true);
    // 800 000 de CA − 300 000 de marchandises
    expect(numeric(row.gross_margin)).toBe(500000);
    // 500 000 encaissés − 300 000 d'achats payés
    expect(numeric(row.net_cash)).toBe(200000);
    expect(numeric(row.estimated_result)).toBe(500000);

    await asUser(db, USER_OWNER);
    const stored = await db.query<{ total: string; due: string; cogs: boolean }>(
      'select total_amount as total, amount_due as due, is_cogs as cogs from purchases where id = $1',
      [purchaseId],
    );
    expect(Number(stored.rows[0].total)).toBe(300000);
    expect(Number(stored.rows[0].due)).toBe(0);
    expect(stored.rows[0].cogs).toBe(true);
    await asSuperuser(db);
  });

  it('6. dépense de transport : elle ne double pas l’achat et pèse sur le résultat', async () => {
    await addExpense({
      date: '2026-10-03',
      category: 'transport',
      description: 'Transport des marchandises',
      amount: 50000,
    });

    const row = await summary();
    expect(numeric(row.expenses_total)).toBe(50000);
    expect(numeric(row.purchases_total)).toBe(300000); // pas de double comptage
    expect(numeric(row.cash_out)).toBe(350000); // 300 000 d'achat + 50 000 de transport
    expect(numeric(row.net_cash)).toBe(150000);
    expect(numeric(row.estimated_result)).toBe(450000); // 800 000 − 300 000 − 50 000
    expect(numeric(row.gross_margin)).toBe(500000);
    expect(row.partial_estimate).toBe(false);
  });

  it('7. l’argent restant n’est pas un bénéfice : trésorerie, créances et résultat restent distincts', async () => {
    const row = await summary();
    const netCash = numeric(row.net_cash);
    const result = numeric(row.estimated_result);
    const receivable = numeric(row.outstanding);

    expect(netCash).toBe(150000);
    expect(result).toBe(450000);
    expect(receivable).toBe(300000);
    // 150 000 en caisse ≠ 450 000 de résultat : 300 000 sont encore chez les clients.
    expect(netCash).not.toBe(result);
    expect(netCash + receivable).toBe(result);
    expect(row.partial_estimate).toBe(false);
  });

  it('8. le journal retrace chaque opération avec les bons impacts', async () => {
    await asUser(db, USER_OWNER);
    const rows = await db.query<{
      source: string;
      reference: string;
      amount_ht: string;
      cash_in: string;
      cash_out: string;
    }>(
      `select source, reference, amount_ht, cash_in, cash_out
       from v_finance_transactions
       where organization_id = $1 and occurred_on between $2 and $3
       order by occurred_on`,
      [seed.orgA, START, END],
    );
    await asSuperuser(db);

    expect(rows.rows).toHaveLength(6); // 2 factures + 2 paiements + 1 achat + 1 dépense

    const factures = rows.rows.filter((r) => r.source === 'facture');
    expect(factures.map((r) => r.reference).sort()).toEqual(['FACT-0001', 'FACT-0002']);
    expect(numeric(factures[0].amount_ht)).toBe(500000);

    const paiements = rows.rows.filter((r) => r.source === 'paiement');
    expect(paiements).toHaveLength(2);
    expect(paiements.reduce((sum, r) => sum + numeric(r.cash_in), 0)).toBe(500000);

    const achats = rows.rows.filter((r) => r.source === 'achat');
    expect(achats).toHaveLength(1);
    expect(numeric(achats[0].cash_out)).toBe(300000);

    const depenses = rows.rows.filter((r) => r.source === 'depense');
    expect(depenses).toHaveLength(1);
    expect(numeric(depenses[0].cash_out)).toBe(50000);
  });

  it('9. une facture brouillon créée maintenant ne fausse pas les indicateurs', async () => {
    const before = await summary();

    await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-27',
      emit: false,
      items: [{ description: 'Devis en attente', quantity: 1, unitPrice: 100000 }],
    });

    const after = await summary();
    expect(numeric(after.invoiced_ht)).toBe(numeric(before.invoiced_ht));
    expect(Number(after.draft_invoices_count)).toBe(1);
    expect(numeric(after.draft_invoices_total)).toBe(100000);
    expect(numeric(after.outstanding)).toBe(numeric(before.outstanding));
  });
});
