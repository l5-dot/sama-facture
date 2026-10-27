import { useEffect, useState } from 'react';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_ORDER } from '../lib/constants';
import type { Expense, ExpenseCategory } from '../lib/types';
import {
  emptyExpenseForm,
  validateExpense,
  type ExpenseFormValues,
  type FieldErrors,
} from '../lib/validation';
import { Button, Field, Input, InlineAlert, Modal, Select, Textarea } from './ui';

function fromExpense(expense: Expense): ExpenseFormValues {
  return {
    expenseDate: expense.expenseDate,
    category: expense.category,
    description: expense.description,
    amount: String(expense.amount),
    reference: expense.reference ?? '',
    notes: expense.notes ?? '',
  };
}

export function ExpenseFormModal({
  open,
  expense,
  currency,
  onClose,
  onSubmit,
}: {
  open: boolean;
  expense: Expense | null;
  currency: string;
  onClose: () => void;
  onSubmit: (values: ExpenseFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    expense ? fromExpense(expense) : emptyExpenseForm(),
  );
  const [errors, setErrors] = useState<FieldErrors<keyof ExpenseFormValues | 'form'>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValues(expense ? fromExpense(expense) : emptyExpenseForm());
    setErrors({});
    setServerError(null);
    setSubmitting(false);
  }, [open, expense]);

  const set = <K extends keyof ExpenseFormValues>(key: K, value: ExpenseFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const submit = async () => {
    const result = validateExpense(values);
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
      title={expense ? 'Modifier la dépense' : 'Enregistrer une dépense'}
      description="Charge d’exploitation : transport, loyer, salaires, électricité, marketing, frais bancaires… Ne saisissez pas ici un achat de marchandises."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            {expense ? 'Enregistrer les modifications' : 'Enregistrer la dépense'}
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
          <Field label="Date de dépense" htmlFor="expense-date" required error={errors.expenseDate}>
            <Input
              id="expense-date"
              type="date"
              value={values.expenseDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => set('expenseDate', event.target.value)}
            />
          </Field>
          <Field label="Catégorie" htmlFor="expense-category" required error={errors.category}>
            <Select
              id="expense-category"
              value={values.category}
              onChange={(event) => set('category', event.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {EXPENSE_CATEGORIES[category].label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-[11px] leading-snug text-ink-500">
              {EXPENSE_CATEGORIES[values.category].description}
            </p>
          </Field>
        </div>

        <Field label="Description" htmlFor="expense-description" required error={errors.description}>
          <Input
            id="expense-description"
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="Ex. Loyer boutique — octobre"
            maxLength={500}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`Montant (${currency})`} htmlFor="expense-amount" required error={errors.amount}>
            <Input
              id="expense-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={values.amount}
              onChange={(event) => set('amount', event.target.value)}
              placeholder="0"
              className={errors.amount ? 'field-error' : undefined}
            />
          </Field>
          <Field label="Référence (facultatif)" htmlFor="expense-reference" error={errors.reference}>
            <Input
              id="expense-reference"
              value={values.reference}
              onChange={(event) => set('reference', event.target.value)}
              placeholder="Ex. LOY-1026"
              maxLength={80}
            />
          </Field>
        </div>

        <Field label="Notes (facultatif)" htmlFor="expense-notes" error={errors.notes}>
          <Textarea
            id="expense-notes"
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
            placeholder="Justificatif, mode de règlement…"
            maxLength={1000}
          />
        </Field>

        <p className="text-[11px] leading-relaxed text-ink-500">
          Une dépense est une charge d’exploitation. Pour de la marchandise destinée à la revente,
          utilisez « Mes achats » afin d’éviter un double comptage.
        </p>

        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
