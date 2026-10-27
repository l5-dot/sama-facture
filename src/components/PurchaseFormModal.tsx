import { useEffect, useMemo, useState } from 'react';
import {
  PURCHASE_CATEGORIES,
  PURCHASE_CATEGORY_ORDER,
  PURCHASE_PAYMENT_METHOD_ORDER,
  PAYMENT_METHOD_LABELS,
} from '../lib/constants';
import { formatMoney, parseAmount, round2 } from '../lib/money';
import type { Purchase, PurchaseCategory } from '../lib/types';
import {
  emptyPurchaseForm,
  toPurchasePayload,
  validatePurchase,
  type FieldErrors,
  type PurchaseFormValues,
} from '../lib/validation';
import { Button, Field, Input, InlineAlert, Modal, Select, Textarea } from './ui';

function fromPurchase(purchase: Purchase): PurchaseFormValues {
  return {
    supplierName: purchase.supplierName ?? '',
    supplierInvoiceNumber: purchase.supplierInvoiceNumber ?? '',
    purchaseDate: purchase.purchaseDate,
    description: purchase.description,
    category: purchase.category,
    quantity: String(purchase.quantity),
    unitPrice: String(purchase.unitPrice),
    amountPaid: String(purchase.amountPaid),
    paymentMethod: purchase.paymentMethod ?? '',
    notes: purchase.notes ?? '',
  };
}

export function PurchaseFormModal({
  open,
  purchase,
  currency,
  onClose,
  onSubmit,
}: {
  open: boolean;
  purchase: Purchase | null;
  currency: string;
  onClose: () => void;
  onSubmit: (values: PurchaseFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<PurchaseFormValues>(() =>
    purchase ? fromPurchase(purchase) : emptyPurchaseForm(),
  );
  const [errors, setErrors] = useState<FieldErrors<keyof PurchaseFormValues | 'form'>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(purchase ? fromPurchase(purchase) : emptyPurchaseForm());
    setErrors({});
    setServerError(null);
    setSubmitting(false);
  }, [open, purchase]);

  const set = <K extends keyof PurchaseFormValues>(key: K, value: PurchaseFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const totals = useMemo(() => {
    const quantity = parseAmount(values.quantity);
    const unitPrice = parseAmount(values.unitPrice);
    const total = round2(quantity * unitPrice);
    const paid = values.amountPaid.trim() === '' ? 0 : parseAmount(values.amountPaid);
    return { total, paid, due: round2(total - paid) };
  }, [values.quantity, values.unitPrice, values.amountPaid]);

  const categoryMeta = PURCHASE_CATEGORIES[values.category];

  const submit = async () => {
    const result = validatePurchase(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={purchase ? 'Modifier l’achat' : 'Enregistrer un achat'}
      description="Achat professionnel saisi manuellement. Il ne modifie pas le stock : aucun mouvement de stock n’est déduit automatiquement."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            {purchase ? 'Enregistrer les modifications' : 'Enregistrer l’achat'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {serverError && (
          <InlineAlert tone="danger" title="Enregistrement refusé">
            {serverError}
          </InlineAlert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Fournisseur (facultatif)" htmlFor="purchase-supplier" error={errors.supplierName}>
            <Input
              id="purchase-supplier"
              value={values.supplierName}
              onChange={(event) => set('supplierName', event.target.value)}
              placeholder="Ex. Marché Sandaga"
              maxLength={160}
            />
          </Field>
          <Field
            label="N° facture fournisseur / référence"
            htmlFor="purchase-reference"
            hint="Facultatif — utile pour rapprocher la pièce."
            error={errors.supplierInvoiceNumber}
          >
            <Input
              id="purchase-reference"
              value={values.supplierInvoiceNumber}
              onChange={(event) => set('supplierInvoiceNumber', event.target.value)}
              placeholder="Ex. FS-2026-118"
              maxLength={80}
            />
          </Field>

          <Field label="Date d’achat" htmlFor="purchase-date" required error={errors.purchaseDate}>
            <Input
              id="purchase-date"
              type="date"
              value={values.purchaseDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => set('purchaseDate', event.target.value)}
            />
          </Field>
          <Field label="Catégorie d’achat" htmlFor="purchase-category" required error={errors.category}>
            <Select
              id="purchase-category"
              value={values.category}
              onChange={(event) => set('category', event.target.value as PurchaseCategory)}
            >
              {PURCHASE_CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {PURCHASE_CATEGORIES[category].label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] leading-snug text-ink-500">{categoryMeta.description}</p>
          </Field>
        </div>

        <Field label="Description" htmlFor="purchase-description" required error={errors.description}>
          <Input
            id="purchase-description"
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="Ex. Lot de 20 t-shirts coton"
            maxLength={500}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Quantité" htmlFor="purchase-quantity" required error={errors.quantity}>
            <Input
              id="purchase-quantity"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.001"
              value={values.quantity}
              onChange={(event) => set('quantity', event.target.value)}
              className={errors.quantity ? 'field-error' : undefined}
            />
          </Field>
          <Field label={`Prix unitaire (${currency})`} htmlFor="purchase-unit-price" required error={errors.unitPrice}>
            <Input
              id="purchase-unit-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={values.unitPrice}
              onChange={(event) => set('unitPrice', event.target.value)}
              placeholder="0"
              className={errors.unitPrice ? 'field-error' : undefined}
            />
          </Field>
          <Field
            label="Montant total"
            hint="Calculé : quantité × prix unitaire."
            htmlFor="purchase-total"
          >
            <div
              id="purchase-total"
              aria-live="polite"
              className="flex h-[42px] items-center rounded-xl border border-sand-200 bg-sand-50 px-3 text-sm font-semibold text-ink-900 money"
            >
              {formatMoney(totals.total, currency)}
            </div>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label={`Montant payé (${currency})`}
            htmlFor="purchase-paid"
            error={errors.amountPaid}
            hint="Laissez vide si aucun règlement."
          >
            <Input
              id="purchase-paid"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={values.amountPaid}
              onChange={(event) => set('amountPaid', event.target.value)}
              placeholder="0"
              className={errors.amountPaid ? 'field-error' : undefined}
            />
          </Field>
          <Field label="Reste à payer" htmlFor="purchase-due">
            <div
              id="purchase-due"
              aria-live="polite"
              className={`flex h-[42px] items-center rounded-xl border px-3 text-sm font-semibold money ${
                totals.due > 0
                  ? 'border-accent-500/30 bg-accent-400/10 text-accent-600'
                  : 'border-sand-200 bg-sand-50 text-ink-700'
              }`}
            >
              {formatMoney(totals.due, currency)}
            </div>
          </Field>
          <Field label="Mode de paiement" htmlFor="purchase-method" error={errors.paymentMethod}>
            <Select
              id="purchase-method"
              value={values.paymentMethod}
              onChange={(event) =>
                set('paymentMethod', event.target.value as PurchaseFormValues['paymentMethod'])
              }
            >
              <option value="">Non précisé</option>
              {PURCHASE_PAYMENT_METHOD_ORDER.map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => set('amountPaid', String(totals.total))}
            disabled={totals.total <= 0}
          >
            Marquer comme payé
          </Button>
          <Button variant="ghost" size="sm" onClick={() => set('amountPaid', '')}>
            Effacer le montant payé
          </Button>
        </div>

        <Field label="Notes (facultatif)" htmlFor="purchase-notes" error={errors.notes}>
          <Textarea
            id="purchase-notes"
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
            placeholder="Conditions de règlement, bon de livraison…"
            maxLength={1000}
          />
        </Field>

        <p className="text-[11px] leading-relaxed text-ink-500">
          Le total et le reste à payer sont recalculés par la base de données à partir de la
          quantité et du prix unitaire. Le montant payé ne peut pas dépasser le total.
        </p>

        {/* Soumission clavier sans bouton visible supplémentaire */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/** Convertit le formulaire validé en payload d'écriture. */
export function purchasePayloadFromForm(values: PurchaseFormValues) {
  const parsed = validatePurchase(values);
  if (!parsed.ok) throw new Error('Formulaire invalide.');
  return toPurchasePayload(parsed.value);
}
