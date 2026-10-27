/**
 * Dépôt Supabase (production).
 *
 * Principes :
 *   • toutes les requêtes sont filtrées par organization_id, mais la sécurité
 *     réelle vient des policies RLS — ce filtre évite seulement les appels
 *     inutiles et rend les erreurs plus lisibles ;
 *   • aucune donnée calculée (totaux, statut payé, montants dérivés) n'est
 *     envoyée en écriture : PostgreSQL la recalcule ;
 *   • toute erreur PostgREST est traduite en RepositoryError.
 */

import { parseAmount } from '../../money';
import type { Period } from '../../period';
import type {
  Client,
  Expense,
  ExpenseInput,
  FinanceJournalRow,
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  Member,
  Organization,
  OrgRole,
  Payment,
  Product,
  Purchase,
  PurchaseInput,
} from '../../types';
import {
  RepositoryError,
  type ClientInput,
  type InvoiceDraftInput,
  type OrgAccess,
  type PaymentInput,
  type ProductInput,
  type SamaRepository,
  type ServerFinanceSummary,
  type SessionUser,
} from '../types';
import { requireSupabase } from './client';

type Row = Record<string, unknown>;

function fail(error: unknown, fallback: string): never {
  const err = error as { code?: string; message?: string; details?: string } | null;
  const code = err?.code ?? '';
  const message = err?.message || fallback;
  if (code === '42501' || /row-level security|permission denied/i.test(message)) {
    throw new RepositoryError('forbidden', 'Action non autorisée pour votre rôle dans cette organisation.');
  }
  if (code === 'PGRST116' || code === 'PGRST202' || /no rows/i.test(message)) {
    throw new RepositoryError('not_found', 'Élément introuvable.');
  }
  if (code.startsWith('22') || code.startsWith('23')) {
    throw new RepositoryError('validation', message);
  }
  if (/failed to fetch|network|timeout/i.test(message)) {
    throw new RepositoryError(
      'network',
      'Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.',
    );
  }
  throw new RepositoryError('unknown', message);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mapOrganization(row: Row): Organization {
  return {
    id: str(row.id),
    name: str(row.name),
    currency: str(row.currency, 'XOF'),
    country: str(row.country, 'SN'),
    ninea: nullableStr(row.ninea),
    email: nullableStr(row.email),
    phone: nullableStr(row.phone),
    address: nullableStr(row.address),
    logoUrl: nullableStr(row.logo_url),
  };
}

function mapClient(row: Row): Client {
  return {
    id: str(row.id),
    organizationId: str(row.organization_id),
    name: str(row.name),
    email: nullableStr(row.email),
    phone: nullableStr(row.phone),
    address: nullableStr(row.address),
    ninea: nullableStr(row.ninea),
    notes: nullableStr(row.notes),
    archived: row.archived === true,
  };
}

function mapProduct(row: Row): Product {
  return {
    id: str(row.id),
    organizationId: str(row.organization_id),
    name: str(row.name),
    description: nullableStr(row.description),
    sku: nullableStr(row.sku),
    unit: str(row.unit, 'unité'),
    unitPrice: parseAmount(row.unit_price),
    costPrice: row.cost_price === null || row.cost_price === undefined ? null : parseAmount(row.cost_price),
    taxRate: parseAmount(row.tax_rate),
    trackStock: row.track_stock === true,
    stockQuantity: parseAmount(row.stock_quantity),
    archived: row.archived === true,
  };
}

function mapInvoiceItem(row: Row): InvoiceItem {
  return {
    id: str(row.id),
    invoiceId: str(row.invoice_id),
    productId: nullableStr(row.product_id),
    description: str(row.description),
    quantity: parseAmount(row.quantity),
    unitPrice: parseAmount(row.unit_price),
    discountPercent: parseAmount(row.discount_percent),
    taxRate: parseAmount(row.tax_rate),
    lineSubtotalHt: parseAmount(row.line_subtotal_ht),
  };
}

function mapInvoice(row: Row): Invoice {
  const rawItems = Array.isArray(row.invoice_items) ? (row.invoice_items as Row[]) : [];
  const client = row.clients as Row | null | undefined;
  return {
    id: str(row.id),
    organizationId: str(row.organization_id),
    clientId: nullableStr(row.client_id),
    clientName: client ? nullableStr(client.name) : null,
    number: str(row.number),
    kind: row.kind === 'credit_note' ? 'credit_note' : 'invoice',
    status: (str(row.status, 'draft') as InvoiceStatus),
    issueDate: str(row.issue_date),
    dueDate: nullableStr(row.due_date),
    currency: str(row.currency, 'XOF'),
    notes: nullableStr(row.notes),
    discountType: (str(row.discount_type, 'none') as Invoice['discountType']),
    discountValue: parseAmount(row.discount_value),
    subtotalHt: parseAmount(row.subtotal_ht),
    discountTotal: parseAmount(row.discount_total),
    netHt: parseAmount(row.net_ht),
    taxTotal: parseAmount(row.tax_total),
    totalTtc: parseAmount(row.total_ttc),
    amountPaid: parseAmount(row.amount_paid),
    amountDue: parseAmount(row.amount_due),
    items: rawItems
      .map(mapInvoiceItem)
      .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')),
  };
}

function mapPayment(row: Row): Payment {
  const invoice = row.invoices as Row | null | undefined;
  return {
    id: str(row.id),
    organizationId: str(row.organization_id),
    invoiceId: str(row.invoice_id),
    invoiceNumber: invoice ? nullableStr(invoice.number) : null,
    clientName: null,
    amount: parseAmount(row.amount),
    method: (str(row.method, 'especes') as Payment['method']),
    paidAt: str(row.paid_at),
    reference: nullableStr(row.reference),
    notes: nullableStr(row.notes),
  };
}

function mapPurchase(row: Row): Purchase {
  return {
    id: str(row.id),
    organizationId: str(row.organization_id),
    supplierName: nullableStr(row.supplier_name),
    supplierInvoiceNumber: nullableStr(row.supplier_invoice_number),
    purchaseDate: str(row.purchase_date),
    description: str(row.description),
    category: (str(row.category, 'marchandises') as Purchase['category']),
    quantity: parseAmount(row.quantity),
    unitPrice: parseAmount(row.unit_price),
    totalAmount: parseAmount(row.total_amount),
    amountPaid: parseAmount(row.amount_paid),
    amountDue: parseAmount(row.amount_due),
    isCogs: row.is_cogs === true,
    isCapex: row.is_capex === true,
    paymentMethod: (nullableStr(row.payment_method) as Purchase['paymentMethod']) ?? null,
    notes: nullableStr(row.notes),
  };
}

function mapExpense(row: Row): Expense {
  return {
    id: str(row.id),
    organizationId: str(row.organization_id),
    expenseDate: str(row.expense_date),
    category: (str(row.category, 'autre') as Expense['category']),
    description: str(row.description),
    amount: parseAmount(row.amount),
    reference: nullableStr(row.reference),
    notes: nullableStr(row.notes),
  };
}

function mapJournalRow(row: Row): FinanceJournalRow {
  return {
    id: `${str(row.source)}-${str(row.source_id)}`,
    occurredOn: str(row.occurred_on),
    source: str(row.source) as FinanceJournalRow['source'],
    sourceId: str(row.source_id),
    reference: str(row.reference, '—'),
    counterparty: str(row.counterparty, '—'),
    category: str(row.category),
    amountHt: parseAmount(row.amount_ht),
    amountTax: parseAmount(row.amount_tax),
    amountTtc: parseAmount(row.amount_ttc),
    cashIn: parseAmount(row.cash_in),
    cashOut: parseAmount(row.cash_out),
    isCogs: row.is_cogs === true,
  };
}

function mapServerSummary(row: Row): ServerFinanceSummary {
  const nullableNumber = (value: unknown): number | null =>
    value === null || value === undefined ? null : parseAmount(value);
  return {
    invoicedHt: parseAmount(row.invoiced_ht),
    invoicedTax: parseAmount(row.invoiced_tax),
    invoicedTtc: parseAmount(row.invoiced_ttc),
    creditedHt: parseAmount(row.credited_ht),
    collectedOnInvoices: parseAmount(row.collected_on_invoices),
    outstanding: parseAmount(row.outstanding),
    cashIn: parseAmount(row.cash_in),
    cashOut: parseAmount(row.cash_out),
    netCash: parseAmount(row.net_cash),
    purchasesTotal: parseAmount(row.purchases_total),
    purchasesPaid: parseAmount(row.purchases_paid),
    purchasesDue: parseAmount(row.purchases_due),
    cogsTotal: parseAmount(row.cogs_total),
    operatingPurchasesTotal: parseAmount(row.operating_purchases_total),
    capexTotal: parseAmount(row.capex_total),
    expensesTotal: parseAmount(row.expenses_total),
    grossMargin: nullableNumber(row.gross_margin),
    estimatedResult: parseAmount(row.estimated_result),
    draftInvoicesCount: Number(row.draft_invoices_count ?? 0),
    draftInvoicesTotal: parseAmount(row.draft_invoices_total),
    cancelledInvoicesCount: Number(row.cancelled_invoices_count ?? 0),
    cancelledInvoicesTotal: parseAmount(row.cancelled_invoices_total),
    cogsAvailable: row.cogs_available === true,
    partialEstimate: row.partial_estimate === true,
  };
}

export class SupabaseRepository implements SamaRepository {
  readonly mode = 'supabase' as const;

  private db() {
    return requireSupabase();
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------
  async getSession(): Promise<SessionUser | null> {
    const { data, error } = await this.db().auth.getUser();
    if (error) return null;
    const user = data.user;
    if (!user) return null;
    const metadata = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
    return {
      id: user.id,
      email: user.email ?? '',
      fullName: metadata.full_name ?? metadata.name ?? (user.email ?? '').split('@')[0],
    };
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.db().auth.signInWithPassword({ email, password });
    if (error) fail(error, 'Connexion impossible.');
  }

  async signUp(email: string, password: string, fullName: string): Promise<void> {
    const { error } = await this.db().auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) fail(error, 'Création du compte impossible.');
  }

  async signOut(): Promise<void> {
    await this.db().auth.signOut();
  }

  // ---------------------------------------------------------------------------
  // Organisations
  // ---------------------------------------------------------------------------
  async listOrganizations(): Promise<OrgAccess[]> {
    const user = await this.getSession();
    if (!user) return [];
    const { data, error } = await this.db()
      .from('organization_members')
      .select('id, role, organization_id, organizations(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) fail(error, 'Chargement des organisations impossible.');
    return (data ?? [])
      .map((row) => {
        const typed = row as Row;
        const org = typed.organizations as Row | null;
        if (!org) return null;
        return {
          organization: mapOrganization(org),
          role: str(typed.role, 'vendeur') as OrgRole,
          memberId: str(typed.id),
        };
      })
      .filter((value): value is OrgAccess => value !== null);
  }

  async createOrganization(name: string, currency = 'XOF'): Promise<OrgAccess> {
    const user = await this.getSession();
    if (!user) throw new RepositoryError('forbidden', 'Vous devez être connecté.');
    const { data, error } = await this.db()
      .from('organizations')
      .insert({ name: name.trim(), currency, created_by: user.id })
      .select('*')
      .single();
    if (error) fail(error, 'Création de l’organisation impossible.');

    const organization = mapOrganization(data as Row);
    // Le trigger handle_new_organization a créé l'adhésion « owner ».
    const { data: member, error: memberError } = await this.db()
      .from('organization_members')
      .select('id, role')
      .eq('organization_id', organization.id)
      .eq('user_id', user.id)
      .single();
    if (memberError) fail(memberError, 'Adhésion introuvable après création.');
    return {
      organization,
      role: str((member as Row).role, 'owner') as OrgRole,
      memberId: str((member as Row).id),
    };
  }

  async listMembers(organizationId: string): Promise<Member[]> {
    const { data, error } = await this.db()
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });
    if (error) fail(error, 'Chargement des membres impossible.');
    return (data ?? []).map((row) => {
      const typed = row as Row;
      return {
        id: str(typed.id),
        organizationId: str(typed.organization_id),
        userId: str(typed.user_id),
        role: str(typed.role, 'vendeur') as OrgRole,
        fullName: nullableStr(typed.full_name),
        email: nullableStr(typed.email),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Clients & produits
  // ---------------------------------------------------------------------------
  async listClients(organizationId: string): Promise<Client[]> {
    const { data, error } = await this.db()
      .from('clients')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('archived', false)
      .order('name', { ascending: true });
    if (error) fail(error, 'Chargement des clients impossible.');
    return (data ?? []).map((row) => mapClient(row as Row));
  }

  async saveClient(organizationId: string, input: ClientInput): Promise<Client> {
    const payload = {
      organization_id: organizationId,
      name: input.name.trim(),
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      ninea: input.ninea ?? null,
      notes: input.notes ?? null,
    };
    if (input.id) {
      const { data, error } = await this.db()
        .from('clients')
        .update(payload)
        .eq('id', input.id)
        .eq('organization_id', organizationId)
        .select('*')
        .single();
      if (error) fail(error, 'Mise à jour du client impossible.');
      return mapClient(data as Row);
    }
    const { data, error } = await this.db().from('clients').insert(payload).select('*').single();
    if (error) fail(error, 'Création du client impossible.');
    return mapClient(data as Row);
  }

  async listProducts(organizationId: string): Promise<Product[]> {
    const { data, error } = await this.db()
      .from('products')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('archived', false)
      .order('name', { ascending: true });
    if (error) fail(error, 'Chargement des produits impossible.');
    return (data ?? []).map((row) => mapProduct(row as Row));
  }

  async saveProduct(organizationId: string, input: ProductInput): Promise<Product> {
    const payload = {
      organization_id: organizationId,
      name: input.name.trim(),
      description: input.description ?? null,
      sku: input.sku ?? null,
      unit: input.unit,
      unit_price: input.unitPrice,
      cost_price: input.costPrice ?? null,
      tax_rate: input.taxRate,
      track_stock: input.trackStock,
      stock_quantity: input.stockQuantity,
    };
    if (input.id) {
      const { data, error } = await this.db()
        .from('products')
        .update(payload)
        .eq('id', input.id)
        .eq('organization_id', organizationId)
        .select('*')
        .single();
      if (error) fail(error, 'Mise à jour du produit impossible.');
      return mapProduct(data as Row);
    }
    const { data, error } = await this.db().from('products').insert(payload).select('*').single();
    if (error) fail(error, 'Création du produit impossible.');
    return mapProduct(data as Row);
  }

  // ---------------------------------------------------------------------------
  // Factures
  // ---------------------------------------------------------------------------
  private invoiceSelect = '*, clients(name), invoice_items(*)';

  async listInvoices(organizationId: string): Promise<Invoice[]> {
    const { data, error } = await this.db()
      .from('invoices')
      .select(this.invoiceSelect)
      .eq('organization_id', organizationId)
      .order('issue_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) fail(error, 'Chargement des factures impossible.');
    return (data ?? []).map((row) => mapInvoice(row as unknown as Row));
  }

  private async fetchInvoice(organizationId: string, invoiceId: string): Promise<Invoice> {
    const { data, error } = await this.db()
      .from('invoices')
      .select(this.invoiceSelect)
      .eq('id', invoiceId)
      .eq('organization_id', organizationId)
      .single();
    if (error || !data) fail(error, 'Facture introuvable.');
    return mapInvoice(data as unknown as Row);
  }

  async saveInvoice(organizationId: string, input: InvoiceDraftInput): Promise<Invoice> {
    let invoiceId = input.id ?? null;

    if (invoiceId) {
      const existing = await this.fetchInvoice(organizationId, invoiceId);
      if (existing.status !== 'draft') {
        throw new RepositoryError(
          'conflict',
          'Une facture émise est immutable : créez un avoir pour la corriger.',
        );
      }
    }

    if (input.items.length === 0) {
      throw new RepositoryError('validation', 'Ajoutez au moins une ligne à la facture.');
    }

    if (invoiceId) {
      const { error } = await this.db()
        .from('invoices')
        .update({
          client_id: input.clientId,
          issue_date: input.issueDate,
          due_date: input.dueDate,
          notes: input.notes,
          discount_type: input.discountType,
          discount_value: input.discountValue,
        })
        .eq('id', invoiceId)
        .eq('organization_id', organizationId);
      if (error) fail(error, 'Mise à jour de la facture impossible.');

      const { error: deleteError } = await this.db()
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoiceId);
      if (deleteError) fail(deleteError, 'Mise à jour des lignes impossible.');
    } else {
      const { data, error } = await this.db()
        .from('invoices')
        .insert({
          organization_id: organizationId,
          client_id: input.clientId,
          kind: input.kind,
          status: 'draft',
          issue_date: input.issueDate,
          due_date: input.dueDate,
          notes: input.notes,
          discount_type: input.discountType,
          discount_value: input.discountValue,
        })
        .select('id')
        .single();
      if (error) fail(error, 'Création de la facture impossible.');
      invoiceId = str((data as Row).id);
    }

    const { error: itemsError } = await this.db().from('invoice_items').insert(
      input.items.map((item, index) => ({
        invoice_id: invoiceId,
        organization_id: organizationId,
        product_id: item.productId,
        description: item.description.trim(),
        quantity: item.quantity,
        unit_price: item.unitPrice,
        discount_percent: item.discountPercent,
        tax_rate: item.taxRate,
        position: index + 1,
      })),
    );
    if (itemsError) fail(itemsError, 'Enregistrement des lignes impossible.');

    return this.fetchInvoice(organizationId, invoiceId as string);
  }

  async setInvoiceStatus(
    organizationId: string,
    invoiceId: string,
    status: InvoiceStatus,
  ): Promise<void> {
    if (status === 'paid' || status === 'partial') {
      throw new RepositoryError(
        'validation',
        'Les statuts « payée » et « partielle » sont calculés à partir des paiements.',
      );
    }
    const { error } = await this.db()
      .from('invoices')
      .update({ status })
      .eq('id', invoiceId)
      .eq('organization_id', organizationId);
    if (error) fail(error, 'Changement de statut impossible.');
  }

  async deleteInvoice(organizationId: string, invoiceId: string): Promise<void> {
    const { error } = await this.db()
      .from('invoices')
      .delete()
      .eq('id', invoiceId)
      .eq('organization_id', organizationId);
    if (error) fail(error, 'Suppression de la facture impossible.');
  }

  // ---------------------------------------------------------------------------
  // Paiements
  // ---------------------------------------------------------------------------
  async listPayments(organizationId: string): Promise<Payment[]> {
    const { data, error } = await this.db()
      .from('payments')
      .select('*, invoices(number)')
      .eq('organization_id', organizationId)
      .order('paid_at', { ascending: false });
    if (error) fail(error, 'Chargement des paiements impossible.');
    return (data ?? []).map((row) => mapPayment(row as Row));
  }

  async recordPayment(organizationId: string, input: PaymentInput): Promise<void> {
    const { error } = await this.db().from('payments').insert({
      organization_id: organizationId,
      invoice_id: input.invoiceId,
      amount: input.amount,
      method: input.method,
      paid_at: input.paidAt,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    });
    if (error) fail(error, 'Enregistrement du paiement impossible.');
  }

  // ---------------------------------------------------------------------------
  // Achats
  // ---------------------------------------------------------------------------
  private purchasePayload(organizationId: string, input: PurchaseInput) {
    // total_amount, amount_due, is_cogs et is_capex sont des colonnes générées :
    // elles ne sont jamais envoyées.
    return {
      organization_id: organizationId,
      supplier_name: input.supplierName?.trim() || null,
      supplier_invoice_number: input.supplierInvoiceNumber?.trim() || null,
      purchase_date: input.purchaseDate,
      description: input.description.trim(),
      category: input.category,
      quantity: input.quantity,
      unit_price: input.unitPrice,
      amount_paid: input.amountPaid,
      payment_method: input.paymentMethod,
      notes: input.notes?.trim() || null,
    };
  }

  async listPurchases(organizationId: string): Promise<Purchase[]> {
    const { data, error } = await this.db()
      .from('purchases')
      .select('*')
      .eq('organization_id', organizationId)
      .order('purchase_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) fail(error, 'Chargement des achats impossible.');
    return (data ?? []).map((row) => mapPurchase(row as Row));
  }

  async createPurchase(organizationId: string, input: PurchaseInput): Promise<Purchase> {
    const { data, error } = await this.db()
      .from('purchases')
      .insert(this.purchasePayload(organizationId, input))
      .select('*')
      .single();
    if (error) fail(error, 'Enregistrement de l’achat impossible.');
    return mapPurchase(data as Row);
  }

  async updatePurchase(
    organizationId: string,
    purchaseId: string,
    input: PurchaseInput,
  ): Promise<Purchase> {
    const payload = this.purchasePayload(organizationId, input);
    const { data, error } = await this.db()
      .from('purchases')
      .update(payload)
      .eq('id', purchaseId)
      .eq('organization_id', organizationId)
      .select('*')
      .single();
    if (error) fail(error, 'Mise à jour de l’achat impossible.');
    return mapPurchase(data as Row);
  }

  async deletePurchase(organizationId: string, purchaseId: string): Promise<void> {
    const { error } = await this.db()
      .from('purchases')
      .delete()
      .eq('id', purchaseId)
      .eq('organization_id', organizationId);
    if (error) fail(error, 'Suppression de l’achat impossible.');
  }

  // ---------------------------------------------------------------------------
  // Dépenses
  // ---------------------------------------------------------------------------
  async listExpenses(organizationId: string): Promise<Expense[]> {
    const { data, error } = await this.db()
      .from('expenses')
      .select('*')
      .eq('organization_id', organizationId)
      .order('expense_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) fail(error, 'Chargement des dépenses impossible.');
    return (data ?? []).map((row) => mapExpense(row as Row));
  }

  async createExpense(organizationId: string, input: ExpenseInput): Promise<Expense> {
    const { data, error } = await this.db()
      .from('expenses')
      .insert({
        organization_id: organizationId,
        expense_date: input.expenseDate,
        category: input.category,
        description: input.description.trim(),
        amount: input.amount,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .select('*')
      .single();
    if (error) fail(error, 'Enregistrement de la dépense impossible.');
    return mapExpense(data as Row);
  }

  async updateExpense(
    organizationId: string,
    expenseId: string,
    input: ExpenseInput,
  ): Promise<Expense> {
    const { data, error } = await this.db()
      .from('expenses')
      .update({
        expense_date: input.expenseDate,
        category: input.category,
        description: input.description.trim(),
        amount: input.amount,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .eq('id', expenseId)
      .eq('organization_id', organizationId)
      .select('*')
      .single();
    if (error) fail(error, 'Mise à jour de la dépense impossible.');
    return mapExpense(data as Row);
  }

  async deleteExpense(organizationId: string, expenseId: string): Promise<void> {
    const { error } = await this.db()
      .from('expenses')
      .delete()
      .eq('id', expenseId)
      .eq('organization_id', organizationId);
    if (error) fail(error, 'Suppression de la dépense impossible.');
  }

  // ---------------------------------------------------------------------------
  // Finance
  // ---------------------------------------------------------------------------
  async listJournal(organizationId: string, period: Period): Promise<FinanceJournalRow[]> {
    const { data, error } = await this.db()
      .from('v_finance_transactions')
      .select('*')
      .eq('organization_id', organizationId)
      .gte('occurred_on', period.start)
      .lte('occurred_on', period.end)
      .order('occurred_on', { ascending: false });
    if (error) fail(error, 'Chargement du journal financier impossible.');
    return (data ?? []).map((row) => mapJournalRow(row as Row));
  }

  async getServerSummary(
    organizationId: string,
    period: Period,
  ): Promise<ServerFinanceSummary | null> {
    const { data, error } = await this.db().rpc('finance_summary', {
      p_organization_id: organizationId,
      p_start: period.start,
      p_end: period.end,
    });
    if (error) fail(error, 'Calcul des agrégats financiers impossible.');
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return null;
    return mapServerSummary(rows[0]);
  }
}
