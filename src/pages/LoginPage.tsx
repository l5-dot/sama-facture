import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Lock, Mail, Warehouse } from 'lucide-react';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { Button, Field, Input, InlineAlert, SectionHeading } from '../components/ui';

export default function LoginPage() {
  useDocumentTitle('Connexion');
  const { mode, user, authLoading, signIn, signUp } = useApp();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && mode === 'supabase') navigate('/', { replace: true });
  }, [user, mode, navigate]);

  if (mode === 'demo') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-sand-50 px-4 py-10">
        <div className="card w-full max-w-md p-6">
          <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-700 text-lg font-bold text-white">
            S
          </div>
          <SectionHeading
            eyebrow="Mode démonstration"
            title="Sama Facture"
            description="Aucun Supabase configuré : l’application fonctionne avec un jeu de données local, idéal pour explorer le module Finances."
          />
          <div className="mt-4 space-y-3">
            <InlineAlert tone="info" title="Pourquoi ce mode ?">
              Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> puis
              appliquez les migrations pour basculer sur vos données réelles.
            </InlineAlert>
            <Button className="w-full" onClick={() => navigate('/')} icon={<ArrowRight className="size-4" />}>
              Ouvrir la démonstration
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-ink-500">
        Vérification de la session…
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      setError('Renseignez un e-mail valide et un mot de passe d’au moins 6 caractères.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (tab === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, fullName.trim() || email.split('@')[0]);
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh bg-sand-50 lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-to-br from-brand-700 to-brand-900 p-10 text-white lg:flex">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-500 font-bold">S</span>
            <div>
              <p className="font-display text-lg font-semibold">Sama Facture</p>
              <p className="text-[10px] uppercase tracking-[0.18em] text-brand-100/60">Gestion & finances</p>
            </div>
          </div>
          <h1 className="mt-14 max-w-md font-display text-3xl font-semibold leading-tight">
            Facturez, encaissez et pilotez votre activité en toute clarté.
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-brand-50/80">
            Chiffre d’affaires, encaissements, achats, dépenses et bénéfice estimé — les bons
            chiffres, au bon moment, avec une isolation stricte de vos données.
          </p>
        </div>
        <div className="space-y-2 text-sm text-brand-50/80">
          <p className="flex items-center gap-2"><Lock className="size-4" /> RLS multi-tenant Supabase</p>
          <p className="flex items-center gap-2"><Warehouse className="size-4" /> Pensé pour les PME sénégalaises — FCFA</p>
        </div>
      </div>

      <div className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <SectionHeading
            eyebrow="Connexion"
            title={tab === 'signin' ? 'Content de vous revoir' : 'Créer votre espace'}
            description="Sama Facture utilise Supabase Auth. Aucune clé secrète n’est exposée au navigateur."
          />
          <div className="mt-5 inline-flex rounded-xl border border-sand-300 bg-white p-0.5">
            {(['signin', 'signup'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  setError(null);
                }}
                aria-pressed={tab === value}
                className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition ${
                  tab === value ? 'bg-brand-600 text-white' : 'text-ink-700 hover:bg-sand-100'
                }`}
              >
                {value === 'signin' ? 'Se connecter' : 'Créer un compte'}
              </button>
            ))}
          </div>

          <form
            className="mt-4 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {error && <InlineAlert tone="danger">{error}</InlineAlert>}
            {tab === 'signup' && (
              <Field label="Nom complet" htmlFor="login-name">
                <Input
                  id="login-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="E-mail" htmlFor="login-email" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </Field>
            <Field
              label="Mot de passe"
              htmlFor="login-password"
              required
              hint={tab === 'signup' ? '6 caractères minimum.' : undefined}
            >
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
                <Input
                  id="login-password"
                  type="password"
                  autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </Field>
            <Button type="submit" className="w-full" loading={loading}>
              {tab === 'signin' ? 'Se connecter' : 'Créer mon espace'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
