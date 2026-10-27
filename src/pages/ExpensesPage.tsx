/**
 * Module « Mes dépenses » : autres charges d'exploitation.
 *
 * Séparé de « Mes achats » pour éviter le double comptage : une marchandise
 * destinée à la revente se saisit dans les achats, une charge de
 * fonctionnement (loyer, salaires, transport…) ici.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Info,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  TrendingDown,
} from 'lucide-react';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { defaultPeriod, type Period } from '../lib/period';
import { computeExpenseTotals, expensesInPeriod, expenseBreakdown } from '../lib/finance';
import { formatDateFR } from '../lib/dates';
import { formatMoney, round2 } from '../lib/money';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_ORDER } from '../lib/constants';
import { canDeleteFinance, canWriteFinances, financeDeniedMessage } from '../lib/permissions';
import type { Expense, ExpenseInput } from '../lib/types';
import { validateExpense, type ExpenseFormValues } from '../lib/validation';
import { ExpenseFormModal } from '../components/ExpenseFormModal';
import { PeriodFilter } from '../components/PeriodFilter';
import { StatCard } from '../components/StatCard';
import { DonutChart } from '../components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  InlineAlert,
  Money,
  SectionHeading,
  Select,
  Skeleton,
} from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';

export default function ExpensesPage() {
  useDocumentTitle('Mes dépenses');
  const { data, dataLoading, dataError, activeOrg, currency, role, repo, refreshData, notify } = useApp();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canWrite = canWriteFinances(role);
  const canDelete = canDeleteFinance(role);

  const periodExpenses = useMemo(
    () => expensesInPeriod(data.expenses, period),
    [data.expenses, period],
  );
  const totals = useMemo(() => computeExpenseTotals(periodExpenses), [periodExpenses]);
  const breakdown = useMemo(() => expenseBreakdown(data.expenses, period), [data.expenses, period]);
  const topCategory = breakdown[0];

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return periodExpenses.filter((expense) => {
      if (category !== 'all' && expense.category !== category) return false;
      if (!needle) return true;
      return [expense.description, expense.reference, expense.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [periodExpenses, search, category]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (expense: Expense) => {
    if (!canWrite) {
      notify('error', financeDeniedMessage(role));
      return;
    }
    setEditing(expense);
    setFormOpen(true);
  };

  const submit = async (values: ExpenseFormValues) => {
    if (!activeOrg) throw new Error('Aucune organisation active.');
    const parsed = validateExpense(values);
    if (!parsed.ok) throw new Error('Formulaire invalide.');
    const payload: ExpenseInput = parsed.value;
    if (editing) {
      await repo.updateExpense(activeOrg.organization.id, editing.id, payload);
      notify('success', 'Dépense mise à jour.');
    } else {
      await repo.createExpense(activeOrg.organization.id, payload);
      notify('success', 'Dépense enregistrée.');
    }
    await refreshData();
  };

  const confirmDelete = async () => {
    if (!deleting || !activeOrg) return;
    setDeleteLoading(true);
    try {
      await repo.deleteExpense(activeOrg.organization.id, deleting.id);
      notify('success', 'Dépense supprimée.');
      setDeleting(null);
      await refreshData();
    } catch (error) {
      notify('error', messageFromError(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const average = totals.count > 0 ? round2(totals.total / totals.count) : 0;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Finances"
        title="Mes dépenses"
        description="Charges d’exploitation de l’entreprise : transport, loyer, salaires, électricité et Internet, marketing, frais bancaires et autres. Elles se déduisent du chiffre d’affaires dans le résultat estimé."
        action={
          <Button
            onClick={openCreate}
            icon={<Plus className="size-4" />}
            disabled={!canWrite}
            title={canWrite ? undefined : financeDeniedMessage(role)}
          >
            Nouvelle dépense
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter period={period} onChange={setPeriod} />
        <Link
          to="/finances"
          className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          ← Retour à la vue d’ensemble
        </Link>
      </div>

      {!canWrite && (
        <InlineAlert tone="warning" title="Lecture seule">
          {financeDeniedMessage(role)}
        </InlineAlert>
      )}

      {dataError && (
        <InlineAlert tone="danger" title="Erreur de chargement">
          {dataError}
        </InlineAlert>
      )}

      <InlineAlert tone="info" title="Achat ou dépense ?">
        Une <strong>marchandise</strong> ou une <strong>matière première</strong> destinée à la
        revente se saisit dans{' '}
        <Link to="/finances/achats" className="font-medium underline">
          Mes achats
        </Link>{' '}
        (coût des marchandises vendues). Une charge de fonctionnement se saisit ici. Chaque
        opération doit être saisie une seule fois.
      </InlineAlert>

      {dataLoading && data.expenses.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total des dépenses"
            value={totals.total}
            currency={currency}
            icon={<Receipt className="size-4" />}
            tone="accent"
            hint={`${totals.count} dépense(s) sur ${period.label}`}
          />
          <StatCard
            label="Poste principal"
            value={topCategory?.total ?? 0}
            currency={currency}
            icon={<TrendingDown className="size-4" />}
            tone="neutral"
            unavailableLabel="Aucune dépense"
            hint={topCategory ? topCategory.label : 'Aucune dépense enregistrée sur la période.'}
          />
          <StatCard
            label="Dépense moyenne"
            value={average}
            currency={currency}
            icon={<Info className="size-4" />}
            tone="neutral"
            hint="Total divisé par le nombre d’opérations de la période."
          />
          <StatCard
            label="Catégories utilisées"
            value={breakdown.length}
            currency={currency}
            icon={<AlertTriangle className="size-4" />}
            tone="brand"
            hint="Répartition visible dans le graphique ci-contre."
            unavailableLabel="0"
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Dépenses enregistrées"
            subtitle={`${filtered.length} opération(s) affichée(s) sur ${periodExpenses.length}`}
            icon={<Receipt className="size-4" />}
            action={
              <Money value={totals.total} currency={currency} className="text-sm font-semibold" />
            }
          />

          <div className="flex flex-col gap-2 border-b border-sand-200 px-4 py-3 sm:flex-row sm:px-5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher une description, une référence…"
                aria-label="Rechercher une dépense"
                className="field pl-9"
              />
            </div>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filtrer par catégorie de dépense"
              className="sm:w-56"
            >
              <option value="all">Toutes catégories</option>
              {EXPENSE_CATEGORY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {EXPENSE_CATEGORIES[key].label}
                </option>
              ))}
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Receipt className="size-5" />}
              title={
                periodExpenses.length === 0
                  ? 'Aucune dépense sur cette période'
                  : 'Aucune dépense ne correspond aux filtres'
              }
              description={
                periodExpenses.length === 0
                  ? `Enregistrez le loyer, les salaires ou le transport de ${period.label} pour un résultat estimé plus juste.`
                  : 'Modifiez la recherche ou le filtre de catégorie.'
              }
              action={
                canWrite && periodExpenses.length === 0 ? (
                  <Button size="sm" onClick={openCreate} icon={<Plus className="size-4" />}>
                    Enregistrer une dépense
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="thin-scroll hidden overflow-x-auto md:block">
                <table className="w-full min-w-[680px] text-sm">
                  <caption className="sr-only">Liste des dépenses de {period.label}</caption>
                  <thead>
                    <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Date</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Catégorie</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Référence</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Montant</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((expense) => (
                      <tr key={expense.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500 sm:px-5">
                          {formatDateFR(expense.expenseDate)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone="neutral">{EXPENSE_CATEGORIES[expense.category].label}</Badge>
                        </td>
                        <td className="max-w-[280px] px-4 py-2.5">
                          <p className="truncate text-sm text-ink-900">{expense.description}</p>
                          {expense.notes && (
                            <p className="truncate text-[11px] text-ink-500">{expense.notes}</p>
                          )}
                        </td>
                        <td className="max-w-[140px] truncate px-4 py-2.5 text-xs text-ink-500">
                          {expense.reference ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <Money value={expense.amount} currency={currency} className="font-medium" />
                        </td>
                        <td className="px-4 py-2.5 text-right sm:px-5">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(expense)}
                              disabled={!canWrite}
                              className="rounded-lg p-1.5 text-ink-500 transition hover:bg-sand-200 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                              aria-label={`Modifier la dépense ${expense.description}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleting(expense)}
                                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-danger-50 hover:text-danger-500"
                                aria-label={`Supprimer la dépense ${expense.description}`}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-sand-100 md:hidden">
                {filtered.map((expense) => (
                  <li key={expense.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-900">{expense.description}</p>
                      <p className="text-[11px] text-ink-500">
                        {formatDateFR(expense.expenseDate)} · {EXPENSE_CATEGORIES[expense.category].label}
                        {expense.reference ? ` · ${expense.reference}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money value={expense.amount} currency={currency} className="text-sm font-semibold" />
                      <div className="mt-1 flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(expense)}
                          disabled={!canWrite}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-sand-100 disabled:opacity-40"
                          aria-label={`Modifier la dépense ${expense.description}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeleting(expense)}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-500"
                            aria-label={`Supprimer la dépense ${expense.description}`}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            icon={<Receipt className="size-4" />}
            title="Répartition par catégorie"
            subtitle={period.label}
          />
          <div className="px-4 py-4">
            <DonutChart
              ariaLabel={`Répartition des dépenses par catégorie sur ${period.label}.`}
              currency={currency}
              centerLabel="Dépenses"
              data={breakdown}
            />
          </div>
          <p className="border-t border-sand-200 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
            Les dépenses sont déduites du résultat estimé de la période. Elles ne sont pas
            déduites du chiffre d’affaires facturé, qui reste un montant de ventes.
          </p>
        </Card>
      </div>

      <ExpenseFormModal
        open={formOpen}
        expense={editing}
        currency={currency}
        onClose={() => setFormOpen(false)}
        onSubmit={submit}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Supprimer cette dépense ?"
        description={
          deleting
            ? `La dépense « ${deleting.description} » de ${formatMoney(deleting.amount, currency)} sera définitivement supprimée. Le résultat estimé de la période sera recalculé.`
            : ''
        }
        confirmLabel="Supprimer la dépense"
        loading={deleteLoading}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
