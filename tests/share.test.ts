/**
 * Partage WhatsApp et impression PDF d'une facture.
 *
 * Ces deux usages sont ceux qu'un commerçant utilise tous les jours : envoyer la
 * facture sur WhatsApp et l'imprimer. On vérifie aussi l'échappement HTML, car
 * les noms de clients viennent de la saisie.
 */

import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  invoicePrintHtml,
  invoiceShareText,
  toWhatsAppNumber,
  whatsappShareUrl,
} from '../src/lib/share';
import { makeInvoice } from './fixtures';
import type { Client, Organization, Payment } from '../src/lib/types';

const org: Pick<Organization, 'name' | 'phone' | 'ninea' | 'address'> = {
  name: 'Takhabouli Boutique',
  phone: '77 123 45 67',
  ninea: '0051234567',
  address: 'Marché Tilène, Dakar',
};

const client: Client = {
  id: 'client-1',
  organizationId: 'org-1',
  name: 'Awa Ndiaye',
  email: null,
  phone: '+221 77 987 65 43',
  address: 'Médina, Dakar',
  ninea: null,
  notes: null,
  archived: false,
};

function invoice(overrides: Parameters<typeof makeInvoice>[0] = {}) {
  return makeInvoice({
    number: 'FACT-0001',
    clientName: 'Awa Ndiaye',
    status: 'partial',
    subtotalHt: 85000,
    netHt: 85000,
    taxTotal: 15300,
    totalTtc: 100300,
    amountPaid: 40000,
    amountDue: 60300,
    items: [
      {
        productId: null,
        description: 'Tissu bazin riche',
        quantity: 2,
        unitPrice: 40000,
        discountPercent: 0,
        taxRate: 18,
      },
      {
        productId: null,
        description: 'Broderie',
        quantity: 1,
        unitPrice: 5000,
        discountPercent: 0,
        taxRate: 18,
      },
    ],
    ...overrides,
  });
}

describe('numéro WhatsApp', () => {
  it('convertit un numéro sénégalais local au format international', () => {
    expect(toWhatsAppNumber('77 123 45 67')).toBe('221771234567');
    expect(toWhatsAppNumber('+221 77 987 65 43')).toBe('221779876543');
    expect(toWhatsAppNumber('00221779876543')).toBe('221779876543');
  });

  it('renvoie null pour un numéro inexploitable', () => {
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber('')).toBeNull();
    expect(toWhatsAppNumber('12345')).toBeNull();
  });
});

describe('message de partage', () => {
  it('résume la facture, le reste dû et les moyens de paiement', () => {
    const text = invoiceShareText({ invoice: invoice(), organization: org });
    expect(text).toContain('Facture FACT-0001 — Takhabouli Boutique');
    expect(text).toContain('Reste à régler');
    expect(text).toContain('Wave');
    expect(text).toContain('NINEA : 0051234567');
  });

  it('indique qu’une facture soldée est réglée', () => {
    const text = invoiceShareText({
      invoice: invoice({ status: 'paid', amountDue: 0, amountPaid: 89530 }),
      organization: org,
    });
    expect(text).toContain('Facture réglée');
    expect(text).not.toContain('Reste à régler');
  });

  it('utilise le numéro du client quand il est connu', () => {
    const url = whatsappShareUrl({ invoice: invoice(), organization: org, client });
    expect(url.startsWith('https://wa.me/221779876543?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toContain('FACT-0001');
  });

  it('ouvre le sélecteur de contact sans numéro client', () => {
    const url = whatsappShareUrl({ invoice: invoice(), organization: org, client: null });
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
  });
});

describe('document imprimable', () => {
  it('contient l’en-tête, les lignes et les totaux', () => {
    const html = invoicePrintHtml({ invoice: invoice(), organization: org, client });
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Takhabouli Boutique');
    expect(html).toContain('FACT-0001');
    expect(html).toContain('Awa Ndiaye');
    expect(html).toContain('Total TTC');
    expect(html).toContain('Reste à payer');
    expect(html).toContain('Tissu bazin riche');
    expect(html).toContain('@page');
  });

  it('affiche les règlements quand ils sont fournis', () => {
    const payments: Payment[] = [
      {
        id: 'pay-1',
        organizationId: 'org-1',
        invoiceId: 'inv-1',
        invoiceNumber: 'FACT-0001',
        clientName: 'Awa Ndiaye',
        amount: 40000,
        method: 'wave',
        paidAt: '2026-10-12',
        reference: null,
        notes: null,
      },
    ];
    const html = invoicePrintHtml({
      invoice: { ...invoice(), payments } as ReturnType<typeof invoice>,
      organization: org,
      client,
    });
    expect(html).toContain('Règlements');
    expect(html).toContain('Wave');
    expect(html.replace(/\u202f|\u00a0/g, ' ')).toContain('40 000');
  });

  it('échappe les saisies utilisateur pour éviter toute injection HTML', () => {
    const html = invoicePrintHtml({
      invoice: invoice({
        notes: '<script>alert(1)</script>',
        clientName: '<img src=x onerror=alert(1)>',
      }),
      organization: { ...org, name: 'Boutique <b>“Dakar”</b>' },
      client: { ...client, name: '<img src=x onerror=alert(1)>' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('fonctionne sans organisation chargée (mode dégradé)', () => {
    const html = invoicePrintHtml({
      invoice: invoice({ clientName: null }),
      organization: null,
      client: null,
    });
    expect(html).toContain('Sama Facture');
    expect(html).toContain('Client de passage');
  });

  it('escapeHtml traite les cinq caractères sensibles', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
    expect(escapeHtml(null)).toBe('');
  });
});
