/**
 * Partage et impression d'une facture.
 *
 * Deux usages très répandus au Sénégal : envoyer la facture sur WhatsApp
 * (Wave / Orange Money pour le règlement) et l'imprimer en PDF depuis le
 * navigateur. Aucun appel réseau, aucune dépendance : ce sont des chaînes.
 */

import { PAYMENT_METHOD_LABELS } from './constants';
import { formatDateFR } from './dates';
import { formatMoney } from './money';
import type { Client, Invoice, Organization, Payment } from './types';

/** Sous-ensemble de paiement suffisant pour l'impression. */
export type InvoicePaymentLine = Pick<Payment, 'paidAt' | 'amount' | 'method'>;

/** Échappement HTML : les noms de clients viennent de la saisie utilisateur. */
export function escapeHtml(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Numéro au format international, sans espaces ni tirets.
 * Un numéro sénégalais local (77 123 45 67) devient 221771234567.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('221')) return digits;
  if (digits.length === 9 && /^7[0-8]/.test(digits)) return `221${digits}`;
  return digits.length >= 8 ? digits : null;
}

export interface InvoiceShareInput {
  invoice: Invoice;
  organization: Pick<Organization, 'name' | 'phone' | 'ninea' | 'address'> | null;
  client?: Pick<Client, 'phone'> | null;
}

/** Message court envoyé au client (tutoiement évité : registre professionnel). */
export function invoiceShareText({ invoice, organization }: InvoiceShareInput): string {
  const label = invoice.kind === 'credit_note' ? 'Avoir' : 'Facture';
  const lines = [
    organization ? `${label} ${invoice.number} — ${organization.name}` : `${label} ${invoice.number}`,
    `Émise le ${formatDateFR(invoice.issueDate)}`,
    `Montant total : ${formatMoney(invoice.totalTtc, invoice.currency)}`,
  ];
  if (invoice.amountDue > 0) {
    lines.push(`Reste à régler : ${formatMoney(invoice.amountDue, invoice.currency)}`);
  } else {
    lines.push('Facture réglée, merci.');
  }
  if (organization?.phone) lines.push(`Contact : ${organization.phone}`);
  if (organization?.ninea) lines.push(`NINEA : ${organization.ninea}`);
  lines.push('Paiement accepté par Wave, Orange Money ou espèces.');
  return lines.join('\n');
}

/**
 * Lien WhatsApp : vers le numéro du client s'il est connu, sinon vers le
 * sélecteur de contact de WhatsApp.
 */
export function whatsappShareUrl(input: InvoiceShareInput): string {
  const text = encodeURIComponent(invoiceShareText(input));
  const phone = toWhatsAppNumber(input.client?.phone);
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}

const KIND_LABEL = { invoice: 'FACTURE', credit_note: 'AVOIR' } as const;

const STATUS_LABEL: Record<Invoice['status'], string> = {
  draft: 'Brouillon — non valable',
  sent: 'Émise',
  partial: 'Partiellement réglée',
  paid: 'Réglée',
  cancelled: 'Annulée',
};

/**
 * Document HTML autonome, style sobre, pensé pour l'impression A4.
 * `window.print()` ou « Enregistrer au format PDF » depuis le navigateur
 * produisent alors un PDF propre, sans dépendance externe.
 */
export function invoicePrintHtml(
  input: InvoiceShareInput & { client?: Client | null },
): string {
  const { invoice, organization, client } = input;
  const org = organization ?? { name: 'Sama Facture', phone: null, ninea: null, address: null };
  const currency = invoice.currency;
  const itemRows = invoice.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.description)}</td>
          <td class="num">${item.quantity}</td>
          <td class="num">${formatMoney(item.unitPrice, currency)}</td>
          <td class="num">${item.discountPercent ? `${item.discountPercent} %` : '—'}</td>
          <td class="num">${formatMoney(item.quantity * item.unitPrice, currency)}</td>
        </tr>`,
    )
    .join('');

  const payments: InvoicePaymentLine[] =
    (invoice as Invoice & { payments?: InvoicePaymentLine[] }).payments ?? [];
  const paymentRows = payments
    .map(
      (payment: InvoicePaymentLine) => `
        <tr>
          <td>${formatDateFR(payment.paidAt)}</td>
          <td>${escapeHtml(PAYMENT_METHOD_LABELS[payment.method] ?? payment.method)}</td>
          <td class="num">${formatMoney(payment.amount, currency)}</td>
        </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(KIND_LABEL[invoice.kind])} ${escapeHtml(invoice.number)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #16211c; margin: 0; padding: 32px; font-size: 13px; }
  header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f5132; padding-bottom: 16px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: #0f5132; }
  .muted { color: #5b6660; }
  .meta { text-align: right; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #e8f1ec; color: #0f5132; font-size: 11px; }
  section { margin-top: 24px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #5b6660; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #e7e1d6; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #5b6660; background: #faf7f1; }
  .num { text-align: right; white-space: nowrap; }
  .totals { margin-left: auto; width: 280px; margin-top: 12px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #0f5132; margin-top: 6px; padding-top: 8px; font-weight: 600; font-size: 15px; }
  footer { margin-top: 32px; font-size: 11px; color: #5b6660; border-top: 1px solid #e7e1d6; padding-top: 10px; }
  @page { margin: 14mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(org.name)}</h1>
      ${org.address ? `<div class="muted">${escapeHtml(org.address)}</div>` : ''}
      ${org.phone ? `<div class="muted">Tél. ${escapeHtml(org.phone)}</div>` : ''}
      ${org.ninea ? `<div class="muted">NINEA : ${escapeHtml(org.ninea)}</div>` : ''}
    </div>
    <div class="meta">
      <div class="badge">${escapeHtml(STATUS_LABEL[invoice.status])}</div>
      <h1>${escapeHtml(KIND_LABEL[invoice.kind])} ${escapeHtml(invoice.number)}</h1>
      <div class="muted">Émise le ${formatDateFR(invoice.issueDate)}</div>
      ${invoice.dueDate ? `<div class="muted">Échéance : ${formatDateFR(invoice.dueDate)}</div>` : ''}
    </div>
  </header>

  <section>
    <h2>Client</h2>
    <div><strong>${escapeHtml(invoice.clientName ?? 'Client de passage')}</strong></div>
    ${client?.phone ? `<div class="muted">${escapeHtml(client.phone)}</div>` : ''}
    ${client?.address ? `<div class="muted">${escapeHtml(client.address)}</div>` : ''}
    ${client?.ninea ? `<div class="muted">NINEA : ${escapeHtml(client.ninea)}</div>` : ''}
  </section>

  <section>
    <h2>Détail</h2>
    <table>
      <thead>
        <tr><th>#</th><th>Désignation</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">Remise</th><th class="num">Montant</th></tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <div><span>Sous-total HT</span><span>${formatMoney(invoice.subtotalHt, currency)}</span></div>
      ${invoice.discountTotal > 0 ? `<div><span>Remise</span><span>−${formatMoney(invoice.discountTotal, currency)}</span></div>` : ''}
      <div><span>Net HT</span><span>${formatMoney(invoice.netHt, currency)}</span></div>
      <div><span>TVA</span><span>${formatMoney(invoice.taxTotal, currency)}</span></div>
      <div class="grand"><span>Total TTC</span><span>${formatMoney(invoice.totalTtc, currency)}</span></div>
      <div><span>Déjà réglé</span><span>${formatMoney(invoice.amountPaid, currency)}</span></div>
      <div><span>Reste à payer</span><span>${formatMoney(invoice.amountDue, currency)}</span></div>
    </div>
  </section>

  ${
    paymentRows
      ? `<section>
    <h2>Règlements</h2>
    <table>
      <thead><tr><th>Date</th><th>Mode</th><th class="num">Montant</th></tr></thead>
      <tbody>${paymentRows}</tbody>
    </table>
  </section>`
      : ''
  }

  ${invoice.notes ? `<section><h2>Notes</h2><p>${escapeHtml(invoice.notes)}</p></section>` : ''}

  <footer>
    Document généré par Sama Facture. Estimation de gestion — ne remplace pas une pièce comptable certifiée.
  </footer>
</body>
</html>`;
}

/** Ouvre le document dans un nouvel onglet et déclenche l'impression. */
export function printInvoice(html: string): boolean {
  if (typeof window === 'undefined') return false;
  const win = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1000');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  // Laisse au navigateur le temps de poser les styles avant la boîte d'impression.
  win.setTimeout(() => win.print(), 250);
  return true;
}
