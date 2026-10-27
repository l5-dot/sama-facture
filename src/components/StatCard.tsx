import type { ReactNode } from 'react';
import clsx from 'clsx';
import { formatMoney } from '../lib/money';

export type StatTone = 'brand' | 'accent' | 'neutral' | 'danger' | 'info';

const TONES: Record<StatTone, { card: string; icon: string; value: string }> = {
  brand: { card: '', icon: 'bg-brand-50 text-brand-700', value: 'text-ink-900' },
  accent: { card: '', icon: 'bg-accent-400/15 text-accent-600', value: 'text-ink-900' },
  neutral: { card: '', icon: 'bg-sand-100 text-ink-700', value: 'text-ink-900' },
  danger: { card: 'border-danger-500/25', icon: 'bg-danger-50 text-danger-600', value: 'text-danger-600' },
  info: { card: '', icon: 'bg-info-50 text-info-600', value: 'text-ink-900' },
};

export interface StatCardProps {
  label: string;
  value: number | null;
  currency?: string;
  icon?: ReactNode;
  tone?: StatTone;
  hint?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  signed?: boolean;
  emphasize?: boolean;
  /** Affiché quand la valeur est indisponible (null). */
  unavailableLabel?: string;
  className?: string;
  'data-testid'?: string;
}

/** Carte d'indicateur financier : montant tabulaire + contexte. */
export function StatCard({
  label,
  value,
  currency = 'XOF',
  icon,
  tone = 'brand',
  hint,
  badge,
  footer,
  signed = false,
  emphasize = false,
  unavailableLabel = '—',
  className,
  ...rest
}: StatCardProps) {
  const styles = TONES[tone];
  return (
    <div className={clsx('card flex flex-col gap-2 p-4', styles.card, className)} {...rest}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {icon && (
          <span className={clsx('flex size-8 items-center justify-center rounded-lg', styles.icon)}>
            {icon}
          </span>
        )}
      </div>
      <p
        className={clsx(
          'money break-words font-semibold leading-tight',
          emphasize ? 'text-[26px] sm:text-[28px]' : 'text-[22px]',
          styles.value,
        )}
      >
        {value === null ? unavailableLabel : formatMoney(value, currency, { signed })}
      </p>
      {badge}
      {hint && <div className="text-xs leading-relaxed text-ink-500">{hint}</div>}
      {footer && <div className="mt-auto border-t border-sand-200 pt-2">{footer}</div>}
    </div>
  );
}

export function MiniStat({
  label,
  value,
  currency = 'XOF',
  tone = 'neutral',
}: {
  label: string;
  value: number;
  currency?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  const color = {
    neutral: 'text-ink-900',
    success: 'text-success-600',
    warning: 'text-accent-600',
    danger: 'text-danger-600',
  }[tone];
  return (
    <div className="rounded-xl bg-sand-50 px-3 py-2">
      <p className="text-[11px] text-ink-500">{label}</p>
      <p className={clsx('money text-sm font-semibold', color)}>{formatMoney(value, currency)}</p>
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  tone = 'brand',
}: {
  value: number;
  max: number;
  label?: string;
  tone?: 'brand' | 'accent' | 'danger';
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const color = { brand: 'bg-brand-600', accent: 'bg-accent-500', danger: 'bg-danger-500' }[tone];
  return (
    <div>
      {label && <p className="mb-1 text-[11px] text-ink-500">{label}</p>}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progression'}
      >
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
