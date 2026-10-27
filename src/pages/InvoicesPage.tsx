import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  CheckCircle2,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  Send,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { formatDateFR } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../lib/constants';
import { isConfirmedInvoice } from '../lib/finance';
import { invoicePrintHtml, printInvoice, whatsappShareUrl } from '../lib/share';
import {
  canDeleteInvoice,
  canManageInvoices,
  canRecordPayment,
} from '../lib/permissions';
import type { Client, Invoice, InvoiceStatus, Organization } from '../lib/types';
import type { InvoiceDraftInput, PaymentInput } from '../lib/data/types';
import { InvoiceFormModal } from '../components/InvoiceFormModal';
import { PaymentModal } from '../components/PaymentModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  Money,
  SectionHeading,
  Select,
  Skeleton,
} from '../components/ui';

const STATUS_TONES: Record<InvoiceStatus, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  sent: 'brand',
  partial: 'warning',
  paid: 'success',
  cancelled: 'danger',
};

const STATUS_FILTERS: Array<{ value: 'all' | InvoiceStatus; label: string }> = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'sent', label: 'Émises' },
  { value: 'partial', label: 'Partiellement payées' },
  { value: 'paid', label: 'Payées' },
  { value: 'cancelled', label: 'Annulées' },
];

function InvoiceDetail({
  invoice,
  payments,
  currency,
  organization,
  client,
  onClose,
  onPay,
  onEmit,
  onCancel,
  onPrintBlocked,

  canEdit,
  canPay,
  canCancel,
}: {
  invoice: Invoice;
  payments: ReturnType<typeof useApp>['data']['payments'];
  currency: string;
  organization: Organization | null;
  client: Client | null;
  onClose: () => void;
  onPay: () => void;
  onEmit: () => void;
  onCancel: () => void;
  canEdit: boolean;
  canPay: boolean;
  canCancel: boolean;
  onPrintBlocked: () => void;
}) {
  const invoicePayments = payments.filter((payment) => payment.invoiceId === invoice.id);
  return (
    <Modal
      open
      onClose={onClose}
      title={`${invoice.kind === 'credit_note' ? 'Avoir' : 'Facture'} ${invoice.number}`}
      description={`${invoice.clientName ?? 'Client de passage'} · émise le ${formatDateFR(invoice.issueDate)}${
        invoice.dueDate ? ` · échéance ${formatDateFR(invoice.dueDate)}` : ''
      }`}
      size="md"
      footer={
        <>
          {canCancel && (invoice.status === 'sent' || invoice.status === 'partial' || invoice.status === 'draft') && (
            <Button variant="secondary" onClick={onCancel} icon={<Ban className="size-4" />}>
              Annuler
            </Button>
          )}
          {invoice.status === 'draft' && canEdit && (
            <Button variant="secondary" onClick={onEmit} icon={<Send className="size-4" />}>
              Émettre
            </Button>
          )}
          {canPay &&
            invoice.kind === 'invoice' &&
            (invoice.status === 'sent' || invoice.status === 'partial') &&
            invoice.amountDue > 0 && (
              <Button onClick={onPay} icon={<Wallet className="size-4" />}>
                Encaisser
              </Button>
            )}
          <Button
            variant="secondary"
            onClick={() => {
              const html = invoicePrintHtml({ invoice, organization, client });
              if (!printInvoice(html)) onPrintBlocked();
            }}
            icon={<Printer className="size-4" />}
          >
            Imprimer / PDF
          </Button>
          <a
            className="inline-flex items-center gap-2 rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm font-medium text-ink-800 transition hover:bg-sand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            href={whatsappShareUrl({ invoice, organization, client })}
            target="_blank"
            rel="noopener noreferrer"
          >
            Partager sur WhatsApp
          </a>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
          {invoice.kind === 'credit_note' && <Badge tone="warning">Avoir</Badge>}
          {invoice.status === 'cancelled' && <span className="text-xs text-ink-500">Aucun impact sur le chiffre d’affaires.</span>}
        </div>

        <div className="overflow-hidden rounded-xl border border-sand-200">
          <table className="w-full text-sm">
            <caption className="sr-only">Lignes de la facture {invoice.number}</caption>
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th scope="col" className="px-3 py-2 font-medium">Désignation</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Qté</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">P.U.</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Total HT</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={item.id ?? index} className="border-b border-sand-100 last:border-0">
                  <td className="px-3 py-2">
                    <p className="text-sm text-ink-900">{item.description}</p>
                    <p className="text-[11px] text-ink-500">
                      {item.discountPercent > 0 && <>remise {item.discountPercent} % · </>}
                      {item.taxRate > 0 ? `TVA ${item.taxRate} %` : 'sans TVA'}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-right text-sm">{item.quantity}</td>
                  <td className="px-3 py-2 text-right text-sm">
                    {formatMoney(item.unitPrice, currency, { withSymbol: false })}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">
                    {formatMoney(item.lineSubtotalHt ?? item.quantity * item.unitPrice, currency, {
                      withSymbol: false,
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-ink-500">
            <dt>Sous-total HT</dt>
            <dd className="money">{formatMoney(invoice.subtotalHt, currency)}</dd>
          </div>
          <div className="flex justify-between text-ink-500">
            <dt>Remise</dt>
            <dd className="money">−{formatMoney(invoice.discountTotal, currency)}</dd>
          </div>
          <div className="flex justify-between text-ink-500">
            <dt>TVA</dt>
            <dd className="money">{formatMoney(invoice.taxTotal, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-sand-200 pt-1 font-semibold">
            <dt>Total TTC</dt>
            <dd className="money">{formatMoney(invoice.totalTtc, currency)}</dd>
          </div>
          <div className="flex justify-between text-ink-500">
            <dt>Encaissé</dt>
            <dd className="money">{formatMoney(invoice.amountPaid, currency)}</dd>
          </div>
          <div className="flex justify-between font-medium text-accent-600">
            <dt>Reste à recevoir</dt>
            <dd className="money">{formatMoney(invoice.amountDue, currency)}</dd>
          </div>
        </dl>

        <div>
          <h3 className="mb-1.5 text-sm font-semibold">Paiements</h3>
          {invoicePayments.length === 0 ? (
            <p className="text-sm text-ink-500">Aucun paiement enregistré.</p>
          ) : (
            <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200">
              {invoicePayments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    {formatDateFR(payment.paidAt)} · {PAYMENT_METHOD_LABELS[payment.method]}
                    {payment.reference && <span className="text-ink-500"> · {payment.reference}</span>}
                  </span>
                  <Money value={payment.amount} currency={currency} className="font-medium" />
                </li>
              ))}
            </ul>
          )}
        </div>

        {invoice.notes && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">Notes</h3>
            <p className="whitespace-pre-line rounded-xl bg-sand-50 p-3 text-sm text-ink-700">{invoice.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function InvoicesPage() {
  useDocumentTitle('Factures');
  const { data, dataLoading, dataError, activeOrg, currency, role, repo, refreshData, notify } = useApp();
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [detail, setDetail] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [cancelling, setCancelling] = useState<Invoice | null>(null);
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const canWriteInvoices = canManageInvoices(role);
  const canPay = canRecordPayment(role);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.invoices.filter((invoice) => {
      if (statusFilter !== 'all' && invoice.status !== statusFilter) return false;
      if (!needle) return true;
      return [invoice.number, invoice.clientName, ...invoice.items.map((item) => item.description)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [data.invoices, statusFilter, search]);

  const stats = useMemo(() => {
    const confirmed = data.invoices.filter(isConfirmedInvoice);
    const invoiced = confirmed.reduce(
      (acc, invoice) => acc + (invoice.kind === 'credit_note' ? -invoice.netHt : invoice.netHt),
      0,
    );
    const paid = confirmed.filter((invoice) => invoice.status === 'paid').length;
    const outstanding = confirmed
      .filter((invoice) => invoice.kind === 'invoice')
      .reduce((acc, invoice) => acc + invoice.amountDue, 0);
    const drafts = data.invoices.filter((invoice) => invoice.status === 'draft');
    return { invoiced, paid, outstanding, drafts: drafts.length, confirmed: confirmed.length };
  }, [data.invoices]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (invoice: Invoice) => {
    if (invoice.status !== 'draft') {
      notify('error', 'Une facture émise est immutable : créez un avoir pour la corriger.');
      return;
    }
    setEditing(invoice);
    setDetail(null);
    setFormOpen(true);
  };

  const submitInvoice = async (input: InvoiceDraftInput, emit: boolean) => {
    if (!activeOrg) throw new Error('Aucune organisation active.');
    const saved = await repo.saveInvoice(activeOrg.organization.id, input);
    if (emit) {
      await repo.setInvoiceStatus(activeOrg.organization.id, saved.id, 'sent');
      notify('success', `${saved.number} émise : elle entre dans le chiffre d’affaires.`);
    } else {
      notify('success', `${saved.number} enregistrée en brouillon.`);
    }
    await refreshData();
  };

  const emit = async (invoice: Invoice) => {
    if (!activeOrg) return;
    try {
      await repo.setInvoiceStatus(activeOrg.organization.id, invoice.id, 'sent');
      notify('success', `${invoice.number} émise.`);
      setDetail(null);
      await refreshData();
    } catch (error) {
      notify('error', messageFromError(error));
    }
  };

  const cancel = async () => {
    if (!cancelling || !activeOrg) return;
    setActionLoading(true);
    try {
      await repo.setInvoiceStatus(activeOrg.organization.id, cancelling.id, 'cancelled');
      notify('success', `${cancelling.number} annulée : elle ne compte plus dans le CA.`);
      setCancelling(null);
      setDetail(null);
      await refreshData();
    } catch (error) {
      notify('error', messageFromError(error));
    } finally {
      setActionLoading(false);
    }
  };

  const remove = async () => {
    if (!deleting || !activeOrg) return;
    setActionLoading(true);
    try {
      await repo.deleteInvoice(activeOrg.organization.id, deleting.id);
      notify('success', 'Brouillon supprimé.');
      setDeleting(null);
      setDetail(null);
      await refreshData();
    } catch (error) {
      notify('error', messageFromError(error));
    } finally {
      setActionLoading(false);
    }
  };

  const pay = async (input: PaymentInput) => {
    if (!activeOrg) throw new Error('Aucune organisation active.');
    await repo.recordPayment(activeOrg.organization.id, input);
    notify('success', 'Encaissement enregistré.');
    setDetail(null);
    await refreshData();
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Ventes"
        title="Factures"
        description="Brouillons, factures émises, paiements partiels et avoirs. Le chiffre d’affaires ne retient que les factures émises, partielles ou payées."
        action={
          <div className="flex gap-2">
            <Link to="/finances">
              <Button variant="secondary" size="sm">Voir les finances</Button>
            </Link>
            <Button onClick={openCreate} icon={<Plus className="size-4" />} disabled={!canWriteInvoices}>
              Nouvelle facture
            </Button>
          </div>
        }
      />

      {dataError && (
        <div role="alert" className="rounded-xl border border-danger-500/25 bg-danger-50 px-4 py-3 text-sm text-danger-600">
          {dataError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-ink-500">CA net HT confirmé</p>
          <Money value={stats.invoiced} currency={currency} className="mt-1 text-xl font-semibold" />
          <p className="mt-1 text-xs text-ink-500">{stats.confirmed} facture(s) confirmée(s) · avoirs déduits</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-ink-500">Reste à recevoir</p>
          <Money value={stats.outstanding} currency={currency} className="mt-1 text-xl font-semibold text-accent-600" />
          <p className="mt-1 text-xs text-ink-500">Toutes factures confirmées</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-ink-500">Factures payées</p>
          <p className="mt-1 text-xl font-semibold">{stats.paid}</p>
          <p className="mt-1 text-xs text-ink-500">Sur {stats.confirmed} factures confirmées</p>
        </Card>
        <Card className="p-4">
          <p className="text-[12px] uppercase tracking-wide text-ink-500">Brouillons</p>
          <p className="mt-1 text-xl font-semibold">{stats.drafts}</p>
          <p className="mt-1 text-xs text-ink-500">Exclus du chiffre d’affaires</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-col gap-2 border-b border-sand-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un numéro, un client, une ligne…"
              aria-label="Rechercher une facture"
              className="field pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | InvoiceStatus)}
            aria-label="Filtrer par statut"
            className="sm:w-52"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {dataLoading && data.invoices.length === 0 ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<FileText className="size-5" />}
            title={data.invoices.length === 0 ? 'Aucune facture' : 'Aucun résultat'}
            description={
              data.invoices.length === 0
                ? 'Créez une facture, enregistrez-la en brouillon puis émettez-la pour la faire entrer dans votre chiffre d’affaires.'
                : 'Modifiez le statut ou la recherche.'
            }
            action={
              canWriteInvoices && data.invoices.length === 0 ? (
                <Button size="sm" onClick={openCreate} icon={<Plus className="size-4" />}>
                  Nouvelle facture
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="thin-scroll hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">Liste des factures</caption>
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                    <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Numéro</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Client</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Total TTC</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Payé</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Reste</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Statut</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 sm:px-5">
                        <button
                          type="button"
                          className="money text-sm font-medium text-brand-700 hover:underline"
                          onClick={() => setDetail(invoice)}
                        >
                          {invoice.number}
                        </button>
                        {invoice.kind === 'credit_note' && (
                          <span className="ml-1.5 text-[10px] uppercase text-ink-500">avoir</span>
                        )}
                      </td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-sm text-ink-700">
                        {invoice.clientName ?? 'Client de passage'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500">
                        {formatDateFR(invoice.issueDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right">
                        <Money value={invoice.totalTtc} currency={currency} className="font-medium" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-ink-500">
                        <Money value={invoice.amountPaid} currency={currency} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs">
                        <Money
                          value={invoice.amountDue}
                          currency={currency}
                          className={invoice.amountDue > 0 && invoice.status !== 'cancelled' ? 'font-medium text-accent-600' : 'text-ink-300'}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right sm:px-5">
                        <div className="flex justify-end gap-0.5">
                          <button
                            type="button"
                            onClick={() => setDetail(invoice)}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-sand-200 hover:text-ink-900"
                            aria-label={`Voir la facture ${invoice.number}`}
                          >
                            <Eye className="size-4" />
                          </button>
                          {canWriteInvoices && invoice.status === 'draft' && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEdit(invoice)}
                                className="rounded-lg p-1.5 text-ink-500 hover:bg-sand-200 hover:text-ink-900"
                                aria-label={`Modifier la facture ${invoice.number}`}
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void emit(invoice)}
                                className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-50"
                                aria-label={`Émettre la facture ${invoice.number}`}
                              >
                                <Send className="size-4" />
                              </button>
                            </>
                          )}
                          {canPay &&
                            invoice.kind === 'invoice' &&
                            (invoice.status === 'sent' || invoice.status === 'partial') &&
                            invoice.amountDue > 0 && (
                              <button
                                type="button"
                                onClick={() => setPaying(invoice)}
                                className="rounded-lg p-1.5 text-brand-700 hover:bg-brand-50"
                                aria-label={`Encaisser la facture ${invoice.number}`}
                              >
                                <Wallet className="size-4" />
                              </button>
                            )}
                          {canWriteInvoices && !['paid', 'cancelled'].includes(invoice.status) && invoice.amountPaid === 0 && (
                            <button
                              type="button"
                              onClick={() => setCancelling(invoice)}
                              className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-500"
                              aria-label={`Annuler la facture ${invoice.number}`}
                            >
                              <Ban className="size-4" />
                            </button>
                          )}
                          {canWriteInvoices && canDeleteInvoice(role, invoice.status) && (
                            <button
                              type="button"
                              onClick={() => setDeleting(invoice)}
                              className="rounded-lg p-1.5 text-ink-500 hover:bg-danger-50 hover:text-danger-500"
                              aria-label={`Supprimer la facture ${invoice.number}`}
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
              {filtered.map((invoice) => (
                <li key={invoice.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setDetail(invoice)}
                      className="min-w-0 text-left"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="money text-sm font-medium text-brand-700">{invoice.number}</span>
                        <Badge tone={STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-700">
                        {invoice.clientName ?? 'Client de passage'}
                      </p>
                      <p className="text-[11px] text-ink-500">{formatDateFR(invoice.issueDate)}</p>
                    </button>
                    <div className="shrink-0 text-right">
                      <Money value={invoice.totalTtc} currency={currency} className="text-sm font-semibold" />
                      {invoice.amountDue > 0 && invoice.status !== 'cancelled' && (
                        <p className="text-[11px] text-accent-600">reste {formatMoney(invoice.amountDue, currency)}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap justify-end gap-1">
                    {canWriteInvoices && invoice.status === 'draft' && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(invoice)} icon={<Pencil className="size-3.5" />}>
                          Modifier
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => void emit(invoice)} icon={<Send className="size-3.5" />}>
                          Émettre
                        </Button>
                      </>
                    )}
                    {canPay &&
                      invoice.kind === 'invoice' &&
                      (invoice.status === 'sent' || invoice.status === 'partial') &&
                      invoice.amountDue > 0 && (
                        <Button size="sm" onClick={() => setPaying(invoice)} icon={<Wallet className="size-3.5" />}>
                          Encaisser
                        </Button>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="border-t border-sand-200 bg-sand-50 px-4 py-2.5 text-[11px] text-ink-500 sm:px-5">
          <CheckCircle2 className="mr-1 inline size-3.5 text-brand-600" />
          Les statuts « partiellement payée » et « payée » sont calculés à partir des paiements ; ils ne
          se saisissent pas manuellement.
        </p>
      </Card>

      <InvoiceFormModal
        open={formOpen}
        invoice={editing}
        clients={data.clients}
        products={data.products}
        currency={currency}
        onClose={() => setFormOpen(false)}
        onSubmit={submitInvoice}
      />

      {detail && (
        <InvoiceDetail
          invoice={data.invoices.find((invoice) => invoice.id === detail.id) ?? detail}
          payments={data.payments}
          currency={currency}
          organization={activeOrg?.organization ?? null}
          client={data.clients.find((item) => item.id === detail.clientId) ?? null}
          onClose={() => setDetail(null)}
          onPay={() => {
            setPaying(detail);
            setDetail(null);
          }}
          onEmit={() => void emit(detail)}
          onCancel={() => {
            setCancelling(detail);
            setDetail(null);
          }}
          canEdit={canWriteInvoices}
          canPay={canPay}
          canCancel={canWriteInvoices}
          onPrintBlocked={() =>
            notify(
              'error',
              'Impression bloquée par le navigateur : autorisez les fenêtres surgissantes.',
            )
          }
        />
      )}

      <PaymentModal
        open={paying !== null}
        invoice={paying}
        currency={currency}
        onClose={() => setPaying(null)}
        onSubmit={pay}
      />

      <ConfirmDialog
        open={cancelling !== null}
        title="Annuler cette facture ?"
        description={
          cancelling
            ? `${cancelling.number} sera marquée annulée et exclue du chiffre d’affaires. Une facture déjà encaissée ne peut pas être annulée : émettez un avoir.`
            : ''
        }
        confirmLabel="Annuler la facture"
        loading={actionLoading}
        onClose={() => setCancelling(null)}
        onConfirm={cancel}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="Supprimer ce brouillon ?"
        description={
          deleting
            ? `Le brouillon ${deleting.number} sera définitivement supprimé. Seuls les brouillons peuvent être supprimés.`
            : ''
        }
        confirmLabel="Supprimer le brouillon"
        loading={actionLoading}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
      />
    </div>
  );
}
