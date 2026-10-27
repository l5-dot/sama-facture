import { useEffect, useState } from 'react';
import { PAYMENT_METHOD_LABELS, PURCHASE_PAYMENT_METHOD_ORDER } from '../lib/constants';
import { todayISO } from '../lib/dates';
import { formatMoney, parseAmount, round2 } from '../lib/money';
import type { Invoice, PaymentMethod } from '../lib/types';
import type { PaymentInput } from '../lib/data/types';
import { validatePaymentAmount } from '../lib/validation';
import { Button, Field, InlineAlert, Input, Modal, Select, Textarea } from './ui';

export function PaymentModal({
  open,
  invoice,
  currency,
  onClose,
  onSubmit,
}: {
  open: boolean;
  invoice: Invoice | null;
  currency: string;
  onClose: () => void;
  onSubmit: (input: PaymentInput) => Promise<void>;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('especes');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    const due = round2(invoice.totalTtc - invoice.amountPaid);
    setAmount(due > 0 ? String(due) : '');
    setMethod('especes');
    setPaidAt(todayISO());
    setReference('');
    setNotes('');
    setError(null);
    setServerError(null);
    setSubmitting(false);
  }, [open, invoice]);

  if (!invoice) return null;
  const due = round2(invoice.totalTtc - invoice.amountPaid);

  const submit = async () => {
    const validation = validatePaymentAmount(parseAmount(amount), due);
    if (validation) {
      setError(validation);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      await onSubmit({
        invoiceId: invoice.id,
        amount: round2(parseAmount(amount)),
        method,
        paidAt,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Enregistrement impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Encaisser ${invoice.number}`}
      description={`${invoice.clientName ?? 'Client de passage'} · reste à payer ${formatMoney(due, currency)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            Enregistrer l’encaissement
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
          <InlineAlert tone="danger" title="Encaissement refusé">
            {serverError}
          </InlineAlert>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Montant reçu (${currency})`} htmlFor="payment-amount" required error={error ?? undefined}>
            <Input
              id="payment-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setError(null);
              }}
              className={error ? 'field-error' : undefined}
            />
          </Field>
          <Field label="Date" htmlFor="payment-date" required>
            <Input
              id="payment-date"
              type="date"
              max={todayISO()}
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
            />
          </Field>
          <Field label="Moyen de paiement" htmlFor="payment-method" required>
            <Select
              id="payment-method"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            >
              {PURCHASE_PAYMENT_METHOD_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_METHOD_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Référence (facultatif)" htmlFor="payment-reference">
            <Input
              id="payment-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Ex. WAVE-8842"
              maxLength={80}
            />
          </Field>
        </div>

        <Field label="Notes (facultatif)" htmlFor="payment-notes">
          <Textarea
            id="payment-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={1000}
          />
        </Field>

        <p className="text-[11px] leading-relaxed text-ink-500">
          Le statut de la facture (partielle ou payée) est recalculé automatiquement à partir de la
          somme des paiements. Un paiement ne peut pas dépasser le reste à payer.
        </p>

        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
