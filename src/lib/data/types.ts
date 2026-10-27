/**
 * Contrat de la couche de données.
 *
 * Deux implémentations :
 *   • SupabaseRepository — production, RLS + triggers PostgreSQL ;
 *   • DemoRepository — démonstration locale, mêmes règles métier simulées.
 *
 * Aucun composant React ne parle directement à Supabase : tout passe par ce
 * contrat, ce qui garantit des écrans identiques dans les deux modes.
 */

import type { Period } from '../period';
import type {
  Client,
  Expense,
  ExpenseInput,
  FinanceJournalRow,
  Invoice,
  InvoiceItem,
  InvoiceKind,
  InvoiceStatus,
  Member,
  Organization,
  OrgRole,
  Payment,
  PaymentMethod,
  Product,
  Purchase,
  PurchaseInput,
} from '../types';

export type RepositoryErrorCode =
  | 'forbidden'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'network'
  | 'unknown';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
}

export interface OrgAccess {
  organization: Organization;
  role: OrgRole;
  memberId: string;
}

export interface InvoiceDraftInput {
  id?: string;
  kind: InvoiceKind;
  clientId: string | null;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  items: InvoiceItem[];
}

export interface PaymentInput {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string | null;
  notes?: string | null;
}

export interface ClientInput {
  id?: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  ninea?: string | null;
  notes?: string | null;
}

export interface ProductInput {
  id?: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  unit: string;
  unitPrice: number;
  costPrice?: number | null;
  taxRate: number;
  trackStock: boolean;
  stockQuantity: number;
}

/** Agrégats renvoyés par la fonction SQL `finance_summary`. */
export interface ServerFinanceSummary {
  invoicedHt: number;
  invoicedTax: number;
  invoicedTtc: number;
  creditedHt: number;
  collectedOnInvoices: number;
  outstanding: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  purchasesTotal: number;
  purchasesPaid: number;
  purchasesDue: number;
  cogsTotal: number;
  operatingPurchasesTotal: number;
  capexTotal: number;
  expensesTotal: number;
  grossMargin: number | null;
  estimatedResult: number;
  draftInvoicesCount: number;
  draftInvoicesTotal: number;
  cancelledInvoicesCount: number;
  cancelledInvoicesTotal: number;
  cogsAvailable: boolean;
  partialEstimate: boolean;
}

export interface SamaRepository {
  readonly mode: 'demo' | 'supabase';

  /** Session courante (null si non connecté en mode Supabase). */
  getSession(): Promise<SessionUser | null>;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, fullName: string): Promise<void>;
  signOut(): Promise<void>;

  listOrganizations(): Promise<OrgAccess[]>;
  createOrganization(name: string, currency?: string): Promise<OrgAccess>;
  listMembers(organizationId: string): Promise<Member[]>;

  listClients(organizationId: string): Promise<Client[]>;
  saveClient(organizationId: string, input: ClientInput): Promise<Client>;

  listProducts(organizationId: string): Promise<Product[]>;
  saveProduct(organizationId: string, input: ProductInput): Promise<Product>;

  listInvoices(organizationId: string): Promise<Invoice[]>;
  saveInvoice(organizationId: string, input: InvoiceDraftInput): Promise<Invoice>;
  setInvoiceStatus(organizationId: string, invoiceId: string, status: InvoiceStatus): Promise<void>;
  deleteInvoice(organizationId: string, invoiceId: string): Promise<void>;

  listPayments(organizationId: string): Promise<Payment[]>;
  recordPayment(organizationId: string, input: PaymentInput): Promise<void>;

  listPurchases(organizationId: string): Promise<Purchase[]>;
  createPurchase(organizationId: string, input: PurchaseInput): Promise<Purchase>;
  updatePurchase(organizationId: string, purchaseId: string, input: PurchaseInput): Promise<Purchase>;
  deletePurchase(organizationId: string, purchaseId: string): Promise<void>;

  listExpenses(organizationId: string): Promise<Expense[]>;
  createExpense(organizationId: string, input: ExpenseInput): Promise<Expense>;
  updateExpense(organizationId: string, expenseId: string, input: ExpenseInput): Promise<Expense>;
  deleteExpense(organizationId: string, expenseId: string): Promise<void>;

  listJournal(organizationId: string, period: Period): Promise<FinanceJournalRow[]>;
  getServerSummary(organizationId: string, period: Period): Promise<ServerFinanceSummary | null>;

  /** Mode démo uniquement : change le rôle simulé. */
  setSimulatedRole?(organizationId: string, role: OrgRole): Promise<void>;
  getSimulatedRole?(organizationId: string): OrgRole | null;
  resetDemoData?(): Promise<void>;
}
