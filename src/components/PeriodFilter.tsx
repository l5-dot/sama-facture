/**
 * Sélecteur de période : mois, trimestre, année, personnalisée.
 * La navigation ◀ ▶ décale d'un mois / trimestre / année ; la période
 * personnalisée conserve ses bornes et n'affiche pas les flèches.
 */

import { useEffect, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import {
  buildCustomPeriod,
  buildPeriod,
  PRESET_LABELS,
  shiftPeriod,
  type Period,
  type PeriodPreset,
} from '../lib/period';
import { parseISODate, todayISO } from '../lib/dates';
import { validateCustomPeriod } from '../lib/validation';
import { Button, Input } from './ui';

const PRESETS: PeriodPreset[] = ['month', 'quarter', 'year', 'custom'];

export function PeriodFilter({
  period,
  onChange,
  className,
}: {
  period: Period;
  onChange: (period: Period) => void;
  className?: string;
}) {
  const [customOpen, setCustomOpen] = useState(period.preset === 'custom');
  const [start, setStart] = useState(period.start);
  const [end, setEnd] = useState(period.end);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStart(period.start);
    setEnd(period.end);
  }, [period.start, period.end]);

  const handlePreset = (preset: PeriodPreset) => {
    if (preset === 'custom') {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setError(null);
    onChange(buildPeriod(preset, period.preset === 'custom' ? parseISODate(period.end) : parseISODate(period.start)));
  };

  const applyCustom = () => {
    const validation = validateCustomPeriod(start, end);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    setCustomOpen(false);
    onChange(buildCustomPeriod(start, end));
  };

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex rounded-xl border border-sand-300 bg-white p-0.5 shadow-sm"
          role="group"
          aria-label="Période d’analyse"
        >
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-pressed={period.preset === preset}
              onClick={() => handlePreset(preset)}
              className={clsx(
                'rounded-[10px] px-2.5 py-1.5 text-xs font-medium transition sm:px-3 sm:text-[13px]',
                period.preset === preset
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-ink-700 hover:bg-sand-100',
              )}
            >
              {PRESET_LABELS[preset]}
            </button>
          ))}
        </div>

        <div className="flex min-w-0 items-center gap-1">
          {period.preset !== 'custom' && (
            <button
              type="button"
              onClick={() => onChange(shiftPeriod(period, -1))}
              className="rounded-lg border border-sand-300 bg-white p-1.5 text-ink-700 transition hover:bg-sand-100"
              aria-label="Période précédente"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          <div className="flex min-w-0 items-center gap-1.5 px-1 text-sm font-medium text-ink-900">
            <CalendarDays className="size-4 shrink-0 text-brand-600" aria-hidden />
            <span className="truncate capitalize">{period.label}</span>
          </div>
          {period.preset !== 'custom' && (
            <button
              type="button"
              onClick={() => onChange(shiftPeriod(period, 1))}
              className="rounded-lg border border-sand-300 bg-white p-1.5 text-ink-700 transition hover:bg-sand-100"
              aria-label="Période suivante"
            >
              <ChevronRight className="size-4" />
            </button>
          )}
        </div>
      </div>

      {customOpen && (
        <div className="flex flex-col gap-2 rounded-xl border border-sand-200 bg-white p-3 shadow-sm sm:flex-row sm:items-end">
          <label className="flex-1 text-xs font-medium text-ink-700">
            Du
            <Input
              type="date"
              value={start}
              max={end || todayISO()}
              onChange={(event) => setStart(event.target.value)}
              className="mt-1"
              aria-label="Date de début"
            />
          </label>
          <label className="flex-1 text-xs font-medium text-ink-700">
            Au
            <Input
              type="date"
              value={end}
              min={start}
              onChange={(event) => setEnd(event.target.value)}
              className="mt-1"
              aria-label="Date de fin"
            />
          </label>
          <Button size="sm" onClick={applyCustom} className="sm:mb-0.5">
            Appliquer
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger-500">
          {error}
        </p>
      )}
    </div>
  );
}
