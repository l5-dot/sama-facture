/**
 * Module « Mes achats » : saisie manuelle des achats professionnels.
 *
 * Distinction essentielle : cet écran enregistre des pièces d'achat, pas des
 * mouvements de stock. Aucun stock vendu n'est déduit ici et aucun achat n'est
 * créé automatiquement à partir d'une facture de vente.
 */

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
  Info,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { defaultPeriod, type Period } from '../lib/period';
import { purchasesInPeriod, purchaseBreakdown, purchaseTotal, computePurchaseTotals } from '../lib/finance';
import { formatDateFR } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { PURCHASE_CATEGORIES, PURCHASE_CATEGORY_ORDER } from '../lib/constants';
import { canDeleteFinance, canWriteFinances, financeDeniedMessage } from '../lib/permissions';
import type { Purchase, PurchaseInput } from '../lib/types';
import type { PurchaseFormValues } from '../lib/validation';
import { purchasePayloadFromForm } from '../components/PurchaseFormModal';
import { PurchaseFormModal } from '../components/PurchaseFormModal';
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

type PaymentStatusFilter = 'all' | 'unpaid' | 'partial' | 'paid';

function paymentState(purchase: Purchase): { label: string; tone: 'success' | 'warning' | 'danger' } {
  const total = purchaseTotal(purchase.quantity, purchase.unitPrice);
  if (purchase.amountPaid >= total - 0.005) return { label: 'Payé', tone: 'success' };
  if (purchase.amountPaid > 0) return { label: 'Partiel', tone: 'warning' };
  return { label: 'Impayé', tone: 'danger' };
}

export default function PurchasesPage() {
  useDocumentTitle('Mes achats');
  const { data, dataLoading, dataError, activeOrg, currency, role, repo, refreshData, notify } = useApp();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [deleting, setDeleting] = useState<Purchase | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canWrite = canWriteFinances(role);
  const canDelete = canDeleteFinance(role);

  const periodPurchases = useMemo(
    () => purchasesInPeriod(data.purchases, period),
    [data.purchases, period],
  );

  const totals = useMemo(() => computePurchaseTotals(periodPurchases), [periodPurchases]);
  const breakdown = useMemo(() => purchaseBreakdown(data.purchases, period), [data.purchases, period]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return periodPurchases.filter((purchase) => {
      if (category !== 'all' && purchase.category !== category) return false;
      if (paymentFilter !== 'all') {
        const state = paymentState(purchase);
        if (paymentFilter === 'paid' && state.label !== 'Payé') return false;
        if (paymentFilter === 'partial' && state.label !== 'Partiel') return false;
        if (paymentFilter === 'unpaid' && state.label !== 'Impayé') return false;
      }
      if (!needle) return true;
      return [purchase.description, purchase.supplierName, purchase.supplierInvoiceNumber, purchase.notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [periodPurchases, search, category, paymentFilter]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (purchase: Purchase) => {
    if (!canWrite) {
      notify('error', financeDeniedMessage(role));
      return;
    }
    setEditing(purchase);
    setFormOpen(true);
  };

  const submit = async (values: PurchaseFormValues) => {
    if (!activeOrg) throw new Error('Aucune organisation active.');
    const payload: PurchaseInput = purchasePayloadFromForm(values);
    if (editing) {
      await repo.updatePurchase(activeOrg.organization.id, editing.id, payload);
      notify('success', 'Achat mis à jour.');
    } else {
      await repo.createPurchase(activeOrg.organization.id, payload);
      notify('success', 'Achat enregistré. Il est intégré à votre résultat estimé.');
    }
    await refreshData();
  };

  const confirmDelete = async () => {
    if (!deleting || !activeOrg) return;
    setDeleteLoading(true);
    try {
      await repo.deletePurchase(activeOrg.organization.id, deleting.id);
      notify('success', 'Achat supprimé.');
      setDeleting(null);
      await refreshData();
    } catch (error) {
      notify('error', messageFromError(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Finances"
        title="Mes achats"
        description="Achats professionnels : marchandises, matières premières, fournitures, services et équipements. Les achats de marchandises et de matières premières servent d’approximation du coût des marchandises vendues."
        action={
          <Button
            onClick={openCreate}
            icon={<Plus className="size-4" />}
            disabled={!canWrite}
            title={canWrite ? undefined : financeDeniedMessage(role)}
          >
            Nouvel achat
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

      <InlineAlert tone="info" title="Achats saisis ≠ mouvements de stock">
        Un achat enregistré ici est une pièce financière. Les quantités vendues ne sont pas
        déduites automatiquement du stock, et aucun achat n’est créé à partir d’une facture client.
      </InlineAlert>

      {dataLoading && data.purchases.length === 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Achats de la période"
            value={totals.total}
            currency={currency}
            icon={<ShoppingCart className="size-4" />}
            tone="info"
            hint={`${totals.count} achat(s) sur ${period.label}`}
          />
          <StatCard
            label="Montant payé"
            value={totals.paid}
            currency={currency}
            icon={<Wallet className="size-4" />}
            tone="brand"
            hint={`${totals.paidCount} entièrement réglé(s)`}
          />
          <StatCard
            label="Reste à payer"
            value={totals.due}
            currency={currency}
            icon={<TrendingDown className="size-4" />}
            tone={totals.due > 0 ? 'accent' : 'neutral'}
            hint={`${totals.unpaidCount} impayé(s) · ${totals.partialCount} partiel(s)`}
          />
          <StatCard
            label="Dont coût des marchandises"
            value={totals.cogsTotal}
            currency={currency}
            icon={<Package className="size-4" />}
            tone="neutral"
            hint="Marchandises + matières premières (COGS). Les équipements sont exclus du résultat."
          />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Achats enregistrés"
            subtitle={`${filtered.length} opération(s) affichée(s) sur ${periodPurchases.length}`}
            icon={<ShoppingCart className="size-4" />}
            action={
              <span className="text-xs text-ink-500">
                Payé <Money value={totals.paid} currency={currency} className="font-medium text-ink-900" /> /{' '}
                <Money value={totals.total} currency={currency} className="font-medium text-ink-900" />
              </span>
            }
          />

          <div className="flex flex-col gap-2 border-b border-sand-200 px-4 py-3 sm:flex-row sm:px-5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un fournisseur, une référence, une description…"
                aria-label="Rechercher un achat"
                className="field pl-9"
              />
            </div>
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              aria-label="Filtrer par catégorie"
              className="sm:w-48"
            >
              <option value="all">Toutes catégories</option>
              {PURCHASE_CATEGORY_ORDER.map((key) => (
                <option key={key} value={key}>
                  {PURCHASE_CATEGORIES[key].label}
                </option>
              ))}
            </Select>
            <Select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value as PaymentStatusFilter)}
              aria-label="Filtrer par statut de paiement"
              className="sm:w-40"
            >
              <option value="all">Tous statuts</option>
              <option value="unpaid">Impayés</option>
              <option value="partial">Partiels</option>
              <option value="paid">Payés</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="size-5" />}
              title={
                periodPurchases.length === 0
                  ? 'Aucun achat sur cette période'
                  : 'Aucun achat ne correspond aux filtres'
              }
              description={
                periodPurchases.length === 0
                  ? `Enregistrez vos achats de ${period.label} pour suivre vos coûts et votre reste à payer.`
                  : 'Modifiez la recherche ou les filtres.'
              }
              action={
                canWrite && periodPurchases.length === 0 ? (
                  <Button size="sm" onClick={openCreate} icon={<Plus className="size-4" />}>
                    Enregistrer un achat
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="thin-scroll hidden overflow-x-auto md:block">
                <table className="w-full min-w-[820px] text-sm">
                  <caption className="sr-only">Liste des achats de {period.label}</caption>
                  <thead>
                    <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                      <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Date</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Fournisseur / pièce</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Description</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">Catégorie</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Total</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Payé</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium">Reste</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((purchase) => {
                      const state = paymentState(purchase);
                      const total = purchaseTotal(purchase.quantity, purchase.unitPrice);
                      return (
                        <tr key={purchase.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                          <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500 sm:px-5">
                            {formatDateFR(purchase.purchaseDate)}
                          </td>
                          <td className="max-w-[180px] px-4 py-2.5">
                            <p className="truncate text-sm font-medium text-ink-900">
                              {purchase.supplierName ?? 'Non renseigné'}
                            </p>
                            <p className="money truncate text-[11px] text-ink-500">
                              {purchase.supplierInvoiceNumber ?? 'Sans référence'}
                            </p>
                          </td>
                          <td className="max-w-[240px] px-4 py-2.5">
                            <p className="truncate text-sm text-ink-700">{purchase.description}</p>
                            <p className="text-[11px] text-ink-500">
                              {purchase.quantity} × {formatMoney(purchase.unitPrice, currency, { withSymbol: false })}
                            </p>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex flex-col gap-1">
                              <Badge tone={PURCHASE_CATEGORIES[purchase.category].cogs ? 'brand' : 'neutral'}>
                                {PURCHASE_CATEGORIES[purchase.category].label}
                              </Badge>
                              {PURCHASE_CATEGORIES[purchase.category].capex && (
                                <span className="text-[10px] text-ink-500">hors résultat</span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <Money value={total} currency={currency} className="font-medium" />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-ink-500">
                            <Money value={purchase.amountPaid} currency={currency} />
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <Money
                                value={purchase.amountDue}
                                currency={currency}
                                className={clsx('font-medium', purchase.amountDue > 0 ? 'text-accent-600' : 'text-ink-500')}
                              />
                              <Badge tone={state.tone}>{state.label}</Badge>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right sm:px-5">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(purchase)}
                                disabled={!canWrite}
                                className="rounded-lg p-1.5 text-ink-500 transition hover:bg-sand-200 hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label={`Modifier l’achat ${purchase.description}`}
                              >
                                <Pencil className="size-4" />
                              </button>
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => setDeleting(purchase)}
                                  className="rounded-lg p-1.5 text-ink-500 transition hover:bg-danger-50 hover:text-danger-500"
                                  aria-label={`Supprimer l’achat ${purchase.description}`}
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-sand-100 md:hidden">
                {filtered.map((purchase) => {
                  const state = paymentState(purchase);
                  const total = purchaseTotal(purchase.quantity, purchase.unitPrice);
                  return (
                    <li key={purchase.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-900">{purchase.description}</p>
                          <p className="truncate text-xs text-ink-500">
                            {purchase.supplierName ?? 'Fournisseur non renseigné'}
                            {purchase.supplierInvoiceNumber ? ` · ${purchase.supplierInvoiceNumber}` : ''}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <Badge tone="neutral">{PURCHASE_CATEGORIES[purchase.category].label}</Badge>
                            <Badge tone={state.tone}>{state.label}</Badge>
                            <span className="text-[11px] text-ink-500">{formatDateFR(purchase.purchaseDate)}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <Money value={total} currency={currency} className="text-sm font-semibold" />
                          {purchase.amountDue > 0 && (
                            <p className="text-[11px] text-accent-600">
                              reste {formatMoney(purchase.amountDue, currency)}
                            </p>
                          )}
                          <div className="mt-1.5 flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(purchase)}
                              disabled={!canWrite}
                              className="rounded-lg p-1.5 text-ink-500 hover:bg-sand-100 disabled:opacity-40"
                              aria-label={`Modifier l’achat ${purchase.description}`}
                            >
                              <Pencil className="size-4" />
                            </button>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => setDeleting(purchase)}
                                className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-500"
                                aria-label={`Supprimer l’achat ${purchase.description}`}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader
            icon={<Package className="size-4" />}
            title="Répartition par nature"
            subtitle={period.label}
          />
          <div className="px-4 py-4">
            <DonutChart
              ariaLabel={`Répartition des achats par catégorie sur ${period.label}.`}
              currency={currency}
              centerLabel="Achats"
              data={breakdown}
            />
          </div>
          <div className="space-y-2 border-t border-sand-200 px-4 py-3 text-xs text-ink-500">
            <p className="flex items-start gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Les achats de <strong>marchandises</strong> et de <strong>matières premières</strong>{' '}
                alimentent la marge brute. Les <strong>équipements</strong> sont des investissements,
                exclus du résultat estimé.
              </span>
            </p>
            {breakdown.length === 0 && (
              <p className="flex items-center gap-1.5 text-ink-300">
                <CalendarDays className="size-3.5" /> Aucun achat sur la période.
              </p>
            )}
          </div>
        </Card>
      </div>

      <PurchaseFormModal
        open={formOpen}
        purchase={editing}
        currency={currency}
        onClose={() => setFormOpen(false)}
        onSubmit={submit}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Supprimer cet achat ?"
        description={
          deleting
            ? `L’achat « ${deleting.description} » du ${formatDateFR(deleting.purchaseDate)} sera définitivement supprimé. Cette action modifie votre résultat estimé et ne peut pas être annulée.`
            : ''
        }
        confirmLabel="Supprimer l’achat"
        loading={deleteLoading}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
