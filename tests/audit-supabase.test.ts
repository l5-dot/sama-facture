/**
 * Tests de l'audit d'intégration Supabase, sur un client simulé.
 *
 * L'audit réel se lance avec `npm run audit:supabase` sur un projet Supabase
 * (lecture seule). Ces tests garantissent que l'audit lui-même sait détecter
 * les deux risques qui nous intéressent : schéma non déployé et fuite entre
 * organisations.
 */

import { describe, expect, it } from 'vitest';
import {
  assertPublicKey,
  EXPECTED_TABLES,
  formatReport,
  runAudit,
  type AuditClient,
  type QueryResult,
} from '../scripts/audit-core.mjs';

type Row = Record<string, unknown>;

const OWNER_ORG = 'org-owner';
const OTHER_ORG = 'org-other';

function makeClient(options: {
  tables?: string[];
  organizations?: string[];
  memberOf?: string[];
  purchases?: Row[];
  summaryError?: { message: string; code?: string } | null;
}): AuditClient {
  const tables = options.tables ?? [...EXPECTED_TABLES];
  const memberOf = options.memberOf ?? [OWNER_ORG];
  // Par défaut, la RLS est saine : on ne voit que les organisations dont on est membre.
  const organizations = options.organizations ?? memberOf;

  const missing = (table: string): QueryResult<Row> => ({
    data: null,
    error: { message: `relation "public.${table}" does not exist`, code: '42P01' },
  });

  return {
    async selectRows<T>(table: string): Promise<QueryResult<T>> {
      if (table === 'document_counters') {
        return { data: null, error: { message: 'permission denied for table document_counters' } };
      }
      if (!tables.includes(table)) return missing(table) as QueryResult<T>;
      if (table === 'organizations') {
        return { data: organizations.map((id) => ({ id })) as unknown as T[], error: null };
      }
      if (table === 'purchases') {
        return { data: (options.purchases ?? []) as unknown as T[], error: null };
      }
      return { data: [], error: null };
    },
    async summary(organizationId: string): Promise<QueryResult<Row>> {
      if (!tables.includes('purchases')) {
        return { data: null, error: { message: 'function finance_summary does not exist' } };
      }
      if (options.summaryError) return { data: null, error: options.summaryError };
      return {
        data: [
          {
            organization_id: organizationId,
            invoiced_ht: '128000',
            cash_in: '85000',
            cash_out: '400000',
            purchases_total: '355000',
            expenses_total: '225000',
            estimated_result: '-202000',
          },
        ],
        error: null,
      };
    },
    async listOrganizations(): Promise<QueryResult<Row>> {
      if (!tables.includes('organization_members')) {
        return { data: null, error: { message: 'relation does not exist' } };
      }
      return {
        data: memberOf.map((organization_id) => ({ organization_id, role: 'owner' })),
        error: null,
      };
    },
  };
}

describe('audit Supabase', () => {
  it('valide un projet correctement migré et isolé', async () => {
    const report = await runAudit(makeClient({}), { today: new Date('2026-10-27T00:00:00Z') });
    expect(report.hasFailure).toBe(false);
    expect(report.checks.filter((check) => check.status === 'warn')).toHaveLength(0);
    expect(report.checks.find((check) => check.id === 'orgs:isolation')?.status).toBe('ok');
    expect(
      report.checks.filter((check) => check.id.startsWith('finance:summary')).length,
    ).toBe(1);
    expect(formatReport(report)).toContain('Audit concluant');
  });

  it('échoue clairement quand la migration Finances n’est pas appliquée', async () => {
    const tables = [...EXPECTED_TABLES].filter(
      (table) => table !== 'purchases' && table !== 'expenses' && table !== 'v_finance_transactions',
    );
    const report = await runAudit(makeClient({ tables }), {
      today: new Date('2026-10-27T00:00:00Z'),
    });
    expect(report.hasFailure).toBe(true);
    const details = report.checks.map((check) => check.detail).join(' ');
    expect(details).toContain('migrations');
    expect(details).toContain('finance_summary');
    expect(formatReport(report)).toContain('ne déployez pas');
  });

  it('signale une fuite de RLS sur la table organizations', async () => {
    const report = await runAudit(
      makeClient({ organizations: [OWNER_ORG, OTHER_ORG, 'org-tiers'], memberOf: [OWNER_ORG] }),
      { today: new Date('2026-10-27T00:00:00Z') },
    );
    const isolation = report.checks.find((check) => check.id === 'orgs:isolation');
    expect(isolation?.status).toBe('fail');
    expect(isolation?.detail).toContain('RLS');
    expect(report.hasFailure).toBe(true);
  });

  it('signale des achats visibles hors du périmètre du compte', async () => {
    const report = await runAudit(
      makeClient({
        memberOf: [OWNER_ORG],
        purchases: [{ organization_id: OWNER_ORG }, { organization_id: 'org-tiers' }],
      }),
      { today: new Date('2026-10-27T00:00:00Z') },
    );
    const isolation = report.checks.find((check) => check.id === 'purchases:isolation');
    expect(isolation?.status).toBe('fail');
  });

  it('traite l’absence d’organisation comme un avertissement, pas un succès', async () => {
    const report = await runAudit(makeClient({ memberOf: [] }), {
      today: new Date('2026-10-27T00:00:00Z'),
    });
    expect(report.checks.find((check) => check.id === 'orgs:list')?.status).toBe('warn');
    expect(report.checks.find((check) => check.id === 'finance:summary')?.status).toBe('warn');
  });

  it('refuse une clé service_role', () => {
    expect(() => assertPublicKey('sb_secret_abcdefghijklmnopqrstuvwxyz')).toThrow(/service_role/);
    expect(() => assertPublicKey('eyJhbGciOiJIUzI1NiJ9.service_role.signature')).toThrow(
      /service_role/,
    );
    expect(() => assertPublicKey('')).toThrow(/manquante/);
    expect(() => assertPublicKey('sb_publishable_abcdefghijklmnopqrstuvwxyz')).not.toThrow();
  });
});
