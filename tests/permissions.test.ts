import { describe, expect, it } from 'vitest';
import {
  canDeleteFinance,
  canDeleteInvoice,
  canManageInvoices,
  canManageOrganization,
  canRecordPayment,
  canWriteFinances,
} from '../src/lib/permissions';
import type { OrgRole } from '../src/lib/types';

const roles: OrgRole[] = ['owner', 'admin', 'comptable', 'vendeur'];

describe('matrice des permissions', () => {
  it('réserve la gestion de l’organisation aux propriétaires et admins', () => {
    expect(roles.filter(canManageOrganization)).toEqual(['owner', 'admin']);
  });

  it('autorise les rôles financiers à saisir achats et dépenses', () => {
    expect(roles.filter(canWriteFinances)).toEqual(['owner', 'admin', 'comptable']);
  });

  it('réserve la suppression d’une pièce financière aux admins', () => {
    expect(roles.filter(canDeleteFinance)).toEqual(['owner', 'admin']);
  });

  it('autorise les vendeurs à gérer les factures mais pas la caisse', () => {
    expect(canManageInvoices('vendeur')).toBe(true);
    expect(canWriteFinances('vendeur')).toBe(false);
    expect(canRecordPayment('vendeur')).toBe(false);
  });

  it('autorise le comptable à encaisser mais pas à supprimer', () => {
    expect(canRecordPayment('comptable')).toBe(true);
    expect(canDeleteFinance('comptable')).toBe(false);
    expect(canManageOrganization('comptable')).toBe(false);
  });

  it('n’autorise la suppression que des factures brouillon', () => {
    expect(canDeleteInvoice('owner', 'draft')).toBe(true);
    expect(canDeleteInvoice('owner', 'sent')).toBe(false);
    expect(canDeleteInvoice('admin', 'cancelled')).toBe(false);
    expect(canDeleteInvoice('vendeur', 'draft')).toBe(false);
  });

  it('refuse tout à un rôle absent', () => {
    expect(canManageOrganization(null)).toBe(false);
    expect(canWriteFinances(undefined)).toBe(false);
    expect(canRecordPayment(null)).toBe(false);
    expect(canDeleteInvoice(null, 'draft')).toBe(false);
  });
});
