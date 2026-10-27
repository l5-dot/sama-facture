import { useMemo, useState } from 'react';
import { Download, FileBarChart, Info } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { buildPeriod, type Period } from '../lib/period';
import { parseISODate } from '../lib/dates';
import { buildMonthlySeries, computeFinanceSummary } from '../lib/finance';
import { formatMoney } from '../lib/money';
import { StatCard } from '../components/StatCard';
import { PeriodFilter } from '../components/PeriodFilter';
import { Button, Card, CardHeader, InlineAlert, Money, SectionHeading } from '../components/ui';
import { downloadCsv } from '../lib/export';

export default function ReportsPage() {
  useDocumentTitle('Rapports');
  const { data, currency } = useApp();
  const [period, setPeriod] = useState<Period>(() => buildPeriod('year', new Date()));

  const summary = useMemo(() => computeFinanceSummary(data, period), [data, period]);
  const monthly = useMemo(() => buildMonthlySeries(data, period), [data, period]);

  const exportCsv = () => {
    const header = ['Mois', 'CA net HT', 'Encaissements', 'Achats', 'Dépenses', 'Résultat estimé'];
    const lines = monthly.map((row) =>
      [row.label, row.revenueHt, row.cashIn, row.purchases, row.expenses, row.result]
        .map((value) => (typeof value === 'number' ? value.toFixed(2).replace('.', ',') : value))
        .join(';'),
    );
    downloadCsv(
      `rapport-${period.start}-${period.end}.csv`,
      `\uFEFF${header.join(';')}\n${lines.join('\n')}\n`,
    );
  };

  const yearLabel = parseISODate(period.end).getFullYear();

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Pilotage"
        title="Rapports"
        description="Synthèse mensuelle de l’activité et estimation du résultat. Les mêmes règles que la page Finances s’appliquent : brouillons et annulées exclus, avoirs déduits."
        action={
          <Button variant="secondary" onClick={exportCsv} icon={<Download className="size-4" />}>
            Exporter en CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodFilter period={period} onChange={setPeriod} />
        <button
          type="button"
          onClick={() => setPeriod(buildPeriod('year', new Date()))}
          className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline"
        >
          Revenir à l’année en cours
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="CA net HT"
          value={summary.revenue.netHt}
          currency={currency}
          hint={`${summary.revenue.invoiceCount} facture(s) confirmée(s) · avoirs déduits`}
        />
        <StatCard
          label="Encaissements"
          value={summary.cashIn}
          currency={currency}
          tone="neutral"
          hint="Trésorerie reçue sur la période"
        />
        <StatCard
          label="Coûts enregistrés"
          value={summary.costsTotal}
          currency={currency}
          tone="accent"
          hint={`Achats ${formatMoney(summary.purchasesTotal, currency)} · dépenses ${formatMoney(
            summary.expensesTotal,
            currency,
          )}`}
        />
        <StatCard
          label="Résultat estimé"
          value={summary.estimatedResult}
          currency={currency}
          tone={summary.estimatedResult < 0 ? 'danger' : 'brand'}
          signed
          emphasize
          hint={
            summary.confidence === 'complete'
              ? 'Données complètes sur la période.'
              : 'Estimation partielle : vérifiez les achats et dépenses saisis.'
          }
        />
      </div>

      <InlineAlert tone="info" title="Lecture des rapports">
        Il s’agit d’une aide à la décision, pas d’une liasse fiscale. Les investissements
        ({formatMoney(summary.capexTotal, currency)}) sont exclus du résultat estimé ; les
        encaissements incluent les règlements de factures antérieures.
      </InlineAlert>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={<FileBarChart className="size-4" />}
            title={`Synthèse mensuelle — ${yearLabel}`}
            subtitle="Montants HT pour le chiffre d’affaires et les coûts ; encaissements = trésorerie réelle."
          />
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Synthèse financière mensuelle</caption>
              <thead>
                <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Mois</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">CA net HT</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Encaissements</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Achats</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Dépenses</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Résultat estimé</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row) => (
                  <tr key={row.key} className="border-b border-sand-100 last:border-0">
                    <td className="px-4 py-2.5 capitalize sm:px-5">{row.label}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Money value={row.revenueHt} currency={currency} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-700">
                      <Money value={row.cashIn} currency={currency} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-700">
                      <Money value={row.purchases} currency={currency} />
                    </td>
                    <td className="px-4 py-2.5 text-right text-ink-700">
                      <Money value={row.expenses} currency={currency} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Money
                        value={row.result}
                        currency={currency}
                        signed
                        className={row.result < 0 ? 'font-medium text-danger-600' : 'font-medium text-ink-900'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-sand-300 bg-sand-50 font-semibold">
                  <td className="px-4 py-2.5 sm:px-5">Total</td>
                  <td className="px-4 py-2.5 text-right">
                    <Money value={summary.revenue.netHt} currency={currency} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money value={summary.cashIn} currency={currency} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money value={summary.purchasesTotal} currency={currency} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money value={summary.expensesTotal} currency={currency} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Money value={summary.estimatedResult} currency={currency} signed />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader icon={<Info className="size-4" />} title="Qualité des données" subtitle={period.label} />
          <div className="space-y-3 p-4 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-600" aria-hidden />
              <div>
                <p className="font-medium">Achats de marchandises</p>
                <p className="text-xs text-ink-500">
                  {summary.cogsAvailable
                    ? `${formatMoney(summary.cogsTotal, currency)} de COGS enregistré.`
                    : 'Aucun achat COGS sur la période : marge brute indisponible.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-accent-500" aria-hidden />
              <div>
                <p className="font-medium">Dépenses</p>
                <p className="text-xs text-ink-500">
                  {summary.expensesCount > 0
                    ? `${summary.expensesCount} dépense(s), ${formatMoney(summary.expensesTotal, currency)}.`
                    : 'Aucune dépense enregistrée : le résultat surestime probablement la rentabilité.'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-ink-300" aria-hidden />
              <div>
                <p className="font-medium">Documents exclus</p>
                <p className="text-xs text-ink-500">
                  {summary.revenue.draftCount} brouillon(s) · {summary.revenue.cancelledCount} annulée(s) —
                  jamais comptés dans le CA.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-300" aria-hidden />
              <div>
                <p className="font-medium">Avoirs</p>
                <p className="text-xs text-ink-500">
                  {summary.revenue.creditNoteCount} avoir(s) déduits pour{' '}
                  {formatMoney(summary.revenue.creditedHt, currency)} HT.
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
