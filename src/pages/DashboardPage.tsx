import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Clock,
  FileText,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { computeFinanceSummary, invoicesInPeriod } from '../lib/finance';
import { defaultPeriod } from '../lib/period';
import { formatDateFR, todayISO } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { INVOICE_STATUS_LABELS } from '../lib/constants';
import { canManageInvoices, canWriteFinances } from '../lib/permissions';
import { StatCard } from '../components/StatCard';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Money,
  SectionHeading,
} from '../components/ui';

const STATUS_TONES: Record<string, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  draft: 'neutral',
  sent: 'brand',
  partial: 'warning',
  paid: 'success',
  cancelled: 'danger',
};

export default function DashboardPage() {
  useDocumentTitle('Tableau de bord');
  const { data, activeOrg, currency, role, user } = useApp();

  const period = useMemo(() => defaultPeriod(todayISO()), []);
  const summary = useMemo(() => computeFinanceSummary(data, period), [data, period]);
  const monthInvoices = useMemo(() => invoicesInPeriod(data.invoices, period), [data.invoices, period]);
  const recentInvoices = useMemo(
    () => [...data.invoices].sort((a, b) => (a.issueDate < b.issueDate ? 1 : -1)).slice(0, 6),
    [data.invoices],
  );

  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Tableau de bord"
        title={`Bonjour ${user?.fullName?.split(' ')[0] ?? ''}`.trim()}
        description={`${activeOrg?.organization.name ?? 'Votre organisation'} · ${todayLabel}`}
        action={
          <div className="flex flex-wrap gap-2">
            {canManageInvoices(role) && (
              <Link to="/factures">
                <Button icon={<FileText className="size-4" />}>Nouvelle facture</Button>
              </Link>
            )}
            {canWriteFinances(role) && (
              <Link to="/finances/achats">
                <Button variant="secondary" icon={<ShoppingCart className="size-4" />}>
                  Achat
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`CA de ${period.label}`}
          value={summary.revenue.netHt}
          currency={currency}
          icon={<TrendingUp className="size-4" />}
          tone="brand"
          hint={`${summary.revenue.invoiceCount} facture(s) confirmée(s) · HT`}
        />
        <StatCard
          label="Encaissé ce mois"
          value={summary.cashIn}
          currency={currency}
          icon={<Wallet className="size-4" />}
          tone="brand"
          hint={`Trésorerie reçue · reste dû ${formatMoney(summary.revenue.outstanding, currency)}`}
        />
        <StatCard
          label="Achats + dépenses"
          value={summary.purchasesTotal + summary.expensesTotal}
          currency={currency}
          icon={<ShoppingCart className="size-4" />}
          tone="neutral"
          hint={`Achats ${formatMoney(summary.purchasesTotal, currency)} · dépenses ${formatMoney(
            summary.expensesTotal,
            currency,
          )}`}
        />
        <StatCard
          label="Résultat estimé"
          value={summary.estimatedResult}
          currency={currency}
          icon={<Wallet className="size-4" />}
          tone={summary.estimatedResult < 0 ? 'danger' : 'brand'}
          signed
          badge={
            summary.confidence === 'complete' ? (
              <Badge tone="success">Données complètes</Badge>
            ) : summary.confidence === 'partial' ? (
              <Badge tone="warning">Estimation partielle</Badge>
            ) : (
              <Badge tone="neutral">Données insuffisantes</Badge>
            )
          }
          hint="CA net − coûts de la période. Estimation de gestion, non certifiée."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<FileText className="size-4" />}
            title="Dernières factures"
            subtitle={`${monthInvoices.length} facture(s) émises ou préparées ce mois-ci`}
            action={
              <Link
                to="/factures"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
              >
                Tout voir <ArrowRight className="size-3.5" />
              </Link>
            }
          />
          {recentInvoices.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-5" />}
              title="Aucune facture pour le moment"
              description="Créez votre première facture : elle alimentera automatiquement votre chiffre d’affaires."
              action={
                canManageInvoices(role) ? (
                  <Link to="/factures">
                    <Button size="sm">Créer une facture</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-sand-100">
              {recentInvoices.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="money text-sm font-medium">{invoice.number}</span>
                      <Badge tone={STATUS_TONES[invoice.status]}>{INVOICE_STATUS_LABELS[invoice.status]}</Badge>
                      {invoice.kind === 'credit_note' && <Badge tone="warning">Avoir</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {invoice.clientName ?? 'Client de passage'} · {formatDateFR(invoice.issueDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money value={invoice.totalTtc} currency={currency} className="text-sm font-semibold" />
                    {invoice.amountDue > 0 && invoice.status !== 'cancelled' && invoice.status !== 'draft' && (
                      <p className="text-[11px] text-accent-600">
                        reste {formatMoney(invoice.amountDue, currency)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col bg-gradient-to-br from-brand-700 to-brand-900 text-white">
          <div className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-100/70">
              Nouveau module
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold">Pilotez vos finances</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-brand-50/80">
              Chiffre d’affaires, encaissements, achats, dépenses, marge brute et résultat estimé —
              sur le mois, le trimestre, l’année ou une période personnalisée.
            </p>
            <div className="mt-4 space-y-2 rounded-xl bg-white/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-brand-50/80">CA net HT</span>
                <Money value={summary.revenue.netHt} currency={currency} className="font-medium" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-50/80">Encaissé</span>
                <Money value={summary.cashIn} currency={currency} className="font-medium" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-brand-50/80">Résultat estimé</span>
                <Money
                  value={summary.estimatedResult}
                  currency={currency}
                  className="font-semibold text-accent-400"
                  signed
                />
              </div>
            </div>
            <Link to="/finances" className="mt-4 block">
              <Button variant="accent" className="w-full" icon={<ArrowUpRight className="size-4" />}>
                Ouvrir Finances
              </Button>
            </Link>
          </div>
          <div className="mt-auto border-t border-white/10 px-5 py-3 text-[11px] text-brand-100/60">
            Les brouillons et factures annulées ne sont jamais comptés comme des ventes.
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader icon={<Clock className="size-4" />} title="À encaisser" subtitle="Factures confirmées de la période" />
          <div className="p-4">
            <Money value={summary.revenue.outstanding} currency={currency} className="text-2xl font-semibold" />
            <p className="mt-1 text-xs text-ink-500">
              {summary.revenue.partialCount} facture(s) partiellement payée(s) ·{' '}
              {summary.revenue.invoiceCount} facture(s) confirmée(s)
            </p>
            <Link
              to="/factures"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              Voir les factures <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
        <Card>
          <CardHeader icon={<ShoppingCart className="size-4" />} title="Achats du mois" subtitle="Y compris achats à crédit" />
          <div className="p-4">
            <Money value={summary.purchasesTotal} currency={currency} className="text-2xl font-semibold" />
            <p className="mt-1 text-xs text-ink-500">
              Reste à payer {formatMoney(summary.purchasesDue, currency)} ·{' '}
              {summary.purchasesCount} achat(s)
            </p>
            <Link
              to="/finances/achats"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              Gérer mes achats <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
        <Card>
          <CardHeader icon={<Receipt className="size-4" />} title="Dépenses du mois" subtitle="Charges d’exploitation" />
          <div className="p-4">
            <Money value={summary.expensesTotal} currency={currency} className="text-2xl font-semibold" />
            <p className="mt-1 text-xs text-ink-500">
              {summary.expensesCount} dépense(s) enregistrée(s) · trésorerie nette{' '}
              {formatMoney(summary.netCash, currency)}
            </p>
            <Link
              to="/finances/depenses"
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              Gérer mes dépenses <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
