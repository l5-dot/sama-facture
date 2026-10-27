/**
 * Isolation multi-tenant et permissions RLS : les rôles de l'application sont
 * testés avec les vrais rôles PostgreSQL (`authenticated`, `anon`).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import {
  asAnon,
  asSuperuser,
  asUser,
  createInvoiceAsOwner,
  createTestDatabase,
  seedOrganizations,
  USER_COMPTABLE,
  USER_OTHER,
  USER_OWNER,
  USER_VENDEUR,
  type SeedResult,
} from './helpers';

let db: PGlite;
let seed: SeedResult;
let orgBInvoiceId: string;
let orgAInvoiceId: string;

async function countAsUser(userId: string, sql: string, params: unknown[] = []): Promise<number> {
  await asUser(db, userId);
  const result = await db.query<{ count: number }>(sql, params);
  return Number(result.rows[0].count);
}

beforeAll(async () => {
  db = await createTestDatabase();
  seed = await seedOrganizations(db);

  const invoiceA = await createInvoiceAsOwner(db, {
    organizationId: seed.orgA,
    clientId: seed.clientA,
    issueDate: '2026-10-05',
    items: [{ description: 'Facture A', quantity: 1, unitPrice: 10000 }],
  });
  orgAInvoiceId = invoiceA.id;

  await asUser(db, USER_OTHER);
  const invoiceB = await db.query<{ id: string }>(
    `insert into invoices (organization_id, issue_date) values ($1, '2026-10-05') returning id`,
    [seed.orgB],
  );
  orgBInvoiceId = invoiceB.rows[0].id;
  await db.query(
    `insert into invoice_items (invoice_id, organization_id, description, quantity, unit_price)
     values ($1, $2, 'Ligne B', 1, 5000)`,
    [orgBInvoiceId, seed.orgB],
  );
  await asSuperuser(db);
});

afterAll(async () => {
  await db.close();
});

describe('isolation entre organisations', () => {
  it('ne laisse pas un membre voir les données d’une autre organisation', async () => {
    expect(
      await countAsUser(USER_OTHER, 'select count(*)::int as count from invoices where organization_id = $1', [
        seed.orgA,
      ]),
    ).toBe(0);
    expect(
      await countAsUser(USER_OTHER, 'select count(*)::int as count from purchases where organization_id = $1', [
        seed.orgA,
      ]),
    ).toBe(0);
    expect(
      await countAsUser(USER_OTHER, 'select count(*)::int as count from expenses where organization_id = $1', [
        seed.orgA,
      ]),
    ).toBe(0);
    expect(
      await countAsUser(USER_OTHER, 'select count(*)::int as count from payments where organization_id = $1', [
        seed.orgA,
      ]),
    ).toBe(0);
    expect(
      await countAsUser(USER_OTHER, 'select count(*)::int as count from clients where organization_id = $1', [
        seed.orgA,
      ]),
    ).toBe(0);
  });

  it('ne laisse pas voir le journal financier d’une autre organisation', async () => {
    expect(
      await countAsUser(
        USER_OTHER,
        'select count(*)::int as count from v_finance_transactions where organization_id = $1',
        [seed.orgA],
      ),
    ).toBe(0);
  });

  it('ne laisse voir que ses propres adhésions', async () => {
    await asSuperuser(db);
    const all = await db.query<{ organization_id: string }>(
      'select organization_id from organization_members',
    );
    await asUser(db, USER_OTHER);
    const visible = await db.query<{ organization_id: string }>(
      'select organization_id from organization_members',
    );
    expect(all.rows.length).toBeGreaterThan(visible.rows.length);
    expect(visible.rows).toHaveLength(1);
    expect(visible.rows.every((row) => row.organization_id === seed.orgB)).toBe(true);
    await asSuperuser(db);
  });

  it('refuse une insertion dans une organisation tierce', async () => {
    await asUser(db, USER_OTHER);
    await expect(
      db.query(
        `insert into invoices (organization_id, issue_date) values ($1, '2026-10-06')`,
        [seed.orgA],
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      db.query(
        `insert into purchases
          (organization_id, purchase_date, description, category, quantity, unit_price)
         values ($1, '2026-10-06', 'Intrusion', 'marchandises', 1, 1000)`,
        [seed.orgA],
      ),
    ).rejects.toThrow(/row-level security/);
    await asSuperuser(db);
  });

  it('refuse une ligne de facture rattachée à une autre organisation', async () => {
    await asUser(db, USER_OWNER);
    await expect(
      db.query(
        `insert into invoice_items (invoice_id, organization_id, description, quantity, unit_price)
         values ($1, $2, 'Intrusion', 1, 1000)`,
        [orgBInvoiceId, seed.orgA],
      ),
    ).rejects.toThrow();
    await asSuperuser(db);
  });

  it('ne modifie pas les données d’une autre organisation', async () => {
    await asUser(db, USER_OWNER);
    const update = await db.query("update clients set name = 'Piraté' where organization_id = $1", [
      seed.orgB,
    ]);
    expect(update.affectedRows).toBe(0);
    await asSuperuser(db);
  });
});

describe('permissions des rôles', () => {
  it('autorise le vendeur à créer une facture mais pas à toucher à la caisse', async () => {
    await asUser(db, USER_VENDEUR);
    const created = await db.query<{ id: string }>(
      `insert into invoices (organization_id, issue_date) values ($1, '2026-10-10') returning id`,
      [seed.orgA],
    );
    expect(created.rows).toHaveLength(1);

    await expect(
      db.query(
        `insert into purchases
          (organization_id, purchase_date, description, category, quantity, unit_price)
         values ($1, '2026-10-10', 'Achat vendeur', 'marchandises', 1, 1000)`,
        [seed.orgA],
      ),
    ).rejects.toThrow(/row-level security/);

    await expect(
      db.query(
        `insert into expenses (organization_id, expense_date, category, description, amount)
         values ($1, '2026-10-10', 'transport', 'Dépense vendeur', 1000)`,
        [seed.orgA],
      ),
    ).rejects.toThrow(/row-level security/);
    await asSuperuser(db);
  });

  it('interdit au comptable de créer une facture', async () => {
    await asUser(db, USER_COMPTABLE);
    await expect(
      db.query(`insert into invoices (organization_id, issue_date) values ($1, '2026-10-11')`, [
        seed.orgA,
      ]),
    ).rejects.toThrow(/row-level security/);
    await asSuperuser(db);
  });

  it('autorise le comptable à saisir achats et dépenses mais pas à les supprimer', async () => {
    await asUser(db, USER_COMPTABLE);
    const purchase = await db.query<{ id: string }>(
      `insert into purchases
        (organization_id, purchase_date, description, category, quantity, unit_price, amount_paid)
       values ($1, '2026-10-11', 'Achat comptable', 'fournitures', 2, 1500, 3000)
       returning id`,
      [seed.orgA],
    );
    const expense = await db.query<{ id: string }>(
      `insert into expenses (organization_id, expense_date, category, description, amount)
       values ($1, '2026-10-11', 'electricite_internet', 'Dépense comptable', 5000)
       returning id`,
      [seed.orgA],
    );

    const purchaseDelete = await db.query('delete from purchases where id = $1', [
      purchase.rows[0].id,
    ]);
    const expenseDelete = await db.query('delete from expenses where id = $1', [expense.rows[0].id]);
    expect(purchaseDelete.affectedRows).toBe(0);
    expect(expenseDelete.affectedRows).toBe(0);

    await asUser(db, USER_OWNER);
    const ownerDelete = await db.query('delete from purchases where id = $1', [
      purchase.rows[0].id,
    ]);
    expect(ownerDelete.affectedRows).toBe(1);
    await asSuperuser(db);
  });

  it('autorise le comptable à encaisser, pas le vendeur', async () => {
    await asUser(db, USER_COMPTABLE);
    await db.query(
      `insert into payments (organization_id, invoice_id, amount, method, paid_at)
       values ($1, $2, 1000, 'wave', '2026-10-12')`,
      [seed.orgA, orgAInvoiceId],
    );

    await asUser(db, USER_VENDEUR);
    await expect(
      db.query(
        `insert into payments (organization_id, invoice_id, amount, method, paid_at)
         values ($1, $2, 1000, 'wave', '2026-10-12')`,
        [seed.orgA, orgAInvoiceId],
      ),
    ).rejects.toThrow(/row-level security/);
    await asSuperuser(db);
  });

  it('n’expose pas les compteurs de numérotation', async () => {
    await asUser(db, USER_OWNER);
    // Aucun privilège accordé : l'accès est refusé avant même la RLS.
    await expect(db.query('select count(*) from document_counters')).rejects.toThrow(
      /permission denied/,
    );
    await asSuperuser(db);
  });

  it('refuse tout accès anonyme aux tables financières', async () => {
    await asAnon(db);
    await expect(db.query('select count(*) from invoices')).rejects.toThrow();
    await expect(db.query('select count(*) from purchases')).rejects.toThrow();
    await expect(db.query('select count(*) from expenses')).rejects.toThrow();
    await expect(db.query('select count(*) from v_finance_transactions')).rejects.toThrow();
    await asSuperuser(db);
  });

  it('ne laisse pas un membre d’une autre organisation lire les agrégats financiers', async () => {
    await asUser(db, USER_OTHER);
    await expect(
      db.query("select * from finance_summary($1, '2026-10-01', '2026-10-31')", [seed.orgA]),
    ).rejects.toThrow(/Accès refusé/);
    await asSuperuser(db);
  });
});
