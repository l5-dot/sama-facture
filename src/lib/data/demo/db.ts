/**
 * Stockage local du mode démonstration.
 *
 * Le mode démo existe pour que l'application soit utilisable sans backend
 * configuré (et pour les tests/e2e). Il reproduit la base : mêmes entités,
 * mêmes invariants, mêmes contrôles de rôle. Les données restent dans le
 * navigateur, jamais envoyées ailleurs.
 */

import { computeInvoiceTotals, statusFromPayments } from '../../invoices';
import { sum } from '../../money';
import type {
  Client,
  Expense,
  Invoice,
  InvoiceItem,
  InvoiceKind,
  InvoiceStatus,
  Member,
  Organization,
  OrgRole,
  Payment,
  Product,
  Purchase,
} from '../../types';

export const DEMO_STATE_VERSION = 3;
const STORAGE_KEY = 'sama-facture.demo.v3';
export const DEMO_USER_ID = 'demo-user-awa';
export const DEMO_USER_EMAIL = 'awa@takhabouli.sn';

export interface DemoState {
  version: number;
  sessionUserId: string;
  organizations: Organization[];
  members: Member[];
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  purchases: Purchase[];
  expenses: Expense[];
  counters: Record<string, { invoice: number; credit_note: number }>;
  roleOverrides: Record<string, OrgRole>;
}

export interface DemoUser {
  id: string;
  email: string;
  fullName: string;
}

export const DEMO_USERS: DemoUser[] = [
  { id: DEMO_USER_ID, email: DEMO_USER_EMAIL, fullName: 'Awa Ndiaye' },
  { id: 'demo-user-modou', email: 'modou@takhabouli.sn', fullName: 'Modou Sarr' },
  { id: 'demo-user-marieme', email: 'marieme@atelier-ndiaye.sn', fullName: 'Marième Ndiaye' },
];

// -----------------------------------------------------------------------------
// Jeu de données de démonstration
// -----------------------------------------------------------------------------
function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split('-').map(Number);
  return iso(new Date(year, month - 1, day + days));
}

function buildSeed(): DemoState {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  /** Jour récent, borné au début du mois courant, pour rester dans la période. */
  const recent = (daysAgo: number): string => {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return iso(date < monthStart ? monthStart : date);
  };
  /** Jour d'un mois précédent (1 = mois dernier). */
  const pastMonth = (monthsAgo: number, day: number): string =>
    iso(new Date(today.getFullYear(), today.getMonth() - monthsAgo, day));

  const orgA: Organization = {
    id: 'org-takhabouli',
    name: 'Takhabouli Boutique',
    currency: 'XOF',
    country: 'SN',
    ninea: '0054321987',
    email: 'contact@takhabouli.sn',
    phone: '+221 77 123 45 67',
    address: 'Marché Tilène, Dakar',
    logoUrl: null,
  };

  const orgB: Organization = {
    id: 'org-atelier',
    name: 'Atelier Ndiaye Couture',
    currency: 'XOF',
    country: 'SN',
    ninea: '0076543210',
    email: 'bonjour@atelier-ndiaye.sn',
    phone: '+221 76 987 65 43',
    address: 'Médina, Dakar',
    logoUrl: null,
  };

  const members: Member[] = [
    {
      id: 'mem-awa-takhabouli',
      organizationId: orgA.id,
      userId: DEMO_USER_ID,
      role: 'owner',
      fullName: 'Awa Ndiaye',
      email: DEMO_USER_EMAIL,
    },
    {
      id: 'mem-modou-takhabouli',
      organizationId: orgA.id,
      userId: 'demo-user-modou',
      role: 'vendeur',
      fullName: 'Modou Sarr',
      email: 'modou@takhabouli.sn',
    },
    {
      id: 'mem-awa-atelier',
      organizationId: orgB.id,
      userId: DEMO_USER_ID,
      role: 'admin',
      fullName: 'Awa Ndiaye',
      email: DEMO_USER_EMAIL,
    },
  ];

  const clients: Client[] = [
    {
      id: 'cli-mamadou',
      organizationId: orgA.id,
      name: 'Mamadou Diop',
      email: 'mamadou.diop@example.sn',
      phone: '+221 78 111 22 33',
      address: 'Sacré-Cœur, Dakar',
      ninea: null,
      notes: null,
      archived: false,
    },
    {
      id: 'cli-aissatou',
      organizationId: orgA.id,
      name: 'Aïssatou Fall',
      email: 'aissatou.fall@example.sn',
      phone: '+221 77 444 55 66',
      address: 'Almadies, Dakar',
      ninea: null,
      notes: null,
      archived: false,
    },
    {
      id: 'cli-keur-massar',
      organizationId: orgA.id,
      name: 'Boutique Keur Massar',
      email: 'achats@keurmassar.sn',
      phone: '+221 76 222 33 44',
      address: 'Keur Massar',
      ninea: '0099876543',
      notes: 'Client grossiste — TVA 18 %.',
      archived: false,
    },
    {
      id: 'cli-fatou',
      organizationId: orgA.id,
      name: 'Fatou Sow',
      email: null,
      phone: '+221 70 777 88 99',
      address: 'Point E, Dakar',
      ninea: null,
      notes: null,
      archived: false,
    },
    {
      id: 'cli-atelier-1',
      organizationId: orgB.id,
      name: 'Couture & Cie',
      email: 'contact@couturecie.sn',
      phone: '+221 77 000 11 22',
      address: 'Plateau, Dakar',
      ninea: null,
      notes: null,
      archived: false,
    },
  ];

  const products: Product[] = [
    {
      id: 'prod-tshirt',
      organizationId: orgA.id,
      name: 'T-shirt Premium',
      description: 'Coton 100 %, tailles S à XL.',
      sku: 'TS-PREM',
      unit: 'pièce',
      unitPrice: 8000,
      costPrice: 4500,
      taxRate: 0,
      trackStock: true,
      stockQuantity: 42,
      archived: false,
    },
    {
      id: 'prod-chaussures',
      organizationId: orgA.id,
      name: 'Chaussures Sport',
      description: 'Baskets running, pointures 39 à 45.',
      sku: 'CH-SPORT',
      unit: 'paire',
      unitPrice: 19000,
      costPrice: 12000,
      taxRate: 0,
      trackStock: true,
      stockQuantity: 18,
      archived: false,
    },
    {
      id: 'prod-sac',
      organizationId: orgA.id,
      name: 'Sac à main',
      description: 'Sac en cuir synthétique.',
      sku: 'SA-CUIR',
      unit: 'pièce',
      unitPrice: 25000,
      costPrice: 15000,
      taxRate: 0,
      trackStock: true,
      stockQuantity: 9,
      archived: false,
    },
    {
      id: 'prod-livraison',
      organizationId: orgA.id,
      name: 'Livraison Dakar',
      description: 'Livraison à domicile dans Dakar.',
      sku: null,
      unit: 'course',
      unitPrice: 3000,
      costPrice: null,
      taxRate: 0,
      trackStock: false,
      stockQuantity: 0,
      archived: false,
    },
    {
      id: 'prod-atelier-1',
      organizationId: orgB.id,
      name: 'Robe sur mesure',
      description: 'Confection sur mesure, tissu inclus.',
      sku: 'ROBE-SM',
      unit: 'pièce',
      unitPrice: 45000,
      costPrice: 15000,
      taxRate: 0,
      trackStock: false,
      stockQuantity: 0,
      archived: false,
    },
  ];

  const invoices: Invoice[] = [];
  const payments: Payment[] = [];

  interface SeedInvoiceOptions {
    id: string;
    organizationId: string;
    number: string;
    kind?: InvoiceKind;
    status?: InvoiceStatus;
    clientId: string | null;
    issueDate: string;
    dueDate?: string | null;
    items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      discountPercent?: number;
      taxRate?: number;
      productId?: string | null;
    }>;
    discountType?: 'none' | 'percent' | 'fixed';
    discountValue?: number;
    notes?: string | null;
    payments?: Array<{
      amount: number;
      method: Payment['method'];
      paidAt: string;
      reference?: string;
    }>;
  }

  const addInvoice = (options: SeedInvoiceOptions) => {
    const items: InvoiceItem[] = options.items.map((item, index) => ({
      id: `${options.id}-item-${index + 1}`,
      invoiceId: options.id,
      productId: item.productId ?? null,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent ?? 0,
      taxRate: item.taxRate ?? 0,
    }));

    const computed = computeInvoiceTotals(items, options.discountType ?? 'none', options.discountValue ?? 0);
    const invoicePayments: Payment[] = (options.payments ?? []).map((payment, index) => ({
      id: `${options.id}-pay-${index + 1}`,
      organizationId: options.organizationId,
      invoiceId: options.id,
      invoiceNumber: options.number,
      clientName: clients.find((c) => c.id === options.clientId)?.name ?? null,
      amount: payment.amount,
      method: payment.method,
      paidAt: payment.paidAt,
      reference: payment.reference ?? null,
      notes: null,
    }));

    const amountPaid = sum(invoicePayments.map((p) => p.amount));
    const baseStatus = options.status ?? 'sent';
    const status = statusFromPayments(baseStatus, computed.totalTtc, amountPaid);

    invoices.push({
      id: options.id,
      organizationId: options.organizationId,
      clientId: options.clientId,
      clientName: clients.find((c) => c.id === options.clientId)?.name ?? null,
      number: options.number,
      kind: options.kind ?? 'invoice',
      status,
      issueDate: options.issueDate,
      dueDate: options.dueDate ?? null,
      currency: 'XOF',
      notes: options.notes ?? null,
      discountType: options.discountType ?? 'none',
      discountValue: options.discountValue ?? 0,
      subtotalHt: computed.subtotalHt,
      discountTotal: computed.discountTotal,
      netHt: computed.netHt,
      taxTotal: computed.taxTotal,
      totalTtc: computed.totalTtc,
      amountPaid,
      amountDue: Math.max(computed.totalTtc - amountPaid, 0),
      items: computed.items,
    });
    payments.push(...invoicePayments);
  };

  // ---- Mois en cours -------------------------------------------------------
  addInvoice({
    id: 'inv-1',
    organizationId: orgA.id,
    number: 'FACT-0001',
    clientId: 'cli-mamadou',
    issueDate: recent(24),
    dueDate: addDays(recent(24), 30),
    items: [
      { description: 'T-shirt Premium', quantity: 2, unitPrice: 8000, productId: 'prod-tshirt' },
      { description: 'Chaussures Sport', quantity: 1, unitPrice: 19000, productId: 'prod-chaussures' },
    ],
    payments: [{ amount: 35000, method: 'wave', paidAt: recent(22), reference: 'WAVE-8842' }],
    notes: 'Livraison offerte dans Dakar.',
  });

  addInvoice({
    id: 'inv-2',
    organizationId: orgA.id,
    number: 'FACT-0002',
    clientId: 'cli-aissatou',
    issueDate: recent(18),
    dueDate: addDays(recent(18), 30),
    items: [{ description: 'Sac à main', quantity: 1, unitPrice: 25000, productId: 'prod-sac' }],
    payments: [{ amount: 10000, method: 'orange_money', paidAt: recent(16), reference: 'OM-3321' }],
    notes: 'Solde attendu à la livraison.',
  });

  addInvoice({
    id: 'inv-3',
    organizationId: orgA.id,
    number: 'FACT-0003',
    clientId: 'cli-keur-massar',
    issueDate: recent(10),
    dueDate: addDays(recent(10), 30),
    items: [
      {
        description: 'T-shirt Premium (lot grossiste)',
        quantity: 10,
        unitPrice: 8000,
        taxRate: 18,
        productId: 'prod-tshirt',
      },
    ],
    discountType: 'percent',
    discountValue: 5,
    notes: 'Remise grossiste 5 % — TVA 18 %.',
  });

  addInvoice({
    id: 'inv-4',
    organizationId: orgA.id,
    number: 'FACT-0004',
    status: 'draft',
    clientId: 'cli-fatou',
    issueDate: recent(3),
    items: [{ description: 'T-shirt Premium', quantity: 3, unitPrice: 8000, productId: 'prod-tshirt' }],
    notes: 'Devis en attente de confirmation.',
  });

  addInvoice({
    id: 'inv-5',
    organizationId: orgA.id,
    number: 'FACT-0005',
    status: 'cancelled',
    clientId: 'cli-mamadou',
    issueDate: recent(8),
    items: [{ description: 'Livraison Dakar', quantity: 1, unitPrice: 3000, productId: 'prod-livraison' }],
    notes: 'Annulée : client venu retirer sa commande.',
  });

  addInvoice({
    id: 'inv-6',
    organizationId: orgA.id,
    number: 'AV-0001',
    kind: 'credit_note',
    clientId: 'cli-mamadou',
    issueDate: recent(5),
    items: [{ description: 'Retour T-shirt Premium', quantity: 1, unitPrice: 8000, productId: 'prod-tshirt' }],
    notes: 'Avoir sur retour marchandise.',
  });

  // ---- Mois précédents -----------------------------------------------------
  addInvoice({
    id: 'inv-7',
    organizationId: orgA.id,
    number: 'FACT-0006',
    clientId: 'cli-aissatou',
    issueDate: pastMonth(1, 5),
    dueDate: addDays(pastMonth(1, 5), 30),
    items: [{ description: 'Sac à main', quantity: 2, unitPrice: 25000, productId: 'prod-sac' }],
    payments: [{ amount: 50000, method: 'virement', paidAt: pastMonth(1, 12), reference: 'VIR-0021' }],
  });

  addInvoice({
    id: 'inv-8',
    organizationId: orgA.id,
    number: 'FACT-0007',
    clientId: 'cli-keur-massar',
    issueDate: pastMonth(1, 20),
    dueDate: addDays(pastMonth(1, 20), 30),
    items: [{ description: 'Chaussures Sport', quantity: 5, unitPrice: 19000, productId: 'prod-chaussures' }],
    payments: [{ amount: 40000, method: 'especes', paidAt: recent(14), reference: 'ESP-118' }],
    notes: 'Acompte versé ce mois-ci.',
  });

  addInvoice({
    id: 'inv-9',
    organizationId: orgA.id,
    number: 'FACT-0008',
    clientId: 'cli-mamadou',
    issueDate: pastMonth(2, 10),
    items: [{ description: 'Sac à main', quantity: 3, unitPrice: 25000, productId: 'prod-sac' }],
    payments: [{ amount: 75000, method: 'wave', paidAt: pastMonth(2, 15), reference: 'WAVE-7712' }],
  });

  addInvoice({
    id: 'inv-10',
    organizationId: orgA.id,
    number: 'FACT-0009',
    clientId: 'cli-fatou',
    issueDate: pastMonth(3, 12),
    items: [{ description: 'T-shirt Premium', quantity: 4, unitPrice: 8000, productId: 'prod-tshirt' }],
    payments: [{ amount: 32000, method: 'especes', paidAt: pastMonth(3, 12) }],
  });

  addInvoice({
    id: 'inv-11',
    organizationId: orgA.id,
    number: 'FACT-0010',
    clientId: 'cli-aissatou',
    issueDate: pastMonth(4, 8),
    items: [{ description: 'Sac à main', quantity: 1, unitPrice: 25000, productId: 'prod-sac' }],
    payments: [{ amount: 25000, method: 'orange_money', paidAt: pastMonth(4, 9) }],
  });

  // ---- Organisation B (isolation) -----------------------------------------
  addInvoice({
    id: 'inv-b1',
    organizationId: orgB.id,
    number: 'FACT-0001',
    clientId: 'cli-atelier-1',
    issueDate: recent(7),
    items: [{ description: 'Robe sur mesure', quantity: 1, unitPrice: 45000, productId: 'prod-atelier-1' }],
    payments: [{ amount: 45000, method: 'wave', paidAt: recent(6) }],
  });

  const purchases: Purchase[] = [
    {
      id: 'pur-1',
      organizationId: orgA.id,
      supplierName: 'Marché Sandaga',
      supplierInvoiceNumber: 'FS-2026-118',
      purchaseDate: recent(20),
      description: 'Lot de 20 t-shirts coton',
      category: 'marchandises',
      quantity: 20,
      unitPrice: 4500,
      totalAmount: 90000,
      amountPaid: 60000,
      amountDue: 30000,
      isCogs: true,
      isCapex: false,
      paymentMethod: 'especes',
      notes: 'Reste à régler fin de mois.',
    },
    {
      id: 'pur-2',
      organizationId: orgA.id,
      supplierName: 'Grossiste Yao',
      supplierInvoiceNumber: 'GY-4452',
      purchaseDate: recent(15),
      description: '10 paires de chaussures sport',
      category: 'marchandises',
      quantity: 10,
      unitPrice: 12000,
      totalAmount: 120000,
      amountPaid: 120000,
      amountDue: 0,
      isCogs: true,
      isCapex: false,
      paymentMethod: 'wave',
      notes: null,
    },
    {
      id: 'pur-3',
      organizationId: orgA.id,
      supplierName: 'Papeterie Dakar',
      supplierInvoiceNumber: null,
      purchaseDate: recent(12),
      description: 'Sacs et étiquettes de caisse',
      category: 'fournitures',
      quantity: 10,
      unitPrice: 1500,
      totalAmount: 15000,
      amountPaid: 15000,
      amountDue: 0,
      isCogs: false,
      isCapex: false,
      paymentMethod: 'especes',
      notes: null,
    },
    {
      id: 'pur-4',
      organizationId: orgA.id,
      supplierName: 'Sénélec Store',
      supplierInvoiceNumber: 'SEN-9081',
      purchaseDate: recent(6),
      description: 'Congélateur vitrine 300 L',
      category: 'equipement',
      quantity: 1,
      unitPrice: 250000,
      totalAmount: 250000,
      amountPaid: 100000,
      amountDue: 150000,
      isCogs: false,
      isCapex: true,
      paymentMethod: 'virement',
      notes: 'Investissement — exclu du résultat estimé.',
    },
    {
      id: 'pur-5',
      organizationId: orgA.id,
      supplierName: 'Marché Sandaga',
      supplierInvoiceNumber: 'FS-2026-104',
      purchaseDate: pastMonth(1, 12),
      description: 'Lot de 16 t-shirts',
      category: 'marchandises',
      quantity: 16,
      unitPrice: 5000,
      totalAmount: 80000,
      amountPaid: 80000,
      amountDue: 0,
      isCogs: true,
      isCapex: false,
      paymentMethod: 'especes',
      notes: null,
    },
    {
      id: 'pur-6',
      organizationId: orgA.id,
      supplierName: 'Grossiste Yao',
      supplierInvoiceNumber: 'GY-4100',
      purchaseDate: pastMonth(2, 8),
      description: 'Lot de 5 sacs à main',
      category: 'marchandises',
      quantity: 5,
      unitPrice: 12000,
      totalAmount: 60000,
      amountPaid: 60000,
      amountDue: 0,
      isCogs: true,
      isCapex: false,
      paymentMethod: 'especes',
      notes: null,
    },
    {
      id: 'pur-7',
      organizationId: orgA.id,
      supplierName: 'Papeterie Dakar',
      supplierInvoiceNumber: null,
      purchaseDate: pastMonth(1, 20),
      description: 'Consommables d’emballage',
      category: 'fournitures',
      quantity: 4,
      unitPrice: 5000,
      totalAmount: 20000,
      amountPaid: 20000,
      amountDue: 0,
      isCogs: false,
      isCapex: false,
      paymentMethod: 'especes',
      notes: null,
    },
    {
      id: 'pur-b1',
      organizationId: orgB.id,
      supplierName: 'Tissus Médina',
      supplierInvoiceNumber: 'TM-771',
      purchaseDate: recent(9),
      description: 'Tissu wax (2 coupons)',
      category: 'matieres_premieres',
      quantity: 2,
      unitPrice: 10000,
      totalAmount: 20000,
      amountPaid: 20000,
      amountDue: 0,
      isCogs: true,
      isCapex: false,
      paymentMethod: 'especes',
      notes: null,
    },
  ];

  const expenses: Expense[] = [
    {
      id: 'exp-1',
      organizationId: orgA.id,
      expenseDate: recent(25),
      category: 'loyer',
      description: 'Loyer boutique — mois en cours',
      amount: 75000,
      reference: 'LOY-1026',
      notes: null,
    },
    {
      id: 'exp-2',
      organizationId: orgA.id,
      expenseDate: recent(25),
      category: 'salaires',
      description: 'Salaire vendeuse',
      amount: 150000,
      reference: 'SAL-1026',
      notes: null,
    },
    {
      id: 'exp-3',
      organizationId: orgA.id,
      expenseDate: recent(20),
      category: 'electricite_internet',
      description: 'Sénélec + abonnement fibre',
      amount: 35000,
      reference: 'SENELEC-88213',
      notes: null,
    },
    {
      id: 'exp-4',
      organizationId: orgA.id,
      expenseDate: recent(18),
      category: 'transport',
      description: 'Carburant et courses',
      amount: 20000,
      reference: null,
      notes: null,
    },
    {
      id: 'exp-5',
      organizationId: orgA.id,
      expenseDate: recent(10),
      category: 'marketing',
      description: 'Publicité Instagram',
      amount: 25000,
      reference: 'META-9912',
      notes: null,
    },
    {
      id: 'exp-6',
      organizationId: orgA.id,
      expenseDate: recent(5),
      category: 'frais_bancaires',
      description: 'Frais de tenue de compte',
      amount: 5000,
      reference: 'CBAO-1026',
      notes: null,
    },
    {
      id: 'exp-7',
      organizationId: orgA.id,
      expenseDate: pastMonth(1, 2),
      category: 'loyer',
      description: 'Loyer boutique — mois dernier',
      amount: 75000,
      reference: 'LOY-0926',
      notes: null,
    },
    {
      id: 'exp-8',
      organizationId: orgA.id,
      expenseDate: pastMonth(1, 28),
      category: 'salaires',
      description: 'Salaire vendeuse — mois dernier',
      amount: 145000,
      reference: 'SAL-0926',
      notes: null,
    },
    {
      id: 'exp-9',
      organizationId: orgA.id,
      expenseDate: pastMonth(1, 15),
      category: 'transport',
      description: 'Livraisons clients',
      amount: 18000,
      reference: null,
      notes: null,
    },
    {
      id: 'exp-10',
      organizationId: orgA.id,
      expenseDate: pastMonth(2, 3),
      category: 'loyer',
      description: 'Loyer boutique',
      amount: 75000,
      reference: 'LOY-0826',
      notes: null,
    },
    {
      id: 'exp-b1',
      organizationId: orgB.id,
      expenseDate: recent(12),
      category: 'loyer',
      description: 'Loyer atelier',
      amount: 40000,
      reference: 'LOY-AT-1026',
      notes: null,
    },
  ];

  return {
    version: DEMO_STATE_VERSION,
    sessionUserId: DEMO_USER_ID,
    organizations: [orgA, orgB],
    members,
    clients,
    products,
    invoices,
    payments,
    purchases,
    expenses,
    counters: {
      [orgA.id]: { invoice: 10, credit_note: 1 },
      [orgB.id]: { invoice: 1, credit_note: 0 },
    },
    roleOverrides: {},
  };
}

// -----------------------------------------------------------------------------
// Persistance
// -----------------------------------------------------------------------------
let memoryState: DemoState | null = null;

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadDemoState(): DemoState {
  if (memoryState) return memoryState;
  const store = storage();
  if (store) {
    try {
      const raw = store.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DemoState;
        if (parsed?.version === DEMO_STATE_VERSION && Array.isArray(parsed.organizations)) {
          memoryState = parsed;
          return parsed;
        }
      }
    } catch {
      // Données corrompues : on repart du jeu de démonstration.
    }
  }
  const seed = buildSeed();
  memoryState = seed;
  saveDemoState(seed);
  return seed;
}

export function saveDemoState(state: DemoState): void {
  memoryState = state;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota dépassé ou stockage indisponible : la session reste en mémoire.
  }
}

export function resetDemoState(): DemoState {
  const seed = buildSeed();
  saveDemoState(seed);
  return seed;
}
