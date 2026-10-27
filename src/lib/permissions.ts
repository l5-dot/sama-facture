/**
 * Règles de permissions côté application.
 *
 * ⚠️ Elles reflètent les policies RLS mais ne les remplacent pas : la base
 * reste l'autorité. Ces fonctions servent à masquer les actions interdites et à
 * afficher un message clair, pas à sécuriser les données.
 */

import { FINANCE_DELETE_ROLES, FINANCE_WRITE_ROLES } from './constants';
import type { InvoiceStatus, OrgRole } from './types';

export function canManageOrganization(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

/** Achats, dépenses, encaissements : owner, admin, comptable. */
export function canWriteFinances(role: OrgRole | null | undefined): boolean {
  return !!role && FINANCE_WRITE_ROLES.includes(role);
}

/** Suppression d'une pièce financière : owner, admin uniquement. */
export function canDeleteFinance(role: OrgRole | null | undefined): boolean {
  return !!role && FINANCE_DELETE_ROLES.includes(role);
}

/** Création / modification de factures : owner, admin, vendeur. */
export function canManageInvoices(role: OrgRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'vendeur';
}

export function canDeleteInvoice(role: OrgRole | null | undefined, status: InvoiceStatus): boolean {
  return canManageOrganization(role) && status === 'draft';
}

export function canRecordPayment(role: OrgRole | null | undefined): boolean {
  return canWriteFinances(role);
}

/** Libellé expliquant pourquoi une action est désactivée. */
export function financeDeniedMessage(role: OrgRole | null | undefined): string {
  if (!role) return 'Aucun rôle attribué dans cette organisation.';
  return 'Votre rôle ne permet pas de modifier les achats et dépenses. Demandez à un propriétaire ou administrateur.';
}

export function deleteDeniedMessage(role: OrgRole | null | undefined): string {
  if (!role) return 'Aucun rôle attribué dans cette organisation.';
  return 'Seuls le propriétaire et les administrateurs peuvent supprimer une opération financière.';
}
