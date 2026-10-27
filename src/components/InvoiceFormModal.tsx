import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { computeInvoiceTotals, defaultDueDate } from '../lib/invoices';
import { formatMoney, parseAmount } from '../lib/money';
import { todayISO } from '../lib/dates';
import type { Client, Invoice, InvoiceItem, InvoiceKind, Product } from '../lib/types';
import type { InvoiceDraftInput } from '../lib/data/types';
import { Button, Field, Input, InlineAlert, Modal, Select, Textarea } from './ui';

interface ItemRow {
  key: string;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
}

let rowCounter = 0;
function newRow(partial: Partial<ItemRow> = {}): ItemRow {
  rowCounter += 1;
  return {
    key: `row-${rowCounter}`,
    productId: '',
    description: '',
    quantity: '1',
    unitPrice: '0',
    discountPercent: '0',
    taxRate: '0',
    ...partial,
  };
}

function rowsFromInvoice(invoice: Invoice): ItemRow[] {
  return invoice.items.map((item) =>
    newRow({
      productId: item.productId ?? '',
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discountPercent: String(item.discountPercent),
      taxRate: String(item.taxRate),
    }),
  );
}

export function InvoiceFormModal({
  open,
  invoice,
  clients,
  products,
  currency,
  onClose,
  onSubmit,
}: {
  open: boolean;
  invoice: Invoice | null;
  clients: Client[];
  products: Product[];
  currency: string;
  onClose: () => void;
  onSubmit: (input: InvoiceDraftInput, emit: boolean) => Promise<void>;
}) {
  const [kind, setKind] = useState<InvoiceKind>('invoice');
  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(defaultDueDate(todayISO()));
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState('0');
  const [rows, setRows] = useState<ItemRow[]>([newRow()]);
  const [errors, setErrors] = useState<{ form?: string; item?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<'draft' | 'emit' | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setServerError(null);
    setSubmitting(null);
    if (invoice) {
      setKind(invoice.kind);
      setClientId(invoice.clientId ?? '');
      setIssueDate(invoice.issueDate);
      setDueDate(invoice.dueDate ?? defaultDueDate(invoice.issueDate));
      setNotes(invoice.notes ?? '');
      setDiscountType(invoice.discountType);
      setDiscountValue(String(invoice.discountValue));
      setRows(invoice.items.length > 0 ? rowsFromInvoice(invoice) : [newRow()]);
    } else {
      setKind('invoice');
      setClientId('');
      setIssueDate(todayISO());
      setDueDate(defaultDueDate(todayISO()));
      setNotes('');
      setDiscountType('none');
      setDiscountValue('0');
      setRows([newRow()]);
    }
  }, [open, invoice]);

  const items: InvoiceItem[] = useMemo(
    () =>
      rows.map((row) => ({
        productId: row.productId || null,
        description: row.description,
        quantity: parseAmount(row.quantity),
        unitPrice: parseAmount(row.unitPrice),
        discountPercent: parseAmount(row.discountPercent),
        taxRate: parseAmount(row.taxRate),
      })),
    [rows],
  );

  const totals = useMemo(
    () => computeInvoiceTotals(items, discountType, parseAmount(discountValue)),
    [items, discountType, discountValue],
  );

  const setRow = (key: string, patch: Partial<ItemRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setErrors((current) => ({ ...current, item: undefined }));
  };

  const pickProduct = (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) {
      setRow(key, { productId: '' });
      return;
    }
    setRow(key, {
      productId,
      description: product.name,
      unitPrice: String(product.unitPrice),
      taxRate: String(product.taxRate),
    });
  };

  const validate = (): string | null => {
    if (rows.length === 0) return 'Ajoutez au moins une ligne.';
    for (const row of rows) {
      if (!row.description.trim()) return 'Chaque ligne doit avoir une description.';
      if (!(parseAmount(row.quantity) > 0)) return 'Chaque quantité doit être supérieure à 0.';
      if (parseAmount(row.unitPrice) < 0) return 'Le prix unitaire ne peut pas être négatif.';
      const discount = parseAmount(row.discountPercent);
      if (discount < 0 || discount > 100) return 'La remise de ligne doit être comprise entre 0 et 100 %.';
      const tax = parseAmount(row.taxRate);
      if (tax < 0 || tax > 100) return 'La TVA doit être comprise entre 0 et 100 %.';
    }
    const globalDiscount = parseAmount(discountValue);
    if (discountType === 'percent' && (globalDiscount < 0 || globalDiscount > 100)) {
      return 'La remise globale doit être comprise entre 0 et 100 %.';
    }
    if (discountType === 'fixed' && globalDiscount < 0) {
      return 'La remise globale ne peut pas être négative.';
    }
    if (!issueDate) return 'La date de facture est obligatoire.';
    return null;
  };

  const submit = async (emit: boolean) => {
    const formError = validate();
    if (formError) {
      setErrors({ item: formError });
      return;
    }
    setSubmitting(emit ? 'emit' : 'draft');
    setServerError(null);
    try {
      await onSubmit(
        {
          id: invoice?.id,
          kind,
          clientId: clientId || null,
          issueDate,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
          discountType,
          discountValue: parseAmount(discountValue),
          items,
        },
        emit,
      );
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={invoice ? `Modifier ${invoice.number}` : kind === 'credit_note' ? 'Nouvel avoir' : 'Nouvelle facture'}
      description={
        invoice
          ? 'Seules les factures brouillon sont modifiables. Une facture émise se corrige par un avoir.'
          : 'Enregistrez un brouillon ou émettez directement la facture. Les totaux sont recalculés par le serveur.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting !== null}>
            Annuler
          </Button>
          <Button
            variant="secondary"
            onClick={() => void submit(false)}
            loading={submitting === 'draft'}
            disabled={submitting !== null}
          >
            Enregistrer le brouillon
          </Button>
          <Button onClick={() => void submit(true)} loading={submitting === 'emit'} disabled={submitting !== null}>
            Enregistrer et émettre
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(false);
        }}
      >
        {serverError && (
          <InlineAlert tone="danger" title="Enregistrement refusé">
            {serverError}
          </InlineAlert>
        )}
        {errors.item && (
          <InlineAlert tone="warning" title="Vérifiez la facture">
            {errors.item}
          </InlineAlert>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Type de document" htmlFor="invoice-kind">
            <Select
              id="invoice-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as InvoiceKind)}
              disabled={!!invoice}
            >
              <option value="invoice">Facture</option>
              <option value="credit_note">Avoir (credit note)</option>
            </Select>
          </Field>
          <Field label="Client" htmlFor="invoice-client" hint="Facultatif (client de passage).">
            <Select id="invoice-client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
              <option value="">Client de passage</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Devise">{currency}</Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date d’émission" htmlFor="invoice-issue" required>
            <Input
              id="invoice-issue"
              type="date"
              value={issueDate}
              onChange={(event) => {
                setIssueDate(event.target.value);
                if (!invoice) setDueDate(defaultDueDate(event.target.value));
              }}
            />
          </Field>
          <Field label="Échéance" htmlFor="invoice-due">
            <Input id="invoice-due" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
        </div>

        <div className="overflow-hidden rounded-xl border border-sand-200">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_80px_110px_80px_80px_36px] gap-2 border-b border-sand-200 bg-sand-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-ink-500 sm:grid">
            <span>Désignation</span>
            <span>Qté</span>
            <span>Prix unitaire</span>
            <span>Remise %</span>
            <span>TVA %</span>
            <span />
          </div>
          <div className="divide-y divide-sand-100">
            {rows.map((row) => {
              const lineTotal = parseAmount(row.quantity) * parseAmount(row.unitPrice) * (1 - parseAmount(row.discountPercent) / 100);
              return (
                <div key={row.key} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,2.2fr)_80px_110px_80px_80px_36px] sm:items-start">
                  <div className="space-y-1.5">
                    <Select
                      value={row.productId}
                      onChange={(event) => pickProduct(row.key, event.target.value)}
                      aria-label="Produit"
                      className="text-xs"
                    >
                      <option value="">Ligne libre</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={row.description}
                      onChange={(event) => setRow(row.key, { description: event.target.value })}
                      placeholder="Description"
                      aria-label="Description de la ligne"
                      maxLength={300}
                    />
                  </div>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={row.quantity}
                    aria-label="Quantité"
                    onChange={(event) => setRow(row.key, { quantity: event.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={row.unitPrice}
                    aria-label="Prix unitaire"
                    onChange={(event) => setRow(row.key, { unitPrice: event.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.discountPercent}
                    aria-label="Remise en pourcentage"
                    onChange={(event) => setRow(row.key, { discountPercent: event.target.value })}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={row.taxRate}
                    aria-label="Taux de TVA"
                    onChange={(event) => setRow(row.key, { taxRate: event.target.value })}
                  />
                  <div className="flex items-center justify-between gap-1 sm:flex-col">
                    <span className="money text-xs text-ink-500 sm:hidden">
                      {formatMoney(lineTotal, currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRows((current) => (current.length > 1 ? current.filter((r) => r.key !== row.key) : current))}
                      disabled={rows.length === 1}
                      className="rounded-lg p-1.5 text-ink-500 transition hover:bg-danger-50 hover:text-danger-500 disabled:opacity-30"
                      aria-label="Supprimer la ligne"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-sand-200 bg-sand-50 px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows((current) => [...current, newRow()])}
              icon={<Plus className="size-3.5" />}
            >
              Ajouter une ligne
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.2fr]">
          <Field label="Remise globale" htmlFor="invoice-discount-type">
            <Select
              id="invoice-discount-type"
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value as typeof discountType)}
            >
              <option value="none">Aucune</option>
              <option value="percent">Pourcentage</option>
              <option value="fixed">{`Montant (${currency})`}</option>
            </Select>
          </Field>
          <Field label={discountType === 'percent' ? 'Remise (%)' : `Remise (${currency})`} htmlFor="invoice-discount-value">
            <Input
              id="invoice-discount-value"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={discountValue}
              onChange={(event) => setDiscountValue(event.target.value)}
              disabled={discountType === 'none'}
            />
          </Field>
          <div className="rounded-xl border border-sand-200 bg-sand-50 p-3 text-sm">
            <div className="flex justify-between text-xs text-ink-500">
              <span>Sous-total HT</span>
              <span className="money">{formatMoney(totals.subtotalHt, currency)}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-ink-500">
              <span>Remise</span>
              <span className="money">−{formatMoney(totals.discountTotal, currency)}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-ink-500">
              <span>TVA</span>
              <span className="money">{formatMoney(totals.taxTotal, currency)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-sand-200 pt-2 text-sm font-semibold">
              <span>Total TTC</span>
              <span className="money">{formatMoney(totals.totalTtc, currency)}</span>
            </div>
          </div>
        </div>

        <Field label="Notes (facultatif)" htmlFor="invoice-notes">
          <Textarea
            id="invoice-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Conditions de paiement, mention NINEA…"
            maxLength={1000}
          />
        </Field>

        <p className="text-[11px] leading-relaxed text-ink-500">
          La numérotation (FACT-0001, AV-0001), la remise et la TVA sont recalculées par la base.
          Un brouillon n’apparaît jamais dans le chiffre d’affaires ; une facture émise devient
          immutable.
        </p>

        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
