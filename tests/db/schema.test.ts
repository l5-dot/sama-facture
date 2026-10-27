/**
 * Vérifications statiques du schéma et de la sécurité déclarative.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createTestDatabase } from './helpers';

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.close();
});

describe('schéma', () => {
  it('active RLS sur toutes les tables métier', async () => {
    const result = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
       from pg_class
       where relnamespace = 'public'::regnamespace
         and relkind = 'r'
         and relname in ('organizations', 'organization_members', 'clients', 'products',
                         'invoices', 'invoice_items', 'payments', 'purchases', 'expenses',
                         'document_counters')
       order by relname`,
    );
    expect(result.rows).toHaveLength(10);
    for (const row of result.rows) {
      expect(row.relrowsecurity, `${row.relname} doit avoir RLS activé`).toBe(true);
    }
  });

  it('crée au moins une policy sur chaque table métier', async () => {
    const result = await db.query<{ tablename: string; count: number }>(
      `select tablename, count(*)::int as count
       from pg_policies
       where schemaname = 'public'
       group by tablename`,
    );
    const counts = Object.fromEntries(result.rows.map((row) => [row.tablename, row.count]));
    for (const table of [
      'organizations',
      'organization_members',
      'clients',
      'products',
      'invoices',
      'invoice_items',
      'payments',
      'purchases',
      'expenses',
    ]) {
      expect(counts[table], `${table} sans policy`).toBeGreaterThan(0);
    }
  });

  it('n’accorde aucune policy à anon', async () => {
    const result = await db.query<{ count: number }>(
      "select count(*)::int as count from pg_policies where 'anon' = any(roles)",
    );
    expect(result.rows[0].count).toBe(0);
  });

  it('stocke les montants en numeric(14,2)', async () => {
    const result = await db.query<{
      table_name: string;
      column_name: string;
      numeric_precision: number;
      numeric_scale: number;
    }>(
      `select table_name, column_name, numeric_precision, numeric_scale
       from information_schema.columns
       where table_schema = 'public'
         and table_name in ('invoices', 'invoice_items', 'payments', 'purchases', 'expenses', 'products')
         and data_type = 'numeric'
         and column_name in ('subtotal_ht', 'discount_total', 'net_ht', 'tax_total', 'total_ttc',
                             'amount_paid', 'amount_due', 'unit_price', 'amount', 'total_amount',
                             'discount_value', 'line_gross', 'line_subtotal_ht', 'line_tax',
                             'line_total_ttc', 'cost_price')`,
    );
    expect(result.rows.length).toBeGreaterThan(10);
    for (const row of result.rows) {
      expect(row.numeric_precision, `${row.table_name}.${row.column_name}`).toBe(14);
      expect(row.numeric_scale, `${row.table_name}.${row.column_name}`).toBe(2);
    }
  });

  it('calcule les colonnes dérivées des achats côté base', async () => {
    const result = await db.query<{ column_name: string; is_generated: string }>(
      `select column_name, is_generated
       from information_schema.columns
       where table_schema = 'public' and table_name = 'purchases'
         and column_name in ('total_amount', 'amount_due', 'is_cogs', 'is_capex')`,
    );
    expect(result.rows).toHaveLength(4);
    expect(result.rows.every((row) => row.is_generated === 'ALWAYS')).toBe(true);
  });

  it('expose une vue de journal respectant la RLS de l’appelant', async () => {
    const result = await db.query<{ reloptions: string[] | null }>(
      `select c.reloptions
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'v_finance_transactions'`,
    );
    expect(result.rows[0]?.reloptions).toContain('security_invoker=true');
  });

  it('protège les colonnes calculées des factures par privilèges de colonne', async () => {
    const result = await db.query<{ column_name: string }>(
      `select column_name
       from information_schema.column_privileges
       where grantee = 'authenticated'
         and table_schema = 'public'
         and table_name = 'invoices'
         and privilege_type = 'UPDATE'`,
    );
    const updatable = result.rows.map((row) => row.column_name);
    expect(updatable).toContain('status');
    expect(updatable).toContain('notes');
    expect(updatable).not.toContain('total_ttc');
    expect(updatable).not.toContain('amount_paid');
    expect(updatable).not.toContain('number');
  });

  it('révoque l’accès direct aux compteurs de numérotation', async () => {
    const result = await db.query<{ has_table_privilege: boolean }>(
      "select has_table_privilege('authenticated', 'public.document_counters', 'select') as has_table_privilege",
    );
    expect(result.rows[0].has_table_privilege).toBe(false);
  });
});

describe('migrations réversibles', () => {
  it('fournit un script de retour arrière documenté', () => {
    const down = readFileSync(
      join(process.cwd(), 'supabase', 'rollbacks', '20261027120100_finance_module.down.sql'),
      'utf8',
    );
    expect(down).toContain('drop view if exists public.v_finance_transactions');
    expect(down).toContain('drop table if exists public.purchases');
    expect(down).toContain('drop table if exists public.expenses');
    expect(down).toContain('drop function if exists public.finance_summary');
    expect(down).toContain('drop type if exists public.expense_category');
  });
});
