/**
 * Page « Finances » : chiffre d'affaires, encaissements, achats, dépenses,
 * marge brute, trésorerie nette et résultat estimé, sur une période choisie.
 *
 * Les montants affichés proviennent du moteur `computeFinanceSummary` (calculs
 * détaillés et graphiques) et sont recoupés avec les agrégats de la base
 * (`finance_summary`) quand elle est disponible.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  Clock,
  Download,
  Info,
  PiggyBank,
  Receipt,
  Search,
  ShoppingCart,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import clsx from 'clsx';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { defaultPeriod, type Period } from '../lib/period';
import {
  buildMonthlySeries,
  computeFinanceSummary,
  expenseBreakdown,
  purchaseBreakdown,
  reconcileWithServer,
} from '../lib/finance';
import { formatDateFR, formatDateShort } from '../lib/dates';
import { formatMoney, formatPercent } from '../lib/money';
import type { FinanceJournalRow } from '../lib/types';
import type { ServerFinanceSummary } from '../lib/data/types';
import { StatCard, ProgressBar } from '../components/StatCard';
import { PeriodFilter } from '../components/PeriodFilter';
import { DonutChart, GroupedBarChart, ResultBarChart, CHART_COLORS } from '../components/charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  InlineAlert,
  Money,
  SectionHeading,
  Select,
  Skeleton,
} from '../components/ui';
import { downloadCsv, journalToCsv } from '../lib/export';

const SOURCE_META: Record<
  FinanceJournalRow['source'],
  { label: string; tone: 'brand' | 'success' | 'warning' | 'info' | 'neutral' | 'danger' }
> = {
  facture: { label: 'Facture', tone: 'brand' },
  avoir: { label: 'Avoir', tone: 'warning' },
  paiement: { label: 'Encaissement', tone: 'success' },
  achat: { label: 'Achat', tone: 'info' },
  depense: { label: 'Dépense', tone: 'neutral' },
};

const FILTERS = [
  { value: 'all', label: 'Toutes les opérations' },
  { value: 'facture', label: 'Factures' },
  { value: 'avoir', label: 'Avoirs' },
  { value: 'paiement', label: 'Encaissements' },
  { value: 'achat', label: 'Achats' },
  { value: 'depense', label: 'Dépenses' },
];

function ConfidenceBadge({
  confidence,
}: {
  confidence: 'complete' | 'partial' | 'insufficient';
}) {
  if (confidence === 'complete') {
    return <Badge tone="success"><CheckCircle2 className="size-3" /> Estimation complète</Badge>;
  }
  if (confidence === 'partial') {
    return <Badge tone="warning"><AlertTriangle className="size-3" /> Estimation partielle</Badge>;
  }
  return <Badge tone="neutral"><Info className="size-3" /> Données insuffisantes</Badge>;
}

function JournalAmount({ value, kind }: { value: number; kind: 'result' | 'cash' }) {
  if (value === 0) return <span className="text-ink-300">—</span>;
  return (
    <span
      className={clsx(
        'money font-medium',
        kind === 'result'
          ? value < 0
            ? 'text-danger-600'
            : 'text-ink-900'
          : value > 0
            ? 'text-success-600'
            : 'text-danger-600',
      )}
    >
      {formatMoney(value, 'XOF', { signed: true })}
    </span>
  );
}

function RevenueControlCard({
  summary,
  currency,
}: {
  summary: ReturnType<typeof computeFinanceSummary>;
  currency: string;
}) {
  const revenue = summary.revenue;
  const rows = [
    {
      label: 'Factures émises',
      detail: `${revenue.invoiceCount} facture(s) confirmée(s)`,
      amount: revenue.issuedTtc,
      included: true,
    },
    {
      label: 'Avoirs émis',
      detail: `${revenue.creditNoteCount} avoir(s) — déduits du CA`,
      amount: -revenue.creditedTtc,
      included: true,
    },
    {
      label: 'Factures payées',
      detail: `${revenue.paidCount} facture(s) intégralement réglée(s)`,
      amount: null,
      included: true,
    },
    {
      label: 'Factures partiellement payées',
      detail: `${revenue.partialCount} facture(s) · reste dû ${formatMoney(revenue.outstanding, currency)}`,
      amount: null,
      included: true,
    },
    {
      label: 'Brouillons exclus',
      detail: `${revenue.draftCount} facture(s) · jamais comptées comme vente`,
      amount: revenue.draftTtc,
      included: false,
    },
    {
      label: 'Factures annulées exclues',
      detail: `${revenue.cancelledCount} facture(s) · sans effet sur le CA`,
      amount: revenue.cancelledTtc,
      included: false,
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={<CheckCircle2 className="size-4" />}
        title="Contrôle du chiffre d’affaires"
        subtitle="Ce qui entre dans le CA, ce qui en est exclu — TTC, avoirs déduits."
        action={<Badge tone="brand">CA net HT {formatMoney(revenue.netHt, currency)}</Badge>}
      />
      <div className="grid gap-x-6 gap-y-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3 border-b border-sand-100 pb-2.5 last:border-0">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-900">
                {row.label}
                {!row.included && <Badge tone="neutral">exclu</Badge>}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">{row.detail}</p>
            </div>
            {row.amount !== null && (
              <span
                className={clsx(
                  'money shrink-0 text-sm font-medium',
                  row.included ? 'text-ink-900' : 'text-ink-300 line-through',
                )}
              >
                {formatMoney(row.amount, currency)}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="grid gap-2 border-t border-sand-200 bg-sand-50 px-4 py-3 text-xs text-ink-500 sm:grid-cols-3 sm:px-5">
        <div>
          <p className="text-[11px] uppercase tracking-wide">Encaissé sur ces factures</p>
          <Money value={revenue.paidOnIssued} currency={currency} className="text-sm text-ink-900" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide">Reste à recevoir</p>
          <Money value={revenue.outstanding} currency={currency} className="text-sm text-accent-600" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide">TVA collectée nette</p>
          <Money value={revenue.tax} currency={currency} className="text-sm text-ink-900" />
        </div>
      </div>
    </Card>
  );
}

function FormulaDetails({ currency }: { currency: string }) {
  const formulas: Array<[string, string]> = [
    [
      'Chiffre d’affaires net HT',
      'Σ net_ht des factures émises, partielles ou payées − Σ net_ht des avoirs confirmés. Brouillons et annulées exclus. Les remises (ligne et globale) et la TVA sont déjà traitées dans net_ht : aucune addition manuelle.',
    ],
    [
      'Montant encaissé (trésorerie)',
      'Σ des paiements dont la date de paiement tombe dans la période, même si la facture est antérieure. Distinct de « encaissé sur ces factures » (Σ amount_paid des factures émises sur la période).',
    ],
    [
      'Reste à recevoir',
      'Σ max(total_ttc − montant payé, 0) des factures confirmées émises sur la période. Un avoir ne crée pas de créance et est exclu.',
    ],
    [
      'Total des achats',
      'Σ (quantité × prix unitaire) des achats professionnels saisis. Un achat n’est pas un mouvement de stock : aucun stock vendu n’est déduit automatiquement.',
    ],
    [
      'Trésorerie nette',
      'Encaissements de la période − (montant payé des achats + dépenses). Ce n’est pas un bénéfice : un achat à crédit n’y figure pas.',
    ],
    [
      'Marge brute',
      'CA net HT − achats de marchandises et de matières premières (approximation du coût des marchandises vendues). Affichée seulement si au moins un achat de ce type existe sur la période.',
    ],
    [
      'Résultat estimé',
      'CA net HT − COGS − achats d’exploitation (fournitures, services, autre) − dépenses. Les équipements (investissements) sont exclus. Estimation de gestion, jamais un résultat comptable certifié.',
    ],
  ];

  return (
    <details className="group card overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-medium text-ink-900 sm:px-5">
        <span className="flex items-center gap-2">
          <Info className="size-4 text-brand-600" />
          Formules et conventions de calcul
        </span>
        <span className="text-xs text-ink-500 group-open:hidden">Afficher</span>
        <span className="hidden text-xs text-ink-500 group-open:inline">Masquer</span>
      </summary>
      <div className="border-t border-sand-200 px-4 py-4 sm:px-5">
        <dl className="space-y-3">
          {formulas.map(([title, description]) => (
            <div key={title} className="grid gap-1 sm:grid-cols-[190px_1fr] sm:gap-4">
              <dt className="text-sm font-medium text-ink-900">{title}</dt>
              <dd className="text-sm leading-relaxed text-ink-500">{description}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 rounded-lg bg-sand-50 px-3 py-2 text-xs leading-relaxed text-ink-500">
          Arrondis : chaque ligne est arrondie au franc ({currency === 'XOF' ? 'le FCFA n’a pas de subdivision' : '2 décimales'}) et
          les totaux sont arrondis après sommation. Les montants de référence sont recalculés par
          PostgreSQL ; le navigateur n’enregistre jamais un total qu’il a lui-même calculé.
        </p>
      </div>
    </details>
  );
}

export default function FinancesPage() {
  useDocumentTitle('Finances');
  const { data, dataLoading, dataError, activeOrg, currency, repo, refreshData, isRefreshing } = useApp();
  const [period, setPeriod] = useState<Period>(() => defaultPeriod());
  const [journal, setJournal] = useState<FinanceJournalRow[]>([]);
  const [serverSummary, setServerSummary] = useState<ServerFinanceSummary | null>(null);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [visibleRows, setVisibleRows] = useState(12);

  const organizationId = activeOrg?.organization.id ?? null;

  const summary = useMemo(() => computeFinanceSummary(data, period), [data, period]);
  const monthly = useMemo(() => buildMonthlySeries(data, period), [data, period]);
  const expensesByCategory = useMemo(() => expenseBreakdown(data.expenses, period), [data.expenses, period]);
  const purchasesByCategory = useMemo(() => purchaseBreakdown(data.purchases, period), [data.purchases, period]);

  const activityData = useMemo(
    () =>
      monthly.map((point) => ({
        label: point.label,
        values: {
          revenue: point.revenueHt,
          cashIn: point.cashIn,
          costs: point.purchases + point.expenses,
        },
      })),
    [monthly],
  );

  const resultData = useMemo(
    () => monthly.map((point) => ({ label: point.label, value: point.result })),
    [monthly],
  );

  const reconciliation = useMemo(
    () => (serverSummary ? reconcileWithServer(summary, serverSummary) : []),
    [serverSummary, summary],
  );

  useEffect(() => {
    if (!organizationId) {
      setJournal([]);
      setServerSummary(null);
      return;
    }
    let cancelled = false;
    setLoadingJournal(true);
    setJournalError(null);
    Promise.all([
      repo.listJournal(organizationId, period),
      repo.getServerSummary(organizationId, period),
    ])
      .then(([rows, server]) => {
        if (cancelled) return;
        setJournal(rows);
        setServerSummary(server);
      })
      .catch((error) => {
        if (cancelled) return;
        setJournalError(messageFromError(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingJournal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, organizationId, period.start, period.end, period]);

  useEffect(() => {
    setVisibleRows(12);
  }, [filter, search, period.start, period.end]);

  const filteredJournal = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return journal.filter((row) => {
      if (filter !== 'all' && row.source !== filter) return false;
      if (!needle) return true;
      return [row.reference, row.counterparty, row.category, SOURCE_META[row.source].label]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [journal, filter, search]);

  if (dataLoading && data.invoices.length === 0 && data.purchases.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const noActivity = summary.confidence === 'insufficient' && journal.length === 0;
  const topExpense = expensesByCategory[0];
  const sellThrough = summary.revenue.netTtc > 0
    ? (summary.revenue.paidOnIssued / summary.revenue.netTtc) * 100
    : 0;

  const confidenceMessage =
    summary.confidence === 'complete'
      ? 'Les achats de marchandises et les charges de la période sont renseignés. Le résultat reste une estimation de gestion.'
      : summary.confidence === 'partial'
        ? 'Certaines données de coûts manquent : le résultat est indicatif. Complétez les achats de marchandises, les achats d’exploitation et les dépenses.'
        : 'Aucune opération sur la période : les indicateurs sont à zéro, pas « bons ».';

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Pilotage financier"
        title="Finances"
        description="Vue d’ensemble de votre activité sur la période : ce que vous avez facturé, encaissé, acheté et dépensé — et ce qu’il reste réellement."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void refreshData();
              }}
              loading={isRefreshing}
            >
              Actualiser
            </Button>
            <Link to="/finances/achats">
              <Button size="sm" variant="accent" icon={<ShoppingCart className="size-4" />}>
                Nouvel achat
              </Button>
            </Link>
            <Link to="/finances/depenses">
              <Button size="sm" variant="secondary" icon={<Receipt className="size-4" />}>
                Nouvelle dépense
              </Button>
            </Link>
          </div>
        }
      />

      <PeriodFilter period={period} onChange={setPeriod} />

      {dataError && <ErrorState message={dataError} onRetry={() => void refreshData()} />}
      {journalError && <ErrorState message={journalError} title="Journal indisponible" onRetry={() => setPeriod({ ...period })} />}

      {!noActivity && (
        <div
          className={clsx(
            'flex flex-col gap-2 rounded-2xl border p-3.5 sm:flex-row sm:items-start sm:justify-between',
            summary.confidence === 'complete' && 'border-brand-200 bg-brand-50',
            summary.confidence === 'partial' && 'border-accent-500/30 bg-accent-400/10',
            summary.confidence === 'insufficient' && 'border-sand-300 bg-white',
          )}
        >
          <div className="flex items-start gap-2.5">
            {summary.confidence === 'complete' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-700" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent-600" />
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-ink-900">
                  {summary.confidence === 'complete'
                    ? 'Résultat estimé sur données complètes'
                    : summary.confidence === 'partial'
                      ? 'Estimation partielle'
                      : 'Données insuffisantes'}
                </p>
                <ConfidenceBadge confidence={summary.confidence} />
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">{confidenceMessage}</p>
              {summary.warnings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-ink-500">
                  {summary.warnings.slice(0, 2).map((warning) => (
                    <li key={warning} className="flex gap-1.5">
                      <span aria-hidden>•</span>
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              )}
              {reconciliation.length > 0 && (
                <p className="mt-1.5 text-xs font-medium text-danger-500">
                  Écart détecté entre le calcul affiché et la base : {reconciliation.join(' ; ')}.
                </p>
              )}
            </div>
          </div>
          <Badge tone="neutral" className="shrink-0">
            Non certifié — outil de gestion
          </Badge>
        </div>
      )}

      {noActivity && (
        <InlineAlert tone="info" title="Aucune opération sur cette période">
          <p>
            Aucune facture confirmée, aucun encaissement, achat ou dépense sur{' '}
            <strong>{period.label}</strong>. Changez de période ou{' '}
            <Link to="/finances/achats" className="font-medium underline">
              enregistrez un achat
            </Link>{' '}
            /{' '}
            <Link to="/finances/depenses" className="font-medium underline">
              une dépense
            </Link>
            .
          </p>
        </InlineAlert>
      )}

      {/* KPI principaux ------------------------------------------------------ */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Chiffre d’affaires facturé"
          value={summary.revenue.netHt}
          currency={currency}
          icon={<TrendingUp className="size-4" />}
          tone="brand"
          emphasize
          badge={<Badge tone="brand">HT · avoirs déduits</Badge>}
          hint={
            <>
              {summary.revenue.invoiceCount} facture(s) confirmée(s) · TTC{' '}
              {formatMoney(summary.revenue.netTtc, currency)}
              {summary.revenue.creditedHt > 0 && (
                <> · avoirs −{formatMoney(summary.revenue.creditedHt, currency)}</>
              )}
            </>
          }
        />

        <StatCard
          label="Montant encaissé"
          value={summary.cashIn}
          currency={currency}
          icon={<ArrowDownToLine className="size-4" />}
          tone="brand"
          emphasize
          hint={
            <>
              Paiements reçus sur {period.label}. Sur les factures de la période :{' '}
              {formatMoney(summary.revenue.paidOnIssued, currency)}.
            </>
          }
          footer={
            <ProgressBar
              value={summary.revenue.paidOnIssued}
              max={summary.revenue.issuedTtc}
              label={`Taux de règlement des factures de la période : ${formatPercent(sellThrough)}`}
            />
          }
        />

        <StatCard
          label="Reste à recevoir"
          value={summary.revenue.outstanding}
          currency={currency}
          icon={<Clock className="size-4" />}
          tone="accent"
          hint={
            <>
              {summary.revenue.partialCount} partiellement payée(s) · {summary.revenue.invoiceCount} facture(s)
              confirmée(s). Hors avoirs.
            </>
          }
        />

        <StatCard
          label="Trésorerie nette"
          value={summary.netCash}
          currency={currency}
          icon={<Banknote className="size-4" />}
          tone={summary.netCash < 0 ? 'danger' : 'neutral'}
          hint={
            <>
              Encaissements − décaissements enregistrés (achats payés{' '}
              {formatMoney(summary.purchasesPaid, currency)} + dépenses{' '}
              {formatMoney(summary.expensesTotal, currency)}). N’est pas un bénéfice.
            </>
          }
        />

        <StatCard
          label="Total des achats"
          value={summary.purchasesTotal}
          currency={currency}
          icon={<ShoppingCart className="size-4" />}
          tone="info"
          hint={
            <>
              {summary.purchasesCount} achat(s) · payé {formatMoney(summary.purchasesPaid, currency)} · reste{' '}
              {formatMoney(summary.purchasesDue, currency)}
            </>
          }
          footer={
            <Link
              to="/finances/achats"
              className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Gérer mes achats →
            </Link>
          }
        />

        <StatCard
          label="Total des dépenses"
          value={summary.expensesTotal}
          currency={currency}
          icon={<Receipt className="size-4" />}
          tone="accent"
          hint={
            topExpense
              ? `${summary.expensesCount} dépense(s) · principal poste : ${topExpense.label} (${formatMoney(topExpense.total, currency)})`
              : 'Aucune dépense enregistrée sur la période.'
          }
          footer={
            <Link
              to="/finances/depenses"
              className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              Gérer mes dépenses →
            </Link>
          }
        />

        <StatCard
          label="Marge brute"
          value={summary.grossMargin}
          currency={currency}
          icon={<PiggyBank className="size-4" />}
          tone="brand"
          unavailableLabel="Données insuffisantes"
          badge={
            summary.cogsAvailable ? (
              <Badge tone="brand">COGS {formatMoney(summary.cogsTotal, currency)}</Badge>
            ) : (
              <Badge tone="warning">COGS non renseigné</Badge>
            )
          }
          hint={
            summary.grossMargin === null
              ? 'Ajoutez vos achats de marchandises ou de matières premières pour calculer le coût des marchandises vendues.'
              : `Taux de marge brute : ${formatPercent(summary.grossMarginRate ?? 0)} du CA net HT.`
          }
        />

        <StatCard
          label="Bénéfice estimé"
          value={summary.estimatedResult}
          currency={currency}
          icon={<Wallet className="size-4" />}
          tone={summary.estimatedResult < 0 ? 'danger' : 'brand'}
          emphasize
          signed
          badge={<Badge tone="warning">Estimation de gestion</Badge>}
          hint={
            <>
              CA net − coûts ({formatMoney(summary.costsTotal, currency)}) sur la période.
              {summary.estimatedResultRate !== null && (
                <> Soit {formatPercent(summary.estimatedResultRate)} du CA net.</>
              )}{' '}
              Les investissements ({formatMoney(summary.capexTotal, currency)}) sont exclus.
            </>
          }
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<TrendingUp className="size-4" />}
            title="Activité mensuelle"
            subtitle="CA net facturé, encaissements et charges (achats + dépenses) par mois."
          />
          <div className="px-3 py-4 sm:px-4">
            <GroupedBarChart
              ariaLabel={`Activité mensuelle sur ${period.label} : chiffre d’affaires, encaissements et charges par mois.`}
              currency={currency}
              series={[
                { key: 'revenue', label: 'CA net HT', color: CHART_COLORS.brand },
                { key: 'cashIn', label: 'Encaissements', color: CHART_COLORS.accent },
                { key: 'costs', label: 'Charges', color: CHART_COLORS.ink },
              ]}
              data={activityData}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<Receipt className="size-4" />}
            title="Dépenses par catégorie"
            subtitle={period.label}
          />
          <div className="px-4 py-4">
            <DonutChart
              ariaLabel={`Répartition des dépenses par catégorie sur ${period.label}.`}
              currency={currency}
              centerLabel="Dépenses"
              data={expensesByCategory}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<PiggyBank className="size-4" />}
            title="Résultat estimé par mois"
            subtitle="CA mensuel moins achats et dépenses du mois — hors investissements."
            action={<ConfidenceBadge confidence={summary.confidence} />}
          />
          <div className="px-3 py-4">
            <ResultBarChart
              ariaLabel={`Résultat estimé mois par mois sur ${period.label}.`}
              currency={currency}
              data={resultData}
            />
          </div>
          <p className="border-t border-sand-200 px-4 py-2.5 text-[11px] leading-relaxed text-ink-500">
            Une estimation n’est pas un résultat comptable certifié : stocks, amortissements et
            charges à payer ne sont pas intégrés.
          </p>
        </Card>

        <Card>
          <CardHeader
            icon={<ShoppingCart className="size-4" />}
            title="Achats par nature"
            subtitle="Marchandises et matières premières alimentent le COGS ; les équipements sont exclus du résultat."
          />
          <div className="px-4 py-4">
            <DonutChart
              ariaLabel={`Répartition des achats par catégorie sur ${period.label}.`}
              currency={currency}
              centerLabel="Achats"
              data={purchasesByCategory}
            />
          </div>
        </Card>
      </div>

      <RevenueControlCard summary={summary} currency={currency} />

      <FormulaDetails currency={currency} />

      {/* Journal ------------------------------------------------------------- */}
      <Card>
        <CardHeader
          icon={<Info className="size-4" />}
          title="Historique des opérations"
          subtitle="Factures, encaissements, achats et dépenses de la période. Les brouillons et annulées n’y figurent pas."
          action={
            <div className="flex items-center gap-2">
              <Badge tone="neutral">{filteredJournal.length} ligne(s)</Badge>
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="size-3.5" />}
                onClick={() => {
                  downloadCsv(
                    `journal-financier-${period.start}-${period.end}.csv`,
                    journalToCsv(filteredJournal),
                  );
                }}
                disabled={filteredJournal.length === 0}
              >
                CSV
              </Button>
            </div>
          }
        />

        <div className="flex flex-col gap-2 border-b border-sand-200 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une référence, un client, un fournisseur…"
              aria-label="Rechercher dans l’historique"
              className="field pl-9"
            />
          </div>
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            aria-label="Filtrer par type d’opération"
            className="sm:w-56"
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        {loadingJournal ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : filteredJournal.length === 0 ? (
          <EmptyState
            icon={<Info className="size-5" />}
            title={
              journal.length === 0
                ? 'Aucune opération sur cette période'
                : 'Aucune opération ne correspond à votre recherche'
            }
            description={
              journal.length === 0
                ? 'Les factures confirmées, encaissements, achats et dépenses apparaîtront ici.'
                : 'Modifiez le filtre ou effacez la recherche.'
            }
          />
        ) : (
          <>
            {/* Tableau desktop */}
            <div className="thin-scroll hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">
                  Historique des opérations financières de {period.label}
                </caption>
                <thead>
                  <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                    <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Date</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Opération</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Tiers</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Impact résultat</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Trésorerie</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJournal.slice(0, visibleRows).map((row) => (
                    <tr key={row.id} className="border-b border-sand-100 last:border-0 hover:bg-sand-50/60">
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500 sm:px-5">
                        {formatDateFR(row.occurredOn)}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Badge tone={SOURCE_META[row.source].tone}>{SOURCE_META[row.source].label}</Badge>
                          <span className="money text-xs font-medium text-ink-900">{row.reference}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] capitalize text-ink-500">{row.category.replace(/_/g, ' ')}</p>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-2.5 text-sm text-ink-700">
                        {row.counterparty}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm">
                        <JournalAmount value={row.amountHt} kind="result" />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm sm:px-5">
                        <JournalAmount value={row.cashIn - row.cashOut} kind="cash" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartes mobile */}
            <ul className="divide-y divide-sand-100 md:hidden">
              {filteredJournal.slice(0, visibleRows).map((row) => (
                <li key={row.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={SOURCE_META[row.source].tone}>{SOURCE_META[row.source].label}</Badge>
                        <span className="money text-xs font-medium">{row.reference}</span>
                      </div>
                      <p className="mt-1 truncate text-sm text-ink-700">{row.counterparty}</p>
                      <p className="text-[11px] text-ink-500">
                        {formatDateFR(row.occurredOn)} · <span className="capitalize">{row.category.replace(/_/g, ' ')}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {row.amountHt !== 0 && (
                        <p className="text-sm">
                          <JournalAmount value={row.amountHt} kind="result" />
                        </p>
                      )}
                      {(row.cashIn !== 0 || row.cashOut !== 0) && (
                        <p className="text-xs">
                          <JournalAmount value={row.cashIn - row.cashOut} kind="cash" />
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {filteredJournal.length > visibleRows && (
              <div className="border-t border-sand-200 px-4 py-3 text-center">
                <Button variant="secondary" size="sm" onClick={() => setVisibleRows((count) => count + 20)}>
                  Afficher {Math.min(20, filteredJournal.length - visibleRows)} ligne(s) de plus
                </Button>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sand-200 bg-sand-50 px-4 py-2.5 text-[11px] text-ink-500 sm:px-5">
          <span>
            Période : {formatDateShort(period.start)} → {formatDateShort(period.end)}
          </span>
          <span className="flex items-center gap-1.5">
            {serverSummary && reconciliation.length === 0 ? (
              <>
                <CheckCircle2 className="size-3.5 text-success-600" />
                Totaux recoupés avec la base
              </>
            ) : reconciliation.length > 0 ? (
              <>
                <AlertTriangle className="size-3.5 text-danger-500" />
                Écart de calcul détecté
              </>
            ) : (
              <>Agrégats serveur indisponibles</>
            )}
          </span>
        </div>
      </Card>
    </div>
  );
}
