/**
 * Primitives d'interface partagées : boutons, champs, cartes, modales, états
 * vides/erreur. Volontairement sobres et accessibles (focus visibles, labels
 * reliés, fermeture par Échap, aria-*).
 */

import { AlertTriangle, CheckCircle2, Info, Loader2, RefreshCw, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';
import { formatMoney } from '../lib/money';
import type { Toast } from '../context/AppContext';

// -----------------------------------------------------------------------------
// Boutons
// -----------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type ButtonSize = 'sm' | 'md';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary:
    'border border-sand-300 bg-white text-ink-900 hover:bg-sand-100 disabled:text-ink-300',
  ghost: 'text-ink-700 hover:bg-sand-100 disabled:text-ink-300',
  danger: 'bg-danger-500 text-white hover:bg-danger-600 disabled:bg-danger-500/50',
  accent: 'bg-accent-500 text-white hover:bg-accent-600 disabled:bg-accent-400/60',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'gap-1.5 px-2.5 py-1.5 text-xs',
  md: 'gap-2 px-4 py-2.5 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-xl font-medium transition focus-visible:outline-offset-2 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

// -----------------------------------------------------------------------------
// Champs
// -----------------------------------------------------------------------------
interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={clsx('min-w-0', className)}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-danger-500" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs font-medium text-danger-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('field', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('field appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('field min-h-20 resize-y', className)} {...props} />;
}

// -----------------------------------------------------------------------------
// Cartes / badges
// -----------------------------------------------------------------------------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('card', className)}>{children}</section>;
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-200 px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-2.5">
        {icon && <div className="mt-0.5 text-brand-600">{icon}</div>}
        <div>
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sand-100 text-ink-700 ring-sand-200',
  success: 'bg-success-50 text-success-600 ring-success-600/20',
  warning: 'bg-accent-400/15 text-accent-600 ring-accent-500/25',
  danger: 'bg-danger-50 text-danger-600 ring-danger-500/20',
  info: 'bg-info-50 text-info-600 ring-info-600/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Montants
// -----------------------------------------------------------------------------
export function Money({
  value,
  currency = 'XOF',
  className,
  signed = false,
  withSymbol = true,
}: {
  value: number;
  currency?: string;
  className?: string;
  signed?: boolean;
  withSymbol?: boolean;
}) {
  return (
    <span className={clsx('money', className)}>
      {formatMoney(value, currency, { signed, withSymbol })}
    </span>
  );
}

// -----------------------------------------------------------------------------
// Modale
// -----------------------------------------------------------------------------
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), select, textarea, button[data-autofocus]',
      );
      target?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink-900/45 p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Fermer"
        className="absolute inset-0 h-full w-full cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={clsx(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-2xl',
          widths[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-sand-200 px-5 py-4">
          <div>
            <h2 id={titleId} className="font-display text-lg font-semibold">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 transition hover:bg-sand-100 hover:text-ink-900"
            aria-label="Fermer la fenêtre"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-sand-200 bg-sand-50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// États
// -----------------------------------------------------------------------------
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      {icon && (
        <div className="flex size-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          {icon}
        </div>
      )}
      <div>
        <p className="font-medium text-ink-900">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  title = 'Impossible de charger les données',
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-2xl border border-danger-500/25 bg-danger-50 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-500" aria-hidden />
        <div>
          <p className="font-semibold text-danger-600">{title}</p>
          <p className="mt-0.5 text-danger-600/90">{message}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshCw className="size-3.5" />}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-sand-200/80', className)} />;
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: 'border-info-600/20 bg-info-50 text-info-600',
    warning: 'border-accent-500/30 bg-accent-400/10 text-accent-600',
    danger: 'border-danger-500/25 bg-danger-50 text-danger-600',
    success: 'border-success-600/20 bg-success-50 text-success-600',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={clsx('rounded-xl border p-3 text-sm', styles)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          {title && <p className="font-semibold">{title}</p>}
          <div className={title ? 'mt-0.5' : ''}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------
export function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm shadow-pop',
            toast.kind === 'success' && 'border-brand-200 bg-white text-ink-900',
            toast.kind === 'error' && 'border-danger-500/30 bg-white text-ink-900',
            toast.kind === 'info' && 'border-sand-300 bg-white text-ink-900',
          )}
        >
          {toast.kind === 'success' && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-600" />}
          {toast.kind === 'error' && <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger-500" />}
          {toast.kind === 'info' && <Info className="mt-0.5 size-4 shrink-0 text-info-600" />}
          <p className="flex-1">{toast.message}</p>
          <button
            type="button"
            className="rounded p-0.5 text-ink-300 hover:text-ink-700"
            aria-label="Fermer la notification"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-600">{eyebrow}</p>
        )}
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
