/**
 * Graphiques SVG légers, sans dépendance externe.
 *
 * Accessibilité : chaque graphique porte un rôle `img` et un `aria-label`
 * résumant la tendance ; les valeurs exactes restent disponibles dans les
 * tableaux et les infobulles natives (`<title>`).
 */

import { formatMoney } from '../lib/money';
import clsx from 'clsx';

const COLORS = {
  brand: '#0f6b4f',
  brandSoft: '#7dbd9d',
  accent: '#e39a33',
  ink: '#5b6b64',
  danger: '#c0392b',
  sand: '#d9cbb0',
};

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarPoint {
  label: string;
  values: Record<string, number>;
}

/** Montant compact pour les axes : 12 500 → « 12,5 k ». */
export function compactAmount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace('.', ',')} k`;
  return `${sign}${Math.round(abs)}`;
}

function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

export function GroupedBarChart({
  data,
  series,
  currency = 'XOF',
  height = 260,
  ariaLabel,
}: {
  data: BarPoint[];
  series: BarSeries[];
  currency?: string;
  height?: number;
  ariaLabel: string;
}) {
  if (data.length === 0 || series.length === 0) return <ChartEmpty />;

  const width = 720;
  const padding = { top: 16, right: 12, bottom: 34, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const allValues = data.flatMap((point) => series.map((s) => Math.abs(point.values[s.key] ?? 0)));
  const max = niceMax(Math.max(...allValues, 1));
  // `niceMax` peut produire de très petits maxima : on déduplique pour éviter
  // des clés React identiques (et des graduations superposées).
  const ticks = Array.from(new Set([0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.round(max * ratio))));

  const band = plotWidth / data.length;
  const barGroupWidth = band * 0.66;
  const barWidth = Math.max(4, barGroupWidth / series.length - 2);

  const showEvery = data.length > 8 ? Math.ceil(data.length / 8) : 1;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        {ticks.map((tick) => {
          const y = padding.top + plotHeight - (tick / max) * plotHeight;
          return (
            <g key={`tick-${tick}`}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke={tick === 0 ? COLORS.sand : '#ece6da'}
                strokeWidth={1}
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="11" fill={COLORS.ink}>
                {compactAmount(tick)}
              </text>
            </g>
          );
        })}
        {data.map((point, pointIndex) => {
          const groupX = padding.left + pointIndex * band + (band - barGroupWidth) / 2;
          return (
            <g key={`${point.label}-${pointIndex}`}>
              {series.map((s, seriesIndex) => {
                const value = point.values[s.key] ?? 0;
                const barHeight = Math.max((Math.abs(value) / max) * plotHeight, value === 0 ? 0 : 1.5);
                const x = groupX + seriesIndex * (barWidth + 2);
                const y = padding.top + plotHeight - barHeight;
                return (
                  <rect
                    key={s.key}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={3}
                    fill={s.color}
                  >
                    <title>
                      {`${point.label} · ${s.label} : ${formatMoney(value, currency)}`}
                    </title>
                  </rect>
                );
              })}
              {(pointIndex % showEvery === 0 || pointIndex === data.length - 1) && (
                <text
                  x={padding.left + pointIndex * band + band / 2}
                  y={height - 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill={COLORS.ink}
                >
                  {point.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Barres de résultat pouvant être négatives. */
export function ResultBarChart({
  data,
  currency = 'XOF',
  ariaLabel,
}: {
  data: Array<{ label: string; value: number }>;
  currency?: string;
  ariaLabel: string;
}) {
  if (data.length === 0) return <ChartEmpty />;

  const width = 720;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 34, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const max = Math.max(...data.map((d) => d.value), 0);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const zeroY = padding.top + (max / range) * plotHeight;
  const barWidth = Math.max(6, Math.min(36, (plotWidth / data.length) * 0.55));
  const showEvery = data.length > 8 ? Math.ceil(data.length / 8) : 1;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      <line
        x1={padding.left}
        x2={width - padding.right}
        y1={zeroY}
        y2={zeroY}
        stroke={COLORS.sand}
        strokeWidth={1.5}
      />
      {data.map((point, index) => {
        const band = plotWidth / data.length;
        const centerX = padding.left + index * band + band / 2;
        const valueHeight = (Math.abs(point.value) / range) * plotHeight;
        const y = point.value >= 0 ? zeroY - valueHeight : zeroY;
        return (
          <g key={`${point.label}-${index}`}>
            <rect
              x={centerX - barWidth / 2}
              y={Math.min(y, zeroY)}
              width={barWidth}
              height={Math.max(valueHeight, point.value === 0 ? 0 : 1)}
              rx={3}
              fill={point.value >= 0 ? COLORS.brand : COLORS.danger}
              opacity={point.value >= 0 ? 0.9 : 0.85}
            >
              <title>{`${point.label} : ${formatMoney(point.value, currency, { signed: true })}`}</title>
            </rect>
            {(index % showEvery === 0 || index === data.length - 1) && (
              <text
                x={centerX}
                y={height - 12}
                textAnchor="middle"
                fontSize="11"
                fill={COLORS.ink}
              >
                {point.label}
              </text>
            )}
          </g>
        );
      })}
      <text x={padding.left - 8} y={zeroY + 4} textAnchor="end" fontSize="11" fill={COLORS.ink}>
        0
      </text>
      <text x={padding.left - 8} y={padding.top + 10} textAnchor="end" fontSize="11" fill={COLORS.ink}>
        {compactAmount(max)}
      </text>
      {min < 0 && (
        <text x={padding.left - 8} y={height - padding.bottom} textAnchor="end" fontSize="11" fill={COLORS.danger}>
          {compactAmount(min)}
        </text>
      )}
    </svg>
  );
}

export function DonutChart({
  data,
  currency = 'XOF',
  centerLabel,
  ariaLabel,
}: {
  data: Array<{ label: string; total: number }>;
  currency?: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const palette = [COLORS.brand, COLORS.accent, '#4c9d78', '#c2ad8b', '#2563a8', '#a13226', '#93a19a'];
  const rows = data.filter((row) => row.total > 0);
  const total = rows.reduce((acc, row) => acc + row.total, 0);
  if (rows.length === 0 || total <= 0) return <ChartEmpty />;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <svg
        viewBox="0 0 160 160"
        className="size-40 shrink-0"
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#f4efe4" strokeWidth="22" />
        {rows.reduce<{ offset: number; nodes: React.ReactNode[] }>(
          (acc, row, index) => {
            const fraction = row.total / total;
            const length = fraction * circumference;
            const circle = (
              <circle
                key={row.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={palette[index % palette.length]}
                strokeWidth="22"
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-acc.offset}
                transform="rotate(-90 80 80)"
                strokeLinecap="butt"
              >
                <title>{`${row.label} : ${formatMoney(row.total, currency)}`}</title>
              </circle>
            );
            acc.nodes.push(circle);
            acc.offset += length;
            return acc;
          },
          { offset: 0, nodes: [] },
        ).nodes}
        <text x="80" y="74" textAnchor="middle" fontSize="10" fill={COLORS.ink}>
          {centerLabel}
        </text>
        <text x="80" y="90" textAnchor="middle" fontSize="13" fontWeight="600" fill="#16211c">
          {formatMoney(total, currency, { withSymbol: false })}
        </text>
      </svg>
      <ul className="w-full space-y-2">
        {rows.map((row, index) => (
          <li key={row.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink-700">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: palette[index % palette.length] }}
                aria-hidden
              />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="money shrink-0 text-xs text-ink-900">
              {formatMoney(row.total, currency)}
              <span className="ml-1.5 text-ink-300">{Math.round((row.total / total) * 100)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartEmpty({ label = 'Aucune donnée sur cette période.' }: { label?: string }) {
  return (
    <div
      className={clsx(
        'flex min-h-32 items-center justify-center rounded-xl border border-dashed border-sand-300 bg-sand-50 px-4 py-8 text-center text-sm text-ink-500',
      )}
      role="status"
    >
      {label}
    </div>
  );
}

export { COLORS as CHART_COLORS };
