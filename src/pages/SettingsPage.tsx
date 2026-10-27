import { useEffect, useState } from 'react';
import { Building2, Info, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { ROLE_LABELS } from '../lib/constants';
import {
  canDeleteFinance,
  canDeleteInvoice,
  canManageInvoices,
  canManageOrganization,
  canRecordPayment,
  canWriteFinances,
} from '../lib/permissions';
import type { Member, OrgRole } from '../lib/types';
import { Badge, Button, Card, CardHeader, InlineAlert, SectionHeading, Select } from '../components/ui';

const ROLES: OrgRole[] = ['owner', 'admin', 'comptable', 'vendeur'];

const PERMISSIONS: Array<{ label: string; check: (role: OrgRole) => boolean }> = [
  { label: 'Gérer l’organisation et les membres', check: canManageOrganization },
  { label: 'Créer / modifier des factures et clients', check: canManageInvoices },
  { label: 'Enregistrer achats, dépenses et encaissements', check: canWriteFinances },
  { label: 'Encaisser une facture', check: canRecordPayment },
  { label: 'Supprimer une pièce financière', check: canDeleteFinance },
  { label: 'Supprimer une facture brouillon', check: (role) => canDeleteInvoice(role, 'draft') },
];

export default function SettingsPage() {
  useDocumentTitle('Paramètres');
  const {
    activeOrg,
    role,
    mode,
    repo,
    currency,
    user,
    signOut,
    setSimulatedRole,
    resetDemo,
    notify,
  } = useApp();
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!activeOrg) return;
    let cancelled = false;
    setLoadingMembers(true);
    repo
      .listMembers(activeOrg.organization.id)
      .then((list) => {
        if (!cancelled) setMembers(list);
      })
      .catch((error) => {
        if (!cancelled) notify('error', messageFromError(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingMembers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [repo, activeOrg, notify]);

  const org = activeOrg?.organization;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Organisation"
        title="Paramètres"
        description="Informations de l’espace, membres, permissions et sécurité des données financières."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Building2 className="size-4" />} title="Organisation" subtitle="Espace isolé multi-tenant" />
          <dl className="divide-y divide-sand-100 px-4 text-sm sm:px-5">
            {[
              ['Nom', org?.name ?? '—'],
              ['Devise', currency === 'XOF' ? 'FCFA (XOF)' : `${currency}`],
              ['Pays', org?.country ?? '—'],
              ['NINEA', org?.ninea ?? 'Non renseigné'],
              ['Téléphone', org?.phone ?? '—'],
              ['E-mail', org?.email ?? '—'],
              ['Adresse', org?.address ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-4 py-2.5">
                <dt className="text-ink-500">{label}</dt>
                <dd className="max-w-[60%] text-right font-medium text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-sand-200 bg-sand-50 px-4 py-2.5 text-[11px] text-ink-500 sm:px-5">
            La devise détermine le format d’affichage. Le franc CFA est affiché sans décimale.
          </p>
        </Card>

        <Card>
          <CardHeader
            icon={<Users className="size-4" />}
            title="Membres et rôles"
            subtitle={loadingMembers ? 'Chargement…' : `${members.length} membre(s)`}
          />
          <ul className="divide-y divide-sand-100">
            {members.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {(member.fullName ?? member.email ?? 'U')
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.fullName ?? member.email ?? 'Membre'}
                      {member.userId === user?.id && <span className="ml-1 text-[11px] text-brand-700">(vous)</span>}
                    </p>
                    <p className="truncate text-[11px] text-ink-500">{member.email ?? '—'}</p>
                  </div>
                </div>
                <Badge tone={member.role === 'owner' ? 'brand' : 'neutral'}>{ROLE_LABELS[member.role]}</Badge>
              </li>
            ))}
          </ul>
          <p className="border-t border-sand-200 bg-sand-50 px-4 py-2.5 text-[11px] text-ink-500 sm:px-5">
            L’ajout de membres se fait via Supabase Auth et la table
            <code className="mx-1 rounded bg-white px-1 py-0.5 text-[10px]">organization_members</code>.
            Une organisation conserve toujours au moins un propriétaire.
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          icon={<ShieldCheck className="size-4" />}
          title="Matrice des permissions"
          subtitle="Appliquée par les policies RLS en production, reproduite en mode démo."
          action={<Badge tone={role ? 'brand' : 'danger'}>{role ? ROLE_LABELS[role] : 'Sans rôle'}</Badge>}
        />
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <caption className="sr-only">Permissions par rôle</caption>
            <thead>
              <tr className="border-b border-sand-200 bg-sand-50 text-left text-[11px] uppercase tracking-wide text-ink-500">
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Action</th>
                {ROLES.map((roleKey) => (
                  <th key={roleKey} scope="col" className="px-4 py-2.5 text-center font-medium">
                    {ROLE_LABELS[roleKey]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSIONS.map((permission) => (
                <tr key={permission.label} className="border-b border-sand-100 last:border-0">
                  <td className="px-4 py-2.5 text-ink-700 sm:px-5">{permission.label}</td>
                  {ROLES.map((roleKey) => (
                    <td key={roleKey} className="px-4 py-2.5 text-center">
                      {permission.check(roleKey) ? (
                        <span className="text-brand-600" aria-label="Autorisé">✓</span>
                      ) : (
                        <span className="text-ink-300" aria-label="Interdit">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<Info className="size-4" />} title="Mode de fonctionnement" subtitle="Démo locale ou Supabase" />
          <div className="space-y-3 p-4 text-sm text-ink-700">
            {mode === 'demo' ? (
              <>
                <InlineAlert tone="info" title="Mode démonstration">
                  Les données sont stockées dans ce navigateur. Aucune clé, aucun backend. Pour
                  activer Supabase, renseignez <code>VITE_SUPABASE_URL</code> et{' '}
                  <code>VITE_SUPABASE_ANON_KEY</code> (clé publique uniquement), puis appliquez les
                  migrations.
                </InlineAlert>
                <div>
                  <label className="label" htmlFor="simulated-role">
                    Rôle simulé pour tester les permissions
                  </label>
                  <Select
                    id="simulated-role"
                    value={role ?? 'owner'}
                    onChange={(event) => void setSimulatedRole(event.target.value as OrgRole)}
                  >
                    {ROLES.map((roleKey) => (
                      <option key={roleKey} value={roleKey}>
                        {ROLE_LABELS[roleKey]}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-[11px] text-ink-500">
                    En production, le rôle vient de <code>organization_members</code> et ne peut pas
                    être choisi par l’utilisateur.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  icon={<RefreshCw className="size-4" />}
                  loading={resetting}
                  onClick={async () => {
                    setResetting(true);
                    try {
                      await resetDemo();
                    } finally {
                      setResetting(false);
                    }
                  }}
                >
                  Réinitialiser le jeu de démonstration
                </Button>
              </>
            ) : (
              <InlineAlert tone="success" title="Connecté à Supabase">
                Les données font autorité en base. Les totaux de facture, statuts de paiement et
                agrégats financiers sont recalculés par PostgreSQL ; les policies RLS isolent chaque
                organisation.
              </InlineAlert>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader icon={<ShieldCheck className="size-4" />} title="Sécurité financière" />
          <ul className="space-y-2.5 p-4 text-sm text-ink-700">
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
              Chaque table métier porte <code>organization_id</code> et une policy RLS
              <code>is_org_member</code>.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
              Les montants sont en <code>numeric(14,2)</code> ; le total d’un achat est une colonne
              générée (quantité × prix), jamais un champ libre.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
              Les totaux de facture, le statut payé et les restes à payer sont calculés par triggers
              SQL. Le frontend n’écrit pas ces colonnes.
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" />
              Seule la clé publique Supabase est utilisée côté navigateur ; aucune clé
              <code>service_role</code>.
            </li>
            <li className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
              Ce logiciel est un outil de gestion : les estimations ne remplacent pas une
              comptabilité certifiée.
            </li>
          </ul>
        </Card>
      </div>

      {mode === 'supabase' && (
        <div>
          <Button variant="secondary" onClick={() => void signOut()}>
            Se déconnecter
          </Button>
        </div>
      )}
    </div>
  );
}
