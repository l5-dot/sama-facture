/**
 * Contexte applicatif : session, organisation active, données métier,
 * permissions et notifications.
 *
 * Les écrans ne parlent jamais à Supabase directement ; ils utilisent `repo`
 * exposé ici (dépôt Supabase ou démo selon la configuration).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getRepository, repositoryMode } from '../lib/data';
import type {
  OrgAccess,
  RepositoryError,
  SamaRepository,
  SessionUser,
} from '../lib/data/types';
import type {
  Client,
  Expense,
  Invoice,
  OrgRole,
  Payment,
  Product,
  Purchase,
} from '../lib/types';

const ACTIVE_ORG_KEY = 'sama-facture.active-organization';

export interface OrgData {
  clients: Client[];
  products: Product[];
  invoices: Invoice[];
  payments: Payment[];
  purchases: Purchase[];
  expenses: Expense[];
}

const EMPTY_DATA: OrgData = {
  clients: [],
  products: [],
  invoices: [],
  payments: [],
  purchases: [],
  expenses: [],
};

export type ToastKind = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface AppContextValue {
  repo: SamaRepository;
  mode: 'demo' | 'supabase';
  user: SessionUser | null;
  authLoading: boolean;
  orgs: OrgAccess[];
  activeOrg: OrgAccess | null;
  role: OrgRole | null;
  currency: string;
  data: OrgData;
  dataLoading: boolean;
  dataError: string | null;
  isRefreshing: boolean;
  refreshData: () => Promise<void>;
  refreshOrganizations: () => Promise<void>;
  switchOrganization: (organizationId: string) => void;
  createOrganization: (name: string, currency?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  setSimulatedRole: (role: OrgRole) => Promise<void>;
  resetDemo: () => Promise<void>;
  notify: (kind: ToastKind, message: string) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function messageFromError(error: unknown): string {
  const repoError = error as RepositoryError | null;
  if (repoError && typeof repoError.message === 'string' && repoError.message) {
    return repoError.message;
  }
  if (error instanceof Error) return error.message;
  return 'Une erreur inattendue est survenue.';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const repo = useMemo(() => getRepository(), []);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgAccess[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [data, setData] = useState<OrgData>(EMPTY_DATA);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const requestId = useRef(0);

  const notify = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, kind === 'error' ? 8000 : 4500);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const refreshOrganizations = useCallback(async () => {
    try {
      const list = await repo.listOrganizations();
      setOrgs(list);
      setActiveOrgId((current) => {
        if (current && list.some((access) => access.organization.id === current)) return current;
        const stored = typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_ORG_KEY) : null;
        if (stored && list.some((access) => access.organization.id === stored)) return stored;
        return list[0]?.organization.id ?? null;
      });
    } catch (error) {
      notify('error', messageFromError(error));
    }
  }, [repo, notify]);

  // Session initiale
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await repo.getSession();
        if (!cancelled) setUser(session);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  // Organisations dès qu'une session existe
  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setActiveOrgId(null);
      return;
    }
    void refreshOrganizations();
  }, [user, refreshOrganizations]);

  const activeOrg = useMemo(
    () => orgs.find((access) => access.organization.id === activeOrgId) ?? null,
    [orgs, activeOrgId],
  );

  const role = activeOrg?.role ?? null;
  const currency = activeOrg?.organization.currency ?? 'XOF';

  const switchOrganization = useCallback((organizationId: string) => {
    setActiveOrgId(organizationId);
    try {
      window.localStorage.setItem(ACTIVE_ORG_KEY, organizationId);
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const refreshData = useCallback(async () => {
    if (!activeOrg) {
      setData(EMPTY_DATA);
      return;
    }
    const organizationId = activeOrg.organization.id;
    const currentRequest = ++requestId.current;
    setDataLoading(true);
    setDataError(null);
    try {
      const [clients, products, invoices, payments, purchases, expenses] = await Promise.all([
        repo.listClients(organizationId),
        repo.listProducts(organizationId),
        repo.listInvoices(organizationId),
        repo.listPayments(organizationId),
        repo.listPurchases(organizationId),
        repo.listExpenses(organizationId),
      ]);
      if (currentRequest !== requestId.current) return;
      setData({ clients, products, invoices, payments, purchases, expenses });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setDataError(messageFromError(error));
    } finally {
      if (currentRequest === requestId.current) setDataLoading(false);
    }
  }, [activeOrg, repo]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshData]);

  const createOrganization = useCallback(
    async (name: string, nextCurrency = 'XOF') => {
      try {
        const access = await repo.createOrganization(name, nextCurrency);
        await refreshOrganizations();
        switchOrganization(access.organization.id);
        notify('success', `Organisation « ${access.organization.name} » créée.`);
      } catch (error) {
        notify('error', messageFromError(error));
        throw error;
      }
    },
    [repo, refreshOrganizations, switchOrganization, notify],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      await repo.signIn(email, password);
      const session = await repo.getSession();
      setUser(session);
      await refreshOrganizations();
    },
    [repo, refreshOrganizations],
  );

  const signUp = useCallback(
    async (email: string, password: string, fullName: string) => {
      await repo.signUp(email, password, fullName);
      const session = await repo.getSession();
      setUser(session);
      await refreshOrganizations();
    },
    [repo, refreshOrganizations],
  );

  const signOut = useCallback(async () => {
    await repo.signOut();
    setUser(null);
    setOrgs([]);
    setActiveOrgId(null);
    setData(EMPTY_DATA);
  }, [repo]);

  const setSimulatedRole = useCallback(
    async (nextRole: OrgRole) => {
      if (!activeOrg || !repo.setSimulatedRole) return;
      await repo.setSimulatedRole(activeOrg.organization.id, nextRole);
      await refreshOrganizations();
      notify('info', `Rôle simulé : ${nextRole}. Les permissions sont appliquées comme en production.`);
    },
    [activeOrg, repo, refreshOrganizations, notify],
  );

  const resetDemo = useCallback(async () => {
    if (!repo.resetDemoData) return;
    await repo.resetDemoData();
    await refreshOrganizations();
    await refreshData();
    notify('success', 'Données de démonstration réinitialisées.');
  }, [repo, refreshOrganizations, refreshData, notify]);

  const value: AppContextValue = {
    repo,
    mode: repositoryMode,
    user,
    authLoading,
    orgs,
    activeOrg,
    role,
    currency,
    data,
    dataLoading,
    dataError,
    isRefreshing,
    refreshData: refresh,
    refreshOrganizations,
    switchOrganization,
    createOrganization,
    signIn,
    signUp,
    signOut,
    setSimulatedRole,
    resetDemo,
    notify,
    toasts,
    dismissToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp doit être utilisé dans <AppProvider>.');
  return context;
}

export { messageFromError };
