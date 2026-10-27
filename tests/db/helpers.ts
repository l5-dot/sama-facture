/**
 * Base PostgreSQL réelle (PGlite) pour tester migrations, triggers et RLS.
 *
 * On reproduit le minimum de l'environnement Supabase : rôles `anon`,
 * `authenticated`, `service_role`, schéma `auth` et fonction `auth.uid()`
 * alimentée par `request.jwt.claim.sub`, comme PostgREST.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

export const MIGRATIONS = [
  '20261027120000_initial_schema.sql',
  '20261027120100_finance_module.sql',
] as const;

export async function createTestDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(`
    create role anon nologin noinherit;
    create role authenticated nologin noinherit;
    create role service_role nologin noinherit bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
  `);
  await db.query(
    `insert into auth.users (id, email) values
      ($1, 'owner@test.sn'), ($2, 'other@test.sn'), ($3, 'vendeur@test.sn'), ($4, 'comptable@test.sn')`,
    [USER_OWNER, USER_OTHER, USER_VENDEUR, USER_COMPTABLE],
  );

  const dir = join(process.cwd(), 'supabase', 'migrations');
  for (const file of MIGRATIONS) {
    await db.exec(readFileSync(join(dir, file), 'utf8'));
  }
  return db;
}

/** Repasse en superutilisateur (postgres) : bypass RLS, comme le SQL editor. */
export async function asSuperuser(db: PGlite): Promise<void> {
  await db.exec('reset role;');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
}

/** Simule une requête PostgREST authentifiée avec RLS. */
export async function asUser(db: PGlite, userId: string): Promise<void> {
  await db.exec('reset role;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.exec('set role authenticated;');
}

export async function asAnon(db: PGlite): Promise<void> {
  await db.exec('reset role;');
  await db.query("select set_config('request.jwt.claim.sub', '', false)");
  await db.exec('set role anon;');
}

export const USER_OWNER = '11111111-1111-4111-8111-111111111111';
export const USER_OTHER = '22222222-2222-4222-8222-222222222222';
export const USER_VENDEUR = '33333333-3333-4333-8333-333333333333';
export const USER_COMPTABLE = '44444444-4444-4444-8444-444444444444';

export interface SeedResult {
  orgA: string;
  orgB: string;
  clientA: string;
}

/** Crée deux organisations isolées et les membres de test. */
export async function seedOrganizations(db: PGlite): Promise<SeedResult> {
  await asUser(db, USER_OWNER);
  const orgA = (
    await db.query<{ id: string }>(
      "insert into organizations (name, currency) values ('Takhabouli Test', 'XOF') returning id",
    )
  ).rows[0].id;
  const clientA = (
    await db.query<{ id: string }>(
      'insert into clients (organization_id, name) values ($1, $2) returning id',
      [orgA, 'Client Test'],
    )
  ).rows[0].id;

  await asUser(db, USER_OTHER);
  const orgB = (
    await db.query<{ id: string }>(
      "insert into organizations (name, currency) values ('Autre Organisation', 'XOF') returning id",
    )
  ).rows[0].id;

  await asSuperuser(db);
  await db.query(
    `insert into organization_members (organization_id, user_id, role)
     values ($1, $2, 'vendeur'), ($1, $3, 'comptable')`,
    [orgA, USER_VENDEUR, USER_COMPTABLE],
  );

  return { orgA, orgB, clientA };
}

export interface InvoiceFixture {
  id: string;
  number: string;
  totalTtc: number;
}

interface CreateInvoiceOptions {
  organizationId: string;
  clientId: string | null;
  issueDate: string;
  items: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }>;
  discountType?: 'none' | 'percent' | 'fixed';
  discountValue?: number;
  kind?: 'invoice' | 'credit_note';
  emit?: boolean;
}

export async function createInvoiceAsOwner(
  db: PGlite,
  options: CreateInvoiceOptions,
): Promise<InvoiceFixture> {
  await asUser(db, USER_OWNER);
  const inserted = await db.query<{ id: string; number: string }>(
    `insert into invoices
      (organization_id, client_id, kind, status, issue_date, discount_type, discount_value)
     values ($1, $2, $3, 'draft', $4, $5, $6)
     returning id, number`,
    [
      options.organizationId,
      options.clientId,
      options.kind ?? 'invoice',
      options.issueDate,
      options.discountType ?? 'none',
      options.discountValue ?? 0,
    ],
  );
  const { id, number } = inserted.rows[0];

  for (const [index, item] of options.items.entries()) {
    await db.query(
      `insert into invoice_items
        (invoice_id, organization_id, description, quantity, unit_price, tax_rate, position)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        options.organizationId,
        item.description,
        item.quantity,
        item.unitPrice,
        item.taxRate ?? 0,
        index + 1,
      ],
    );
  }

  if (options.emit !== false) {
    await db.query("update invoices set status = 'sent' where id = $1", [id]);
  }

  const total = await db.query<{ total_ttc: string }>(
    'select total_ttc from invoices where id = $1',
    [id],
  );
  return { id, number, totalTtc: Number(total.rows[0].total_ttc) };
}

export async function recordPaymentAsOwner(
  db: PGlite,
  organizationId: string,
  invoiceId: string,
  amount: number,
  paidAt: string,
): Promise<void> {
  await asUser(db, USER_OWNER);
  await db.query(
    `insert into payments (organization_id, invoice_id, amount, method, paid_at)
     values ($1, $2, $3, 'wave', $4)`,
    [organizationId, invoiceId, amount, paidAt],
  );
}

export async function financeSummary(
  db: PGlite,
  organizationId: string,
  start: string,
  end: string,
): Promise<Record<string, string | boolean | number | null>> {
  const result = await db.query<Record<string, string | boolean | number | null>>(
    'select * from finance_summary($1, $2, $3)',
    [organizationId, start, end],
  );
  return result.rows[0];
}

export function numeric(value: string | number | boolean | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}
