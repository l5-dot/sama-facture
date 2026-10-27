/**
 * Coquille de l'application : navigation latérale, en-tête mobile, sélecteur
 * d'organisation et notifications.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Banknote,
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import { useApp, type Toast } from '../context/AppContext';
import { ROLE_LABELS } from '../lib/constants';
import { Button, Input, Modal, Select, ToastViewport } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  financeSub?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/', label: 'Tableau de bord', icon: <LayoutDashboard className="size-[18px]" />, end: true },
      { to: '/finances', label: 'Finances', icon: <Wallet className="size-[18px]" />, end: true },
      { to: '/finances/achats', label: 'Mes achats', icon: <ShoppingCart className="size-[18px]" />, financeSub: true },
      { to: '/finances/depenses', label: 'Mes dépenses', icon: <Receipt className="size-[18px]" />, financeSub: true },
      { to: '/rapports', label: 'Rapports', icon: <Banknote className="size-[18px]" /> },
    ],
  },
  {
    title: 'Ventes',
    items: [
      { to: '/factures', label: 'Factures', icon: <FileText className="size-[18px]" /> },
      { to: '/clients', label: 'Clients', icon: <Users className="size-[18px]" /> },
      { to: '/produits', label: 'Produits', icon: <Package className="size-[18px]" /> },
    ],
  },
  {
    title: 'Organisation',
    items: [{ to: '/parametres', label: 'Paramètres', icon: <Settings className="size-[18px]" /> }],
  },
];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function OrganizationSwitcher({ compact = false }: { compact?: boolean }) {
  const { orgs, activeOrg, switchOrganization, createOrganization, mode } = useApp();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('XOF');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const submit = async () => {
    if (name.trim().length < 2) {
      setFormError('Le nom doit contenir au moins 2 caractères.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await createOrganization(name.trim(), currency);
      setCreateOpen(false);
      setName('');
    } catch {
      /* notification déjà affichée par le contexte */
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          'flex w-full items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left transition hover:bg-white/15',
          compact && 'border-sand-300 bg-white text-ink-900 hover:bg-sand-100',
        )}
      >
        <span
          className={clsx(
            'flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold',
            compact ? 'bg-brand-50 text-brand-700' : 'bg-brand-200/20 text-white',
          )}
        >
          {initials(activeOrg?.organization.name ?? 'SF')}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {activeOrg?.organization.name ?? 'Aucune organisation'}
          </span>
          <span className={clsx('block truncate text-[11px]', compact ? 'text-ink-500' : 'text-brand-100/80')}>
            {activeOrg ? ROLE_LABELS[activeOrg.role] : '—'}
            {mode === 'demo' && ' · démo'}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Choisir une organisation"
          className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-xl border border-sand-200 bg-white py-1 text-ink-900 shadow-pop"
        >
          {orgs.map((access) => (
            <button
              key={access.organization.id}
              type="button"
              role="option"
              aria-selected={access.organization.id === activeOrg?.organization.id}
              onClick={() => {
                switchOrganization(access.organization.id);
                setOpen(false);
              }}
              className={clsx(
                'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-sand-100',
                access.organization.id === activeOrg?.organization.id && 'bg-brand-50/70 font-medium',
              )}
            >
              <span className="truncate">{access.organization.name}</span>
              <span className="shrink-0 text-[11px] text-ink-500">{ROLE_LABELS[access.role]}</span>
            </button>
          ))}
          <div className="my-1 border-t border-sand-200" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setCreateOpen(true);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-brand-700 transition hover:bg-brand-50"
          >
            <Plus className="size-4" /> Créer une organisation
          </button>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Créer une organisation"
        description="Un nouvel espace isolé : clients, factures et finances séparés."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={submit} loading={submitting}>
              Créer
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block text-sm font-medium text-ink-700">
            Nom de l’entreprise
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex. Boutique Sokhna"
              maxLength={160}
              className="mt-1"
            />
          </label>
          <label className="block text-sm font-medium text-ink-700">
            Devise
            <Select value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-1">
              <option value="XOF">FCFA (XOF)</option>
              <option value="XAF">FCFA (XAF)</option>
              <option value="EUR">Euro (EUR)</option>
              <option value="USD">Dollar (USD)</option>
            </Select>
          </label>
          {formError && (
            <p role="alert" className="text-sm text-danger-500">
              {formError}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <nav aria-label="Navigation principale" className="mt-4 space-y-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-100/50">
            {section.title}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    clsx(
                      'group flex items-center gap-2.5 rounded-lg py-2 text-sm transition',
                      item.financeSub ? 'ml-4 py-1.5 pl-3 text-[13px]' : 'px-3',
                      isActive
                        ? 'bg-white/15 font-medium text-white'
                        : 'text-brand-50/80 hover:bg-white/10 hover:text-white',
                      item.financeSub && !isActive && 'text-brand-100/65',
                      item.financeSub && isActive && 'bg-white/10',
                    )
                  }
                >
                  {item.icon}
                  <span className="flex-1">{item.label}</span>
                  {item.to === '/finances' && location.pathname === '/' && (
                    <span className="rounded-full bg-accent-500 px-1.5 text-[9px] font-semibold text-white">
                      NOUVEAU
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, role, mode, signOut, resetDemo } = useApp();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-4 pt-5">
        <span className="flex size-9 items-center justify-center rounded-xl bg-accent-500 text-base font-bold text-white shadow-sm">
          S
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[17px] font-semibold text-white">Sama Facture</p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-brand-100/60">Gestion & finances</p>
        </div>
      </div>
      <div className="px-3">
        <OrganizationSwitcher />
      </div>
      <div className="thin-scroll mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <NavList onNavigate={onNavigate} />
      </div>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-1 py-1.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-200/20 text-xs font-semibold text-white">
            {initials(user?.fullName ?? user?.email ?? 'SF')}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user?.fullName ?? 'Utilisateur'}</p>
            <p className="truncate text-[11px] text-brand-100/70">
              {role ? ROLE_LABELS[role] : 'Sans rôle'}
              {mode === 'demo' && ' · mode démo'}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
            className="rounded-lg p-1.5 text-brand-100/70 transition hover:bg-white/10 hover:text-white"
            aria-label="Se déconnecter"
            title="Se déconnecter"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        {mode === 'demo' && (
          <button
            type="button"
            onClick={resetDemo}
            className="mt-1 w-full rounded-lg px-2 py-1 text-left text-[11px] text-brand-100/60 hover:bg-white/10 hover:text-white"
          >
            Réinitialiser les données de démo
          </button>
        )}
      </div>
    </div>
  );
}

function MobileHeader({ onOpen }: { onOpen: () => void }) {
  const { activeOrg, mode } = useApp();
  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-sand-200 bg-sand-50/95 px-4 py-3 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="rounded-lg border border-sand-300 bg-white p-2 text-ink-700"
        aria-label="Ouvrir le menu"
      >
        <Menu className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-brand-700 text-xs font-bold text-white">
          S
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">Sama Facture</p>
          <p className="truncate text-[11px] leading-tight text-ink-500">
            {activeOrg?.organization.name}
            {mode === 'demo' && ' · démo'}
          </p>
        </div>
      </div>
      <BadgeCheck className="size-5 text-brand-600" aria-hidden />
    </header>
  );
}

const MOBILE_TABS = [
  { to: '/', label: 'Accueil', icon: <LayoutDashboard className="size-5" />, end: true },
  { to: '/factures', label: 'Factures', icon: <FileText className="size-5" /> },
  { to: '/finances', label: 'Finances', icon: <Wallet className="size-5" />, end: true },
  { to: '/finances/achats', label: 'Achats', icon: <ShoppingCart className="size-5" /> },
  { to: '/finances/depenses', label: 'Dépenses', icon: <Receipt className="size-5" /> },
];

function MobileTabBar() {
  return (
    <nav
      aria-label="Navigation rapide"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_TABS.map((tab) => (
          <li key={tab.to}>
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition',
                  isActive ? 'text-brand-700' : 'text-ink-500',
                )
              }
            >
              {tab.icon}
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Layout() {
  const { toasts, dismissToast, dataError, activeOrg } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-dvh bg-sand-50">
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 bg-gradient-to-b from-brand-800 via-brand-800 to-brand-900 lg:block">
        <SidebarContent />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-900/50"
            aria-label="Fermer le menu"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-gradient-to-b from-brand-800 via-brand-800 to-brand-900 shadow-pop">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-white/80 hover:bg-white/10"
              aria-label="Fermer le menu"
            >
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <MobileHeader onOpen={() => setDrawerOpen(true)} />
        <main id="contenu" className="mx-auto w-full max-w-[1440px] px-4 pb-24 pt-5 sm:px-6 sm:pt-7 lg:pb-10">
          {!activeOrg && !dataError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-accent-500/30 bg-accent-400/10 px-3 py-2 text-sm text-accent-600">
              <Building2 className="size-4" />
              Aucune organisation active. Créez-en une depuis le sélecteur.
            </div>
          )}
          <Outlet />
        </main>
      </div>

      <MobileTabBar />
      <ToastViewport toasts={toasts as Toast[]} onDismiss={dismissToast} />
    </div>
  );
}
