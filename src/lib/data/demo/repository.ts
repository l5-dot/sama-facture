/**
 * Implémentation « démonstration » du dépôt : mêmes invariants que la base,
 * simulés en TypeScript. Les contrôles de rôle reproduisent les policies RLS
 * pour que l'interface et les tests se comportent comme en production.
 */

import { computeFinanceSummary, purchaseIsCapex, purchaseIsCogs, buildJournal } from '../../finance';
import { formatDocumentNumber, statusFromPayments, computeInvoiceTotals } from '../../invoices';
import { isValidISODate, todayISO } from '../../dates';
import { parseAmount, round2, sum } from '../../money';
import type { Period } from '../../period';
import {
  canDeleteFinance,
  canManageInvoices,
  canWriteFinances,
  canDeleteInvoice,
} from '../../permissions';
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
  DEMO_USER_EMAIL,
  DEMO_USERS,
  DEMO_USER_ID,
  loadDemoState,
  resetDemoState,
  saveDemoState,
  type DemoState,
} from './db';
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

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function currentUser(): SessionUser {
  const user = DEMO_USERS.find((u) => u.id === DEMO_USER_ID) ?? DEMO_USERS[0];
  return { id: user.id, email: user.email, fullName: user.fullName };
}

export class DemoRepository implements SamaRepository {
  readonly mode = 'demo' as const;

  private state: DemoState;

  constructor(state?: DemoState) {
    this.state = state ?? loadDemoState();
  }

  private persist(): void {
    saveDemoState(this.state);
  }

  private member(organizationId: string): Member {
    const member = this.state.members.find(
      (m) => m.organizationId === organizationId && m.userId === currentUser().id,
    );
    if (!member) {
      throw new RepositoryError('forbidden', "Vous n'êtes pas membre de cette organisation.");
    }
    return member;
  }

  roleFor(organizationId: string): OrgRole {
    const override = this.state.roleOverrides[organizationId];
    return override ?? this.member(organizationId).role;
  }

  private requireFinanceWrite(organizationId: string): void {
    if (!canWriteFinances(this.roleFor(organizationId))) {
      throw new RepositoryError(
        'forbidden',
        'Votre rôle ne permet pas de modifier les achats et dépenses.',
      );
    }
  }

  private requireDelete(organizationId: string): void {
    if (!canDeleteFinance(this.roleFor(organizationId))) {
      throw new RepositoryError(
        'forbidden',
        'Seuls le propriétaire et les administrateurs peuvent supprimer une opération financière.',
      );
    }
  }

  private requireInvoiceWrite(organizationId: string): void {
    if (!canManageInvoices(this.roleFor(organizationId))) {
      throw new RepositoryError('forbidden', 'Votre rôle ne permet pas de modifier les factures.');
    }
  }

  private organization(organizationId: string): Organization {
    const org = this.state.organizations.find((o) => o.id === organizationId);
    if (!org) throw new RepositoryError('not_found', 'Organisation introuvable.');
    return org;
  }

  // ---------------------------------------------------------------------------
  // Session
  // ---------------------------------------------------------------------------
  async getSession(): Promise<SessionUser | null> {
    return currentUser();
  }

  async signIn(): Promise<void> {
    /* Mode démo : session déjà ouverte. */
  }

  async signUp(): Promise<void> {
    /* Mode démo : session déjà ouverte. */
  }

  async signOut(): Promise<void> {
    /* Mode démo : on ne ferme pas la session pour rester explorable. */
  }

  // ---------------------------------------------------------------------------
  // Organisations
  // ---------------------------------------------------------------------------
  async listOrganizations(): Promise<OrgAccess[]> {
    const userId = currentUser().id;
    return this.state.members
      .filter((m) => m.userId === userId)
      .map((member) => {
        const organization = this.state.organizations.find((o) => o.id === member.organizationId);
        if (!organization) return null;
        return {
          organization,
          role: this.state.roleOverrides[organization.id] ?? member.role,
          memberId: member.id,
        };
      })
      .filter((value): value is OrgAccess => value !== null);
  }

  async createOrganization(name: string, currency = 'XOF'): Promise<OrgAccess> {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      throw new RepositoryError('validation', 'Le nom de l’organisation doit contenir au moins 2 caractères.');
    }
    const organization: Organization = {
      id: newId(),
      name: trimmed.slice(0, 160),
      currency,
      country: 'SN',
      ninea: null,
      email: null,
      phone: null,
      address: null,
      logoUrl: null,
    };
    const user = currentUser();
    const member: Member = {
      id: newId(),
      organizationId: organization.id,
      userId: user.id,
      role: 'owner',
      fullName: user.fullName,
      email: user.email,
    };
    this.state.organizations.push(organization);
    this.state.members.push(member);
    this.state.counters[organization.id] = { invoice: 0, credit_note: 0 };
    this.persist();
    return { organization, role: 'owner', memberId: member.id };
  }

  async listMembers(organizationId: string): Promise<Member[]> {
    this.member(organizationId);
    return this.state.members.filter((m) => m.organizationId === organizationId);
  }

  // ---------------------------------------------------------------------------
  // Clients & produits
  // ---------------------------------------------------------------------------
  async listClients(organizationId: string): Promise<Client[]> {
    this.member(organizationId);
    return this.state.clients
      .filter((c) => c.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveClient(organizationId: string, input: ClientInput): Promise<Client> {
    this.requireInvoiceWrite(organizationId);
    const name = input.name?.trim();
    if (!name) throw new RepositoryError('validation', 'Le nom du client est obligatoire.');

    if (input.id) {
      const existing = this.state.clients.find(
        (c) => c.id === input.id && c.organizationId === organizationId,
      );
      if (!existing) throw new RepositoryError('not_found', 'Client introuvable.');
      Object.assign(existing, {
        name: name.slice(0, 160),
        email: input.email ?? existing.email,
        phone: input.phone ?? existing.phone,
        address: input.address ?? existing.address,
        ninea: input.ninea ?? existing.ninea,
        notes: input.notes ?? existing.notes,
      });
      this.persist();
      return existing;
    }

    const client: Client = {
      id: newId(),
      organizationId,
      name: name.slice(0, 160),
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      ninea: input.ninea ?? null,
      notes: input.notes ?? null,
      archived: false,
    };
    this.state.clients.push(client);
    this.persist();
    return client;
  }

  async listProducts(organizationId: string): Promise<Product[]> {
    this.member(organizationId);
    return this.state.products
      .filter((p) => p.organizationId === organizationId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveProduct(organizationId: string, input: ProductInput): Promise<Product> {
    this.requireInvoiceWrite(organizationId);
    const name = input.name?.trim();
    if (!name) throw new RepositoryError('validation', 'Le nom du produit est obligatoire.');

    if (input.id) {
      const existing = this.state.products.find(
        (p) => p.id === input.id && p.organizationId === organizationId,
      );
      if (!existing) throw new RepositoryError('not_found', 'Produit introuvable.');
      Object.assign(existing, {
        name: name.slice(0, 160),
        description: input.description ?? existing.description,
        sku: input.sku ?? existing.sku,
        unit: input.unit,
        unitPrice: round2(input.unitPrice),
        costPrice: input.costPrice ?? null,
        taxRate: input.taxRate,
        trackStock: input.trackStock,
        stockQuantity: input.stockQuantity,
      });
      this.persist();
      return existing;
    }

    const product: Product = {
      id: newId(),
      organizationId,
      name: name.slice(0, 160),
      description: input.description ?? null,
      sku: input.sku ?? null,
      unit: input.unit,
      unitPrice: round2(input.unitPrice),
      costPrice: input.costPrice ?? null,
      taxRate: input.taxRate,
      trackStock: input.trackStock,
      stockQuantity: input.stockQuantity,
      archived: false,
    };
    this.state.products.push(product);
    this.persist();
    return product;
  }

  // ---------------------------------------------------------------------------
  // Factures
  // ---------------------------------------------------------------------------
  async listInvoices(organizationId: string): Promise<Invoice[]> {
    this.member(organizationId);
    return this.state.invoices
      .filter((i) => i.organizationId === organizationId)
      .sort((a, b) => (a.issueDate === b.issueDate ? b.number.localeCompare(a.number) : a.issueDate < b.issueDate ? 1 : -1));
  }

  async saveInvoice(organizationId: string, input: InvoiceDraftInput): Promise<Invoice> {
    this.requireInvoiceWrite(organizationId);
    const org = this.organization(organizationId);

    // Une facture émise est immutable : on le signale avant toute autre erreur.
    if (input.id) {
      const current = this.state.invoices.find(
        (i) => i.id === input.id && i.organizationId === organizationId,
      );
      if (!current) throw new RepositoryError('not_found', 'Facture introuvable.');
      if (current.status !== 'draft') {
        throw new RepositoryError(
          'conflict',
          'Une facture émise est immutable : créez un avoir pour la corriger.',
        );
      }
    }

    if (!isValidISODate(input.issueDate)) {
      throw new RepositoryError('validation', 'La date de facture est invalide.');
    }
    if (input.dueDate && !isValidISODate(input.dueDate)) {
      throw new RepositoryError('validation', "La date d'échéance est invalide.");
    }
    if (input.items.length === 0) {
      throw new RepositoryError('validation', 'Ajoutez au moins une ligne à la facture.');
    }
    for (const item of input.items) {
      if (!item.description?.trim()) {
        throw new RepositoryError('validation', 'Chaque ligne doit avoir une description.');
      }
      if (!(item.quantity > 0)) {
        throw new RepositoryError('validation', 'La quantité doit être supérieure à 0.');
      }
      if (item.unitPrice < 0) {
        throw new RepositoryError('validation', 'Le prix unitaire ne peut pas être négatif.');
      }
      if (item.discountPercent < 0 || item.discountPercent > 100) {
        throw new RepositoryError('validation', 'La remise de ligne doit être comprise entre 0 et 100 %.');
      }
      if (item.taxRate < 0 || item.taxRate > 100) {
        throw new RepositoryError('validation', 'Le taux de TVA doit être compris entre 0 et 100 %.');
      }
    }
    if (input.discountType === 'percent' && (input.discountValue < 0 || input.discountValue > 100)) {
      throw new RepositoryError('validation', 'La remise globale doit être comprise entre 0 et 100 %.');
    }
    if (input.discountType === 'fixed' && input.discountValue < 0) {
      throw new RepositoryError('validation', 'La remise globale ne peut pas être négative.');
    }

    const computed = computeInvoiceTotals(input.items, input.discountType, input.discountValue);
    const items: InvoiceItem[] = computed.items.map((item, index) => ({
      ...item,
      id: item.id ?? `${newId()}-${index}`,
      invoiceId: input.id,
    }));

    if (input.id) {
      const existing = this.state.invoices.find(
        (i) => i.id === input.id && i.organizationId === organizationId,
      );
      if (!existing) throw new RepositoryError('not_found', 'Facture introuvable.');
      if (existing.status !== 'draft') {
        throw new RepositoryError(
          'conflict',
          'Une facture émise est immutable : créez un avoir pour la corriger.',
        );
      }
      existing.clientId = input.clientId;
      existing.clientName =
        this.state.clients.find((c) => c.id === input.clientId)?.name ?? null;
      existing.issueDate = input.issueDate;
      existing.dueDate = input.dueDate;
      existing.notes = input.notes;
      existing.discountType = input.discountType;
      existing.discountValue = input.discountValue;
      existing.subtotalHt = computed.subtotalHt;
      existing.discountTotal = computed.discountTotal;
      existing.netHt = computed.netHt;
      existing.taxTotal = computed.taxTotal;
      existing.totalTtc = computed.totalTtc;
      existing.amountDue = Math.max(round2(computed.totalTtc - existing.amountPaid), 0);
      existing.items = items.map((item) => ({ ...item, invoiceId: existing.id }));
      this.persist();
      return existing;
    }

    const counterKey = input.kind === 'invoice' ? 'invoice' : 'credit_note';
    const counter = this.state.counters[organizationId] ?? { invoice: 0, credit_note: 0 };
    // Les avoirs ont leur propre compteur et ne consomment pas la numérotation
    // des factures.
    const next = counter[counterKey] + 1;
    this.state.counters[organizationId] = { ...counter, [counterKey]: next };

    const invoiceId = newId();
    const invoice: Invoice = {
      id: invoiceId,
      organizationId,
      clientId: input.clientId,
      clientName: this.state.clients.find((c) => c.id === input.clientId)?.name ?? null,
      number: formatDocumentNumber(input.kind, next),
      kind: input.kind,
      status: 'draft',
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      currency: org.currency,
      notes: input.notes,
      discountType: input.discountType,
      discountValue: input.discountValue,
      subtotalHt: computed.subtotalHt,
      discountTotal: computed.discountTotal,
      netHt: computed.netHt,
      taxTotal: computed.taxTotal,
      totalTtc: computed.totalTtc,
      amountPaid: 0,
      amountDue: computed.totalTtc,
      items: items.map((item) => ({ ...item, invoiceId })),
    };
    this.state.invoices.push(invoice);
    this.persist();
    return invoice;
  }

  async setInvoiceStatus(
    organizationId: string,
    invoiceId: string,
    status: InvoiceStatus,
  ): Promise<void> {
    this.requireInvoiceWrite(organizationId);
    const invoice = this.state.invoices.find(
      (i) => i.id === invoiceId && i.organizationId === organizationId,
    );
    if (!invoice) throw new RepositoryError('not_found', 'Facture introuvable.');
    if (invoice.status === 'cancelled') {
      throw new RepositoryError('conflict', 'Une facture annulée ne peut plus changer de statut.');
    }
    if (status === 'paid' || status === 'partial') {
      throw new RepositoryError(
        'validation',
        'Les statuts « payée » et « partielle » sont calculés à partir des paiements enregistrés.',
      );
    }

    if (status === 'sent') {
      if (invoice.items.length === 0) {
        throw new RepositoryError('validation', 'Impossible d’émettre une facture sans ligne.');
      }
      invoice.status = statusFromPayments('sent', invoice.totalTtc, invoice.amountPaid);
    } else if (status === 'cancelled') {
      if (invoice.amountPaid > 0) {
        throw new RepositoryError(
          'conflict',
          'Impossible d’annuler une facture déjà encaissée : émettez un avoir.',
        );
      }
      invoice.status = 'cancelled';
    } else if (status === 'draft') {
      if (invoice.amountPaid > 0) {
        throw new RepositoryError('conflict', 'Une facture encaissée ne peut pas redevenir brouillon.');
      }
      invoice.status = 'draft';
    }

    this.persist();
  }

  async deleteInvoice(organizationId: string, invoiceId: string): Promise<void> {
    const invoice = this.state.invoices.find(
      (i) => i.id === invoiceId && i.organizationId === organizationId,
    );
    if (!invoice) throw new RepositoryError('not_found', 'Facture introuvable.');
    if (!canDeleteInvoice(this.roleFor(organizationId), invoice.status)) {
      throw new RepositoryError(
        'forbidden',
        'Seules les factures brouillon peuvent être supprimées, par un propriétaire ou un administrateur.',
      );
    }
    this.state.invoices = this.state.invoices.filter((i) => i.id !== invoiceId);
    this.state.payments = this.state.payments.filter((p) => p.invoiceId !== invoiceId);
    this.persist();
  }

  // ---------------------------------------------------------------------------
  // Paiements
  // ---------------------------------------------------------------------------
  async listPayments(organizationId: string): Promise<Payment[]> {
    this.member(organizationId);
    return [...this.state.payments]
      .filter((p) => p.organizationId === organizationId)
      .sort((a, b) => (a.paidAt < b.paidAt ? 1 : a.paidAt > b.paidAt ? -1 : 0));
  }

  async recordPayment(organizationId: string, input: PaymentInput): Promise<void> {
    this.requireFinanceWrite(organizationId);
    const invoice = this.state.invoices.find(
      (i) => i.id === input.invoiceId && i.organizationId === organizationId,
    );
    if (!invoice) throw new RepositoryError('not_found', 'Facture introuvable.');
    if (invoice.kind === 'credit_note') {
      throw new RepositoryError('validation', 'Un avoir ne peut pas être encaissé.');
    }
    if (invoice.status === 'draft') {
      throw new RepositoryError('validation', 'Émettez la facture avant d’enregistrer un paiement.');
    }
    if (invoice.status === 'cancelled') {
      throw new RepositoryError('validation', 'Impossible d’encaisser une facture annulée.');
    }
    if (!isValidISODate(input.paidAt)) {
      throw new RepositoryError('validation', 'La date de paiement est invalide.');
    }

    const amount = round2(parseAmount(input.amount));
    if (!(amount > 0)) {
      throw new RepositoryError('validation', 'Le montant du paiement doit être strictement positif.');
    }
    const due = round2(invoice.totalTtc - invoice.amountPaid);
    if (amount > due + 0.005) {
      throw new RepositoryError('validation', 'Le montant dépasse le reste à payer de la facture.');
    }

    const payment: Payment = {
      id: newId(),
      organizationId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientName: invoice.clientName,
      amount,
      method: input.method,
      paidAt: input.paidAt,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    };
    this.state.payments.push(payment);
    invoice.amountPaid = round2(invoice.amountPaid + amount);
    invoice.amountDue = Math.max(round2(invoice.totalTtc - invoice.amountPaid), 0);
    invoice.status = statusFromPayments(invoice.status, invoice.totalTtc, invoice.amountPaid);
    this.persist();
  }

  // ---------------------------------------------------------------------------
  // Achats
  // ---------------------------------------------------------------------------
  async listPurchases(organizationId: string): Promise<Purchase[]> {
    this.member(organizationId);
    return [...this.state.purchases]
      .filter((p) => p.organizationId === organizationId)
      .sort((a, b) => (a.purchaseDate < b.purchaseDate ? 1 : a.purchaseDate > b.purchaseDate ? -1 : 0));
  }

  private validatePurchaseInput(organizationId: string, input: PurchaseInput): {
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    amountPaid: number;
    amountDue: number;
  } {
    this.organization(organizationId);
    if (!input.description?.trim()) {
      throw new RepositoryError('validation', 'La description de l’achat est obligatoire.');
    }
    if (!isValidISODate(input.purchaseDate)) {
      throw new RepositoryError('validation', 'La date d’achat est invalide.');
    }
    if (input.purchaseDate > todayISO()) {
      throw new RepositoryError('validation', 'La date d’achat ne peut pas être dans le futur.');
    }
    if (!(input.quantity > 0)) {
      throw new RepositoryError('validation', 'La quantité doit être supérieure à 0.');
    }
    if (!(input.unitPrice >= 0)) {
      throw new RepositoryError('validation', 'Le prix unitaire doit être positif.');
    }
    const quantity = round2(parseAmount(input.quantity));
    const unitPrice = round2(parseAmount(input.unitPrice));
    const totalAmount = round2(quantity * unitPrice);
    const amountPaid = round2(parseAmount(input.amountPaid));
    if (!(amountPaid >= 0)) {
      throw new RepositoryError('validation', 'Le montant payé ne peut pas être négatif.');
    }
    if (amountPaid > totalAmount + 0.005) {
      throw new RepositoryError('validation', 'Le montant payé dépasse le total de l’achat.');
    }
    return {
      quantity,
      unitPrice,
      totalAmount,
      amountPaid,
      amountDue: round2(totalAmount - amountPaid),
    };
  }

  async createPurchase(organizationId: string, input: PurchaseInput): Promise<Purchase> {
    this.requireFinanceWrite(organizationId);
    const totals = this.validatePurchaseInput(organizationId, input);
    const purchase: Purchase = {
      id: newId(),
      organizationId,
      supplierName: input.supplierName?.trim() || null,
      supplierInvoiceNumber: input.supplierInvoiceNumber?.trim() || null,
      purchaseDate: input.purchaseDate,
      description: input.description.trim(),
      category: input.category,
      quantity: totals.quantity,
      unitPrice: totals.unitPrice,
      totalAmount: totals.totalAmount,
      amountPaid: totals.amountPaid,
      amountDue: totals.amountDue,
      isCogs: purchaseIsCogs(input.category),
      isCapex: purchaseIsCapex(input.category),
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes?.trim() || null,
    };
    this.state.purchases.push(purchase);
    this.persist();
    return purchase;
  }

  async updatePurchase(
    organizationId: string,
    purchaseId: string,
    input: PurchaseInput,
  ): Promise<Purchase> {
    this.requireFinanceWrite(organizationId);
    const existing = this.state.purchases.find(
      (p) => p.id === purchaseId && p.organizationId === organizationId,
    );
    if (!existing) throw new RepositoryError('not_found', 'Achat introuvable.');
    const totals = this.validatePurchaseInput(organizationId, input);
    Object.assign(existing, {
      supplierName: input.supplierName?.trim() || null,
      supplierInvoiceNumber: input.supplierInvoiceNumber?.trim() || null,
      purchaseDate: input.purchaseDate,
      description: input.description.trim(),
      category: input.category,
      quantity: totals.quantity,
      unitPrice: totals.unitPrice,
      totalAmount: totals.totalAmount,
      amountPaid: totals.amountPaid,
      amountDue: totals.amountDue,
      isCogs: purchaseIsCogs(input.category),
      isCapex: purchaseIsCapex(input.category),
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes?.trim() || null,
    });
    this.persist();
    return existing;
  }

  async deletePurchase(organizationId: string, purchaseId: string): Promise<void> {
    this.requireDelete(organizationId);
    const existing = this.state.purchases.find(
      (p) => p.id === purchaseId && p.organizationId === organizationId,
    );
    if (!existing) throw new RepositoryError('not_found', 'Achat introuvable.');
    this.state.purchases = this.state.purchases.filter((p) => p.id !== purchaseId);
    this.persist();
  }

  // ---------------------------------------------------------------------------
  // Dépenses
  // ---------------------------------------------------------------------------
  async listExpenses(organizationId: string): Promise<Expense[]> {
    this.member(organizationId);
    return [...this.state.expenses]
      .filter((e) => e.organizationId === organizationId)
      .sort((a, b) => (a.expenseDate < b.expenseDate ? 1 : a.expenseDate > b.expenseDate ? -1 : 0));
  }

  private validateExpenseInput(organizationId: string, input: ExpenseInput): number {
    this.organization(organizationId);
    if (!input.description?.trim()) {
      throw new RepositoryError('validation', 'La description de la dépense est obligatoire.');
    }
    if (!isValidISODate(input.expenseDate)) {
      throw new RepositoryError('validation', 'La date de dépense est invalide.');
    }
    if (input.expenseDate > todayISO()) {
      throw new RepositoryError('validation', 'La date de dépense ne peut pas être dans le futur.');
    }
    const amount = round2(parseAmount(input.amount));
    if (!(amount > 0)) {
      throw new RepositoryError('validation', 'Le montant doit être strictement positif.');
    }
    return amount;
  }

  async createExpense(organizationId: string, input: ExpenseInput): Promise<Expense> {
    this.requireFinanceWrite(organizationId);
    const amount = this.validateExpenseInput(organizationId, input);
    const expense: Expense = {
      id: newId(),
      organizationId,
      expenseDate: input.expenseDate,
      category: input.category,
      description: input.description.trim(),
      amount,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
    };
    this.state.expenses.push(expense);
    this.persist();
    return expense;
  }

  async updateExpense(
    organizationId: string,
    expenseId: string,
    input: ExpenseInput,
  ): Promise<Expense> {
    this.requireFinanceWrite(organizationId);
    const existing = this.state.expenses.find(
      (e) => e.id === expenseId && e.organizationId === organizationId,
    );
    if (!existing) throw new RepositoryError('not_found', 'Dépense introuvable.');
    const amount = this.validateExpenseInput(organizationId, input);
    Object.assign(existing, {
      expenseDate: input.expenseDate,
      category: input.category,
      description: input.description.trim(),
      amount,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
    });
    this.persist();
    return existing;
  }

  async deleteExpense(organizationId: string, expenseId: string): Promise<void> {
    this.requireDelete(organizationId);
    const existing = this.state.expenses.find(
      (e) => e.id === expenseId && e.organizationId === organizationId,
    );
    if (!existing) throw new RepositoryError('not_found', 'Dépense introuvable.');
    this.state.expenses = this.state.expenses.filter((e) => e.id !== expenseId);
    this.persist();
  }

  // ---------------------------------------------------------------------------
  // Finance
  // ---------------------------------------------------------------------------
  async listJournal(organizationId: string, period: Period): Promise<FinanceJournalRow[]> {
    this.member(organizationId);
    return buildJournal(
      {
        invoices: this.state.invoices.filter((i) => i.organizationId === organizationId),
        payments: this.state.payments.filter((p) => p.organizationId === organizationId),
        purchases: this.state.purchases.filter((p) => p.organizationId === organizationId),
        expenses: this.state.expenses.filter((e) => e.organizationId === organizationId),
      },
      period,
    );
  }

  async getServerSummary(organizationId: string, period: Period): Promise<ServerFinanceSummary> {
    this.member(organizationId);
    const summary = computeFinanceSummary(
      {
        invoices: this.state.invoices.filter((i) => i.organizationId === organizationId),
        payments: this.state.payments.filter((p) => p.organizationId === organizationId),
        purchases: this.state.purchases.filter((p) => p.organizationId === organizationId),
        expenses: this.state.expenses.filter((e) => e.organizationId === organizationId),
      },
      period,
    );
    return {
      invoicedHt: summary.revenue.netHt,
      invoicedTax: summary.revenue.tax,
      invoicedTtc: summary.revenue.netTtc,
      creditedHt: summary.revenue.creditedHt,
      collectedOnInvoices: summary.revenue.paidOnIssued,
      outstanding: summary.revenue.outstanding,
      cashIn: summary.cashIn,
      cashOut: summary.cashOut,
      netCash: summary.netCash,
      purchasesTotal: summary.purchasesTotal,
      purchasesPaid: summary.purchasesPaid,
      purchasesDue: summary.purchasesDue,
      cogsTotal: summary.cogsTotal,
      operatingPurchasesTotal: summary.operatingPurchasesTotal,
      capexTotal: summary.capexTotal,
      expensesTotal: summary.expensesTotal,
      grossMargin: summary.grossMargin,
      estimatedResult: summary.estimatedResult,
      draftInvoicesCount: summary.revenue.draftCount,
      draftInvoicesTotal: summary.revenue.draftTtc,
      cancelledInvoicesCount: summary.revenue.cancelledCount,
      cancelledInvoicesTotal: summary.revenue.cancelledTtc,
      cogsAvailable: summary.cogsAvailable,
      partialEstimate: summary.partialEstimate,
    };
  }

  // ---------------------------------------------------------------------------
  // Outils démo
  // ---------------------------------------------------------------------------
  async setSimulatedRole(organizationId: string, role: OrgRole): Promise<void> {
    this.member(organizationId);
    this.state.roleOverrides[organizationId] = role;
    this.persist();
  }

  getSimulatedRole(organizationId: string): OrgRole | null {
    return this.state.roleOverrides[organizationId] ?? null;
  }

  async resetDemoData(): Promise<void> {
    this.state = resetDemoState();
  }

  /** Utilitaire de test : injecte un état complet. */
  replaceState(state: DemoState): void {
    this.state = state;
    this.persist();
  }

  /** Utilitaire de test : accès en lecture à l'état courant. */
  snapshot(): DemoState {
    return this.state;
  }
}

/** Numéro de facture suivant, exposé pour les tests. */
export function demoNextNumber(organizationId: string, kind: 'invoice' | 'credit_note'): number {
  const state = loadDemoState();
  const counter = state.counters[organizationId];
  return (counter?.[kind] ?? 0) + 1;
}

// Réexport utilitaire pour les écrans qui veulent le total d'une liste.
export function invoiceTotalPaid(invoices: Invoice[]): number {
  return sum(invoices.map((i) => i.amountPaid));
}

export { DEMO_USER_EMAIL };
