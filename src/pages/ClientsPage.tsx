import { useMemo, useState } from 'react';
import { Mail, Pencil, Phone, Plus, Search, UserPlus, Users } from 'lucide-react';
import { useApp, messageFromError } from '../context/AppContext';
import { useDocumentTitle } from '../lib/hooks';
import { formatMoney } from '../lib/money';
import { isConfirmedInvoice } from '../lib/finance';
import { canManageInvoices } from '../lib/permissions';
import type { Client } from '../lib/types';
import type { ClientInput } from '../lib/data/types';
import { Button, Card, EmptyState, Field, Input, Modal, SectionHeading, Textarea } from '../components/ui';

function ClientFormModal({
  open,
  client,
  onClose,
  onSubmit,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSubmit: (input: ClientInput) => Promise<void>;
}) {
  const [name, setName] = useState(client?.name ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [address, setAddress] = useState(client?.address ?? '');
  const [ninea, setNinea] = useState(client?.ninea ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (name.trim().length < 1) {
      setError('Le nom du client est obligatoire.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        id: client?.id,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        ninea: ninea.trim() || null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={client ? 'Modifier le client' : 'Nouveau client'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} loading={submitting}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-600">
            {error}
          </p>
        )}
        <Field label="Nom" htmlFor="client-name" required>
          <Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Téléphone" htmlFor="client-phone">
            <Input
              id="client-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+221 77 000 00 00"
              maxLength={40}
            />
          </Field>
          <Field label="E-mail" htmlFor="client-email">
            <Input
              id="client-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={160}
            />
          </Field>
          <Field label="Adresse" htmlFor="client-address">
            <Input id="client-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={200} />
          </Field>
          <Field label="NINEA" htmlFor="client-ninea" hint="Facultatif — obligatoire pour les factures B2B.">
            <Input id="client-ninea" value={ninea} onChange={(event) => setNinea(event.target.value)} maxLength={40} />
          </Field>
        </div>
        <Field label="Notes" htmlFor="client-notes">
          <Textarea id="client-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} />
        </Field>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function ClientsPage() {
  useDocumentTitle('Clients');
  const { data, dataLoading, activeOrg, currency, role, repo, refreshData, notify } = useApp();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [formKey, setFormKey] = useState(0);

  const canWrite = canManageInvoices(role);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.clients
      .filter((client) =>
        !needle
          ? true
          : [client.name, client.email, client.phone, client.address]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(needle),
      )
      .map((client) => {
        const invoices = data.invoices.filter(
          (invoice) => invoice.clientId === client.id && isConfirmedInvoice(invoice),
        );
        const outstanding = invoices
          .filter((invoice) => invoice.kind === 'invoice')
          .reduce((acc, invoice) => acc + invoice.amountDue, 0);
        return { client, invoiceCount: invoices.length, outstanding };
      });
  }, [data.clients, data.invoices, search]);

  const openCreate = () => {
    setEditing(null);
    setFormKey((value) => value + 1);
    setFormOpen(true);
  };

  const openEdit = (client: Client) => {
    setEditing(client);
    setFormKey((value) => value + 1);
    setFormOpen(true);
  };

  const submit = async (input: ClientInput) => {
    if (!activeOrg) throw new Error('Aucune organisation active.');
    await repo.saveClient(activeOrg.organization.id, input);
    notify('success', input.id ? 'Client mis à jour.' : 'Client créé.');
    await refreshData();
  };

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Ventes"
        title="Clients"
        description="Votre base clients, avec le nombre de factures confirmées et le reste à recevoir par client."
        action={
          <Button onClick={openCreate} icon={<UserPlus className="size-4" />} disabled={!canWrite}>
            Nouveau client
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un client…"
          aria-label="Rechercher un client"
          className="field pl-9"
        />
      </div>

      {dataLoading && data.clients.length === 0 ? (
        <Card className="p-6 text-sm text-ink-500">Chargement des clients…</Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-5" />}
            title={data.clients.length === 0 ? 'Aucun client' : 'Aucun résultat'}
            description={
              data.clients.length === 0
                ? 'Ajoutez un client pour le retrouver dans vos factures.'
                : 'Modifiez votre recherche.'
            }
            action={
              canWrite && data.clients.length === 0 ? (
                <Button size="sm" onClick={openCreate} icon={<Plus className="size-4" />}>
                  Ajouter un client
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ client, invoiceCount, outstanding }) => (
            <Card key={client.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {client.name
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((part) => part[0])
                    .join('')
                    .toUpperCase()}
                </div>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => openEdit(client)}
                    className="rounded-lg p-1.5 text-ink-500 hover:bg-sand-100 hover:text-ink-900"
                    aria-label={`Modifier ${client.name}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-ink-900">{client.name}</p>
              <div className="mt-1 space-y-0.5 text-xs text-ink-500">
                {client.phone && (
                  <p className="flex items-center gap-1.5">
                    <Phone className="size-3.5" /> {client.phone}
                  </p>
                )}
                {client.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail className="size-3.5" /> <span className="truncate">{client.email}</span>
                  </p>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-sand-200 pt-2 text-xs">
                <span className="text-ink-500">{invoiceCount} facture(s) confirmée(s)</span>
                <span className={outstanding > 0 ? 'money font-medium text-accent-600' : 'money text-ink-500'}>
                  {formatMoney(outstanding, currency)}
                </span>
              </div>
              {outstanding > 0 && <p className="mt-0.5 text-right text-[10px] text-ink-500">reste à recevoir</p>}
            </Card>
          ))}
        </div>
      )}

      <ClientFormModal
        key={`${editing?.id ?? 'new'}-${formKey}`}
        open={formOpen}
        client={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={submit}
      />
    </div>
  );
}
