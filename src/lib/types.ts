/**
 * Types métier partagés par l'application et le moteur de calcul financier.
 *
 * Les montants manipulés côté client sont des `number` (FCFA entiers en
 * pratique) arrondis à 2 décimales. La base PostgreSQL stocke les montants en
 * `numeric(14,2)` : l'API renvoie des chaînes, converties à la frontière par
 * la couche de données (`parseAmount`).
 */

export type OrgRole = 'owner' | 'admin' | 'comptable' | 'vendeur';

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled';
export type InvoiceKind = 'invoice' | 'credit_note';

export type PaymentMethod =
  | 'especes'
  | 'wave'
  | 'orange_money'
  | 'virement'
  | 'cheque'
  | 'carte'
  | 'autre';

export type PurchaseCategory =
  | 'marchandises'
  | 'matieres_premieres'
  | 'fournitures'
  | 'services'
  | 'equipement'
  | 'autre';

export type ExpenseCategory =
  | 'transport'
  | 'loyer'
  | 'salaires'
  | 'electricite_internet'
  | 'marketing'
  | 'frais_bancaires'
  | 'autre';

export interface Organization {
  id: string;
  name: string;
  currency: string;
  country: string;
  ninea: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  logoUrl: string | null;
}

export interface Member {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  fullName: string | null;
  email: string | null;
}

export interface Client {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  ninea: string | null;
  notes: string | null;
  archived: boolean;
}

export interface Product {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  sku: string | null;
  unit: string;
  unitPrice: number;
  costPrice: number | null;
  taxRate: number;
  trackStock: boolean;
  stockQuantity: number;
  archived: boolean;
}

export interface InvoiceItem {
  id?: string;
  invoiceId?: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxRate: number;
  lineSubtotalHt?: number;
}

export interface Invoice {
  id: string;
  organizationId: string;
  clientId: string | null;
  clientName: string | null;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  issueDate: string; // YYYY-MM-DD
  dueDate: string | null;
  currency: string;
  notes: string | null;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  subtotalHt: number;
  discountTotal: number;
  netHt: number;
  taxTotal: number;
  totalTtc: number;
  amountPaid: number;
  amountDue: number;
  items: InvoiceItem[];
}

export interface Payment {
  id: string;
  organizationId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  amount: number;
  method: PaymentMethod;
  paidAt: string; // YYYY-MM-DD
  reference: string | null;
  notes: string | null;
}

export interface Purchase {
  id: string;
  organizationId: string;
  supplierName: string | null;
  supplierInvoiceNumber: string | null;
  purchaseDate: string;
  description: string;
  category: PurchaseCategory;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  amountPaid: number;
  amountDue: number;
  isCogs: boolean;
  isCapex: boolean;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
}

export type PurchaseInput = Omit<
  Purchase,
  'id' | 'organizationId' | 'totalAmount' | 'amountDue' | 'isCogs' | 'isCapex'
>;

export interface Expense {
  id: string;
  organizationId: string;
  expenseDate: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  reference: string | null;
  notes: string | null;
}

export type ExpenseInput = Omit<Expense, 'id' | 'organizationId'>;

export interface FinanceJournalRow {
  id: string;
  occurredOn: string;
  source: 'facture' | 'avoir' | 'paiement' | 'achat' | 'depense';
  sourceId: string;
  reference: string;
  counterparty: string;
  category: string;
  amountHt: number;
  amountTax: number;
  amountTtc: number;
  cashIn: number;
  cashOut: number;
  isCogs: boolean;
}
