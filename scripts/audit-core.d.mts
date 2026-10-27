/** Déclarations pour le module d'audit Supabase (JavaScript pur, testé par Vitest). */

export type AuditStatus = 'ok' | 'warn' | 'fail';

export interface AuditCheck {
  id: string;
  label: string;
  status: AuditStatus;
  detail: string;
}

export interface AuditReport {
  checks: AuditCheck[];
  hasFailure: boolean;
}

export interface QueryResult<T> {
  data: T[] | null;
  error: { message: string; code?: string } | null;
}

export interface AuditClient {
  selectRows<T>(table: string, columns: string): Promise<QueryResult<T>>;
  summary(
    organizationId: string,
    start: string,
    end: string,
  ): Promise<QueryResult<Record<string, unknown>>>;
  listOrganizations(): Promise<QueryResult<Record<string, unknown>>>;
}

export interface AuditOptions {
  today?: Date;
  expectedTables?: string[];
}

export declare const EXPECTED_TABLES: readonly string[];
export declare function runAudit(
  client: AuditClient,
  options?: AuditOptions,
): Promise<AuditReport>;
export declare function assertPublicKey(key: string): void;
export declare function formatReport(report: AuditReport): string;
