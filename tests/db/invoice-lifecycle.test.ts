/**
 * Invariants de la base : calculs serveur, immutabilité des factures émises,
 * transitions de statut, paiements partiels, contraintes de montants.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  asSuperuser,
  asUser,
  createInvoiceAsOwner,
  createTestDatabase,
  seedOrganizations,
  USER_OWNER,
  type SeedResult,
} from './helpers';

let db: PGlite;
let seed: SeedResult;

beforeAll(async () => {
  db = await createTestDatabase();
  seed = await seedOrganizations(db);
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await asUser(db, USER_OWNER);
});

async function invoiceRow(invoiceId: string) {
  const result = await db.query<{
    status: string;
    subtotal_ht: string;
    discount_total: string;
    net_ht: string;
    tax_total: string;
    total_ttc: string;
    amount_paid: string;
    amount_due: string;
  }>('select * from invoices where id = $1', [invoiceId]);
  return result.rows[0];
}

describe('calculs de facture côté serveur', () => {
  it('calcule les totaux à partir des lignes, remise et TVA comprises', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-17',
      discountType: 'percent',
      discountValue: 5,
      emit: false,
      items: [
        { description: 'Lot', quantity: 10, unitPrice: 8000, taxRate: 18 },
        { description: 'Livraison', quantity: 1, unitPrice: 3000, taxRate: 0 },
      ],
    });

    const row = await invoiceRow(invoice.id);
    expect(Number(row.subtotal_ht)).toBe(83000);
    expect(Number(row.discount_total)).toBe(4150);
    expect(Number(row.net_ht)).toBe(78850);
    // TVA calculée sur chaque ligne nette : 80000 → 76000 × 18 % = 13 680.
    expect(Number(row.tax_total)).toBe(13680);
    expect(Number(row.total_ttc)).toBe(92530);
    expect(Number(row.amount_due)).toBe(92530);
    expect(row.status).toBe('draft');
  });

  it('ignore les totaux envoyés par le navigateur et normalise un statut payé', async () => {
    const inserted = await db.query<{
      id: string;
      status: string;
      subtotal_ht: string;
      total_ttc: string;
      amount_paid: string;
    }>(
      `insert into invoices
        (organization_id, client_id, kind, status, issue_date, subtotal_ht, total_ttc, amount_paid)
       values ($1, $2, 'invoice', 'paid', '2026-10-20', 888888, 999999, 999999)
       returning id, status, subtotal_ht, total_ttc, amount_paid`,
      [seed.orgA, seed.clientA],
    );
    const row = inserted.rows[0];
    expect(row.status).toBe('draft');
    expect(Number(row.subtotal_ht)).toBe(0);
    expect(Number(row.total_ttc)).toBe(0);
    expect(Number(row.amount_paid)).toBe(0);
  });

  it('génère une numérotation séquentielle par organisation, avoirs séparés', async () => {
    const first = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-01',
      items: [{ description: 'A', quantity: 1, unitPrice: 1000 }],
    });
    const second = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-02',
      items: [{ description: 'B', quantity: 1, unitPrice: 1000 }],
    });
    expect(first.number).toMatch(/^FACT-\d{4}$/);
    expect(second.number).toMatch(/^FACT-\d{4}$/);
    const firstValue = Number(first.number.split('-')[1]);
    const secondValue = Number(second.number.split('-')[1]);
    expect(secondValue).toBe(firstValue + 1);

    const credit = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-03',
      kind: 'credit_note',
      items: [{ description: 'Retour', quantity: 1, unitPrice: 500 }],
    });
    expect(credit.number).toMatch(/^AV-\d{4}$/);
  });

  it('refuse une quantité nulle ou une remise hors bornes', async () => {
    const draft = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-04',
      emit: false,
      items: [{ description: 'Ligne', quantity: 1, unitPrice: 1000 }],
    });

    await expect(
      db.query(
        `insert into invoice_items (invoice_id, organization_id, description, quantity, unit_price)
         values ($1, $2, 'Zéro', 0, 1000)`,
        [draft.id, seed.orgA],
      ),
    ).rejects.toThrow();

    await expect(
      db.query(
        `insert into invoice_items
          (invoice_id, organization_id, description, quantity, unit_price, discount_percent)
         values ($1, $2, 'Remise', 1, 1000, 150)`,
        [draft.id, seed.orgA],
      ),
    ).rejects.toThrow();
  });
});

describe('émission et immutabilité', () => {
  it('refuse de fixer manuellement le statut payé', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-05',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 5000 }],
    });
    await expect(
      db.query("update invoices set status = 'paid' where id = $1", [invoice.id]),
    ).rejects.toThrow(/paiements/);
  });

  it('protège les colonnes calculées lors d’une mise à jour', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-06',
      items: [{ description: 'Facture', quantity: 2, unitPrice: 5000 }],
    });
    await asSuperuser(db);
    await db.query('update invoices set subtotal_ht = 1, total_ttc = 1 where id = $1', [invoice.id]);
    const row = await invoiceRow(invoice.id);
    expect(Number(row.subtotal_ht)).toBe(10000);
    expect(Number(row.total_ttc)).toBe(10000);
    await asUser(db, USER_OWNER);
  });

  it('interdit à un utilisateur authentifié de modifier un total', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-07',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 5000 }],
    });
    await expect(
      db.query('update invoices set total_ttc = 1 where id = $1', [invoice.id]),
    ).rejects.toThrow();
  });

  it('rend les lignes immutables après émission', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-08',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 5000 }],
    });
    await asSuperuser(db);
    await expect(
      db.query('update invoice_items set quantity = 9 where invoice_id = $1', [invoice.id]),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query('delete from invoice_items where invoice_id = $1', [invoice.id]),
    ).rejects.toThrow(/immutable/);
    await asUser(db, USER_OWNER);
  });
});

describe('paiements', () => {
  it('passe de émise à partielle puis payée, et calcule le reste', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-09',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 20000 }],
    });

    await db.query(
      `insert into payments (organization_id, invoice_id, amount, method, paid_at)
       values ($1, $2, 8000, 'wave', '2026-10-10')`,
      [seed.orgA, invoice.id],
    );
    let row = await invoiceRow(invoice.id);
    expect(row.status).toBe('partial');
    expect(Number(row.amount_paid)).toBe(8000);
    expect(Number(row.amount_due)).toBe(12000);

    await db.query(
      `insert into payments (organization_id, invoice_id, amount, method, paid_at)
       values ($1, $2, 12000, 'especes', '2026-10-11')`,
      [seed.orgA, invoice.id],
    );
    row = await invoiceRow(invoice.id);
    expect(row.status).toBe('paid');
    expect(Number(row.amount_paid)).toBe(20000);
    expect(Number(row.amount_due)).toBe(0);
  });

  it('refuse un paiement supérieur au reste à payer', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-12',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 10000 }],
    });
    await expect(
      db.query(
        `insert into payments (organization_id, invoice_id, amount, method, paid_at)
         values ($1, $2, 10001, 'wave', '2026-10-13')`,
        [seed.orgA, invoice.id],
      ),
    ).rejects.toThrow(/dépasse/);
  });

  it('refuse d’encaisser un brouillon', async () => {
    const draft = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-14',
      emit: false,
      items: [{ description: 'Brouillon', quantity: 1, unitPrice: 5000 }],
    });
    await expect(
      db.query(
        `insert into payments (organization_id, invoice_id, amount, method, paid_at)
         values ($1, $2, 1000, 'wave', '2026-10-14')`,
        [seed.orgA, draft.id],
      ),
    ).rejects.toThrow(/Émettez/);
  });

  it('refuse d’encaisser un avoir', async () => {
    const credit = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-15',
      kind: 'credit_note',
      items: [{ description: 'Avoir', quantity: 1, unitPrice: 2000 }],
    });
    await expect(
      db.query(
        `insert into payments (organization_id, invoice_id, amount, method, paid_at)
         values ($1, $2, 1000, 'wave', '2026-10-15')`,
        [seed.orgA, credit.id],
      ),
    ).rejects.toThrow(/avoir/);
  });

  it('refuse un montant nul ou négatif', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-16',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 5000 }],
    });
    await expect(
      db.query(
        `insert into payments (organization_id, invoice_id, amount, method, paid_at)
         values ($1, $2, 0, 'wave', '2026-10-16')`,
        [seed.orgA, invoice.id],
      ),
    ).rejects.toThrow();
  });
});

describe('annulation', () => {
  it('annule une facture non encaissée et bloque tout encaissement ultérieur', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-18',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 7000 }],
    });
    await db.query("update invoices set status = 'cancelled' where id = $1", [invoice.id]);
    const row = await invoiceRow(invoice.id);
    expect(row.status).toBe('cancelled');

    await expect(
      db.query(
        `insert into payments (organization_id, invoice_id, amount, method, paid_at)
         values ($1, $2, 1000, 'wave', '2026-10-19')`,
        [seed.orgA, invoice.id],
      ),
    ).rejects.toThrow(/annulée/);

    await expect(
      db.query("update invoices set status = 'sent' where id = $1", [invoice.id]),
    ).rejects.toThrow();
  });

  it('refuse d’annuler une facture déjà encaissée', async () => {
    const invoice = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-20',
      items: [{ description: 'Facture', quantity: 1, unitPrice: 5000 }],
    });
    await db.query(
      `insert into payments (organization_id, invoice_id, amount, method, paid_at)
       values ($1, $2, 5000, 'wave', '2026-10-20')`,
      [seed.orgA, invoice.id],
    );
    await expect(
      db.query("update invoices set status = 'cancelled' where id = $1", [invoice.id]),
    ).rejects.toThrow(/déjà encaissée/);
  });

  it('supprime un brouillon mais jamais une facture émise', async () => {
    const draft = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-21',
      emit: false,
      items: [{ description: 'Brouillon', quantity: 1, unitPrice: 1000 }],
    });
    const draftDelete = await db.query('delete from invoices where id = $1', [draft.id]);
    expect(draftDelete.affectedRows).toBe(1);

    const sent = await createInvoiceAsOwner(db, {
      organizationId: seed.orgA,
      clientId: seed.clientA,
      issueDate: '2026-10-22',
      items: [{ description: 'Émise', quantity: 1, unitPrice: 1000 }],
    });
    const sentDelete = await db.query('delete from invoices where id = $1', [sent.id]);
    expect(sentDelete.affectedRows).toBe(0);
  });
});

describe('achats, dépenses et organisation', () => {
  it('calcule total et reste à payer d’un achat, refuse le dépassement', async () => {
    const inserted = await db.query<{
      id: string;
      total_amount: string;
      amount_due: string;
      is_cogs: boolean;
    }>(
      `insert into purchases
        (organization_id, purchase_date, description, category, quantity, unit_price, amount_paid)
       values ($1, '2026-10-07', 'Marchandises', 'marchandises', 20, 4500, 60000)
       returning id, total_amount, amount_due, is_cogs`,
      [seed.orgA],
    );
    expect(Number(inserted.rows[0].total_amount)).toBe(90000);
    expect(Number(inserted.rows[0].amount_due)).toBe(30000);
    expect(inserted.rows[0].is_cogs).toBe(true);

    await expect(
      db.query(
        `insert into purchases
          (organization_id, purchase_date, description, category, quantity, unit_price, amount_paid)
         values ($1, '2026-10-07', 'Trop payé', 'marchandises', 1, 1000, 2000)`,
        [seed.orgA],
      ),
    ).rejects.toThrow(/dépasse/);
  });

  it('refuse une dépense de montant nul', async () => {
    await expect(
      db.query(
        `insert into expenses (organization_id, expense_date, category, description, amount)
         values ($1, '2026-10-07', 'loyer', 'Loyer', 0)`,
        [seed.orgA],
      ),
    ).rejects.toThrow();
  });

  it('rend l’organisation d’un achat immuable', async () => {
    const purchase = await db.query<{ id: string }>(
      `insert into purchases
        (organization_id, purchase_date, description, category, quantity, unit_price,
         amount_paid, supplier_name, supplier_invoice_number, notes)
       values ($1, '2026-10-07', 'Achat', 'fournitures', 1, 1000, 1000, 'F', 'R', 'N')
       returning id`,
      [seed.orgA],
    );
    await expect(
      db.query('update purchases set organization_id = $1 where id = $2', [
        seed.orgB,
        purchase.rows[0].id,
      ]),
    ).rejects.toThrow(/immuable/);
  });

  it('empêche de supprimer le dernier propriétaire', async () => {
    await asSuperuser(db);
    await expect(
      db.query("delete from organization_members where organization_id = $1 and role = 'owner'", [
        seed.orgA,
      ]),
    ).rejects.toThrow(/propriétaire/);
    await expect(
      db.query("update organization_members set role = 'admin' where organization_id = $1 and role = 'owner'", [
        seed.orgA,
      ]),
    ).rejects.toThrow(/propriétaire/);
    await asUser(db, USER_OWNER);
  });
});
