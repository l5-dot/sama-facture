import type {
  ExpenseCategory,
  InvoiceStatus,
  OrgRole,
  PaymentMethod,
  PurchaseCategory,
} from './types';

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  sent: 'Émise',
  partial: 'Partiellement payée',
  paid: 'Payée',
  cancelled: 'Annulée',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  especes: 'Espèces',
  wave: 'Wave',
  orange_money: 'Orange Money',
  virement: 'Virement',
  cheque: 'Chèque',
  carte: 'Carte bancaire',
  autre: 'Autre',
};

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  comptable: 'Comptable',
  vendeur: 'Vendeur',
};

export interface PurchaseCategoryMeta {
  label: string;
  description: string;
  /** Compte dans le coût des marchandises vendues (approche simplifiée). */
  cogs: boolean;
  /** Investissement : exclu du résultat estimé. */
  capex: boolean;
}

export const PURCHASE_CATEGORIES: Record<PurchaseCategory, PurchaseCategoryMeta> = {
  marchandises: {
    label: 'Marchandises',
    description: 'Biens achetés pour être revendus en l’état (COGS).',
    cogs: true,
    capex: false,
  },
  matieres_premieres: {
    label: 'Matières premières',
    description: 'Matières transformées puis revendues (COGS).',
    cogs: true,
    capex: false,
  },
  fournitures: {
    label: 'Fournitures',
    description: 'Consommables et petites fournitures d’exploitation.',
    cogs: false,
    capex: false,
  },
  services: {
    label: 'Services & sous-traitance',
    description: 'Prestations achetées à des tiers (transport, sous-traitance…).',
    cogs: false,
    capex: false,
  },
  equipement: {
    label: 'Équipement / investissement',
    description: 'Immobilisation durable : exclue du résultat estimé de la période.',
    cogs: false,
    capex: true,
  },
  autre: {
    label: 'Autre achat',
    description: 'Achat professionnel non classé, traité comme charge d’exploitation.',
    cogs: false,
    capex: false,
  },
};

export const PURCHASE_CATEGORY_ORDER: PurchaseCategory[] = [
  'marchandises',
  'matieres_premieres',
  'fournitures',
  'services',
  'equipement',
  'autre',
];

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, { label: string; description: string }> = {
  transport: { label: 'Transport', description: 'Carburant, courses, déplacements.' },
  loyer: { label: 'Loyer', description: 'Loyer du local commercial ou de l’atelier.' },
  salaires: { label: 'Salaires', description: 'Salaires, primes et charges sociales.' },
  electricite_internet: {
    label: 'Électricité & Internet',
    description: 'Sénélec, abonnement internet, téléphone.',
  },
  marketing: { label: 'Marketing', description: 'Publicité, réseaux sociaux, impression.' },
  frais_bancaires: { label: 'Frais bancaires', description: 'Tenue de compte, commissions, agios.' },
  autre: { label: 'Autres dépenses', description: 'Toute autre charge d’exploitation.' },
};

export const EXPENSE_CATEGORY_ORDER: ExpenseCategory[] = [
  'transport',
  'loyer',
  'salaires',
  'electricite_internet',
  'marketing',
  'frais_bancaires',
  'autre',
];

export const PURCHASE_PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  'especes',
  'wave',
  'orange_money',
  'virement',
  'cheque',
  'carte',
  'autre',
];

/** Rôles autorisés à enregistrer achats / dépenses / encaissements. */
export const FINANCE_WRITE_ROLES: OrgRole[] = ['owner', 'admin', 'comptable'];
/** Rôles autorisés à supprimer une pièce financière. */
export const FINANCE_DELETE_ROLES: OrgRole[] = ['owner', 'admin'];
