import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { Layout } from './components/Layout';
import { Skeleton } from './components/ui';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const ClientsPage = lazy(() => import('./pages/ClientsPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const FinancesPage = lazy(() => import('./pages/FinancesPage'));
const PurchasesPage = lazy(() => import('./pages/PurchasesPage'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-sand-50 px-6">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="mx-auto h-10 w-10 rounded-xl" />
        <Skeleton className="h-4 w-2/3 mx-auto" />
        <Skeleton className="h-4 w-1/2 mx-auto" />
        <span className="sr-only">Chargement de Sama Facture…</span>
      </div>
    </div>
  );
}

function RequireAuth() {
  const { authLoading, user, mode } = useApp();
  if (authLoading) return <FullPageLoader />;
  if (mode === 'supabase' && !user) return <Navigate to="/connexion" replace />;
  return <Layout />;
}

function PageFallback() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-full max-w-lg" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route index element={<DashboardPage />} />
          <Route path="factures" element={<InvoicesPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="produits" element={<ProductsPage />} />
          <Route path="finances" element={<FinancesPage />} />
          <Route path="finances/achats" element={<PurchasesPage />} />
          <Route path="finances/depenses" element={<ExpensesPage />} />
          <Route path="rapports" element={<ReportsPage />} />
          <Route path="parametres" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

/** Routes seules, sans routeur : utilisées par les tests (MemoryRouter). */
export function AppContent() {
  return <AppRoutes />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <AppRoutes />
      </AppProvider>
    </BrowserRouter>
  );
}
