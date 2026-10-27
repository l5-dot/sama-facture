-- =============================================================================
-- Sama Facture — 001 · Schéma initial (organisations, clients, produits,
-- factures, lignes de facture, paiements) + RLS multi-tenant.
--
-- Hypothèses Supabase :
--   * les rôles anon / authenticated / service_role existent déjà ;
--   * auth.uid() renvoie l'utilisateur connecté.
-- Toutes les tables métier portent organization_id et sont protégées par RLS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type public.org_role as enum ('owner', 'admin', 'comptable', 'vendeur');
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_status') then
    create type public.invoice_status as enum ('draft', 'sent', 'partial', 'paid', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'invoice_kind') then
    create type public.invoice_kind as enum ('invoice', 'credit_note');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('especes', 'wave', 'orange_money', 'virement', 'cheque', 'carte', 'autre');
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table if not exists public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 2 and 160),
  currency      char(3) not null default 'XOF' check (currency in ('XOF', 'EUR', 'USD', 'XAF', 'GHS', 'NGN')),
  country       text not null default 'SN',
  ninea         text,
  email         text check (email is null or position('@' in email) > 1),
  phone         text,
  address       text,
  logo_url      text,
  created_by    uuid not null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.organization_members (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null,
  role             public.org_role not null default 'vendeur',
  full_name        text,
  email            text,
  created_at       timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 160),
  email            text,
  phone            text,
  address          text,
  ninea            text,
  notes            text,
  archived         boolean not null default false,
  created_by       uuid not null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists clients_org_idx on public.clients (organization_id, archived);

create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 160),
  description      text,
  sku              text,
  unit             text not null default 'unité',
  unit_price       numeric(14, 2) not null default 0 check (unit_price >= 0),
  cost_price       numeric(14, 2) check (cost_price is null or cost_price >= 0),
  tax_rate         numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  track_stock      boolean not null default false,
  stock_quantity   numeric(14, 3) not null default 0,
  archived         boolean not null default false,
  created_by       uuid not null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists products_org_idx on public.products (organization_id, archived);

create table if not exists public.invoices (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  client_id        uuid references public.clients(id) on delete restrict,
  number           text not null,
  kind             public.invoice_kind not null default 'invoice',
  status           public.invoice_status not null default 'draft',
  issue_date       date not null default current_date,
  due_date         date,
  currency         char(3),
  notes            text,
  discount_type    text not null default 'none' check (discount_type in ('none', 'percent', 'fixed')),
  discount_value   numeric(14, 2) not null default 0 check (discount_value >= 0),
  subtotal_ht      numeric(14, 2) not null default 0,
  discount_total   numeric(14, 2) not null default 0,
  net_ht           numeric(14, 2) not null default 0,
  tax_total        numeric(14, 2) not null default 0,
  total_ttc        numeric(14, 2) not null default 0,
  amount_paid      numeric(14, 2) not null default 0,
  amount_due       numeric(14, 2) generated always as (greatest(total_ttc - amount_paid, 0)) stored,
  cancelled_at     timestamptz,
  created_by       uuid not null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, number)
);
create index if not exists invoices_org_date_idx on public.invoices (organization_id, issue_date desc);
create index if not exists invoices_client_idx on public.invoices (client_id);
create index if not exists invoices_status_idx on public.invoices (organization_id, status);

create table if not exists public.invoice_items (
  id               uuid primary key default gen_random_uuid(),
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  product_id       uuid references public.products(id) on delete set null,
  position         integer not null default 1,
  description      text not null check (length(trim(description)) > 0),
  quantity         numeric(14, 3) not null check (quantity > 0),
  unit_price       numeric(14, 2) not null check (unit_price >= 0),
  discount_percent numeric(5, 2) not null default 0 check (discount_percent between 0 and 100),
  tax_rate         numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  line_gross       numeric(14, 2) not null default 0,
  line_subtotal_ht numeric(14, 2) not null default 0,
  line_tax         numeric(14, 2) not null default 0,
  line_total_ttc   numeric(14, 2) not null default 0,
  created_at       timestamptz not null default now()
);
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id, position);
create index if not exists invoice_items_org_idx on public.invoice_items (organization_id);

create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  invoice_id       uuid not null references public.invoices(id) on delete cascade,
  amount           numeric(14, 2) not null check (amount > 0),
  method           public.payment_method not null default 'especes',
  paid_at          date not null default current_date,
  reference        text,
  notes            text,
  created_by       uuid not null default auth.uid(),
  created_at       timestamptz not null default now()
);
create index if not exists payments_org_date_idx on public.payments (organization_id, paid_at desc);
create index if not exists payments_invoice_idx on public.payments (invoice_id);

create table if not exists public.document_counters (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind            public.invoice_kind not null,
  last_value      integer not null default 0,
  primary key (organization_id, kind)
);

-- -----------------------------------------------------------------------------
-- Helpers RLS (SECURITY DEFINER pour éviter la récursion de policies)
-- -----------------------------------------------------------------------------
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(p_org uuid, p_roles public.org_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.role = any (p_roles)
  );
$$;

create or replace function public.org_role_of(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.organization_members m
  where m.organization_id = p_org
    and m.user_id = auth.uid()
  limit 1;
$$;

-- Rôles autorisés à saisir des opérations financières (achats / dépenses /
-- encaissements). Les vendeurs peuvent facturer mais pas manipuler la caisse.
create or replace function public.can_write_finances(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_org_role(p_org, array['owner', 'admin', 'comptable']::public.org_role[]);
$$;

create or replace function public.can_manage_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_org_role(p_org, array['owner', 'admin']::public.org_role[]);
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.has_org_role(uuid, public.org_role[]) from public, anon;
revoke all on function public.org_role_of(uuid) from public, anon;
revoke all on function public.can_write_finances(uuid) from public, anon;
revoke all on function public.can_manage_org(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated;
grant execute on function public.org_role_of(uuid) to authenticated;
grant execute on function public.can_write_finances(uuid) to authenticated;
grant execute on function public.can_manage_org(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers utilitaires
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists organizations_touch on public.organizations;
create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();
drop trigger if exists clients_touch on public.clients;
create trigger clients_touch before update on public.clients
  for each row execute function public.touch_updated_at();
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices
  for each row execute function public.touch_updated_at();

-- Numérotation atomique par organisation : FACT-0001, AV-0001…
create or replace function public.next_document_number(p_org uuid, p_kind public.invoice_kind)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  insert into public.document_counters (organization_id, kind, last_value)
  values (p_org, p_kind, 1)
  on conflict (organization_id, kind)
    do update set last_value = public.document_counters.last_value + 1
  returning last_value into v_next;

  return case p_kind
    when 'invoice' then 'FACT-' || lpad(v_next::text, 4, '0')
    else 'AV-' || lpad(v_next::text, 4, '0')
  end;
end;
$$;

revoke all on function public.next_document_number(uuid, public.invoice_kind) from public, anon, authenticated;

-- Création d'organisation : l'utilisateur devient automatiquement propriétaire.
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.organization_members (organization_id, user_id, role, email)
  values (new.id, auth.uid(), 'owner',
          (select u.email::text from auth.users u where u.id = auth.uid()))
  on conflict (organization_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists organizations_add_owner on public.organizations;
create trigger organizations_add_owner after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- Protection du dernier propriétaire (mise à jour ou suppression de membre).
create or replace function public.protect_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := coalesce(old.organization_id, new.organization_id);
  v_remaining integer;
begin
  if (tg_op = 'DELETE' and old.role = 'owner')
     or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    select count(*) into v_remaining
    from public.organization_members
    where organization_id = v_org
      and role = 'owner'
      and id <> old.id;

    if v_remaining = 0 then
      raise exception 'Une organisation doit conserver au moins un propriétaire.'
        using errcode = 'check_violation';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists organization_members_last_owner on public.organization_members;
create trigger organization_members_last_owner
  before update or delete on public.organization_members
  for each row execute function public.protect_last_owner();

-- -----------------------------------------------------------------------------
-- Factures : calculs serveur, numérotation, transitions de statut
-- -----------------------------------------------------------------------------
-- Recalcule les totaux d'une facture à partir de ses lignes, puis resynchronise
-- le montant payé et le statut. SECURITY DEFINER : l'utilisateur n'a pas besoin
-- de privilèges sur les colonnes calculées.
create or replace function public.recalculate_invoice(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invoices;
  v_subtotal numeric(14, 2) := 0;
  v_discount numeric(14, 2) := 0;
  v_tax numeric(14, 2) := 0;
  v_paid numeric(14, 2) := 0;
  v_new_status public.invoice_status;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    return;
  end if;

  select coalesce(sum(line_subtotal_ht), 0)
    into v_subtotal
  from public.invoice_items
  where invoice_id = p_invoice_id;

  v_subtotal := round(v_subtotal, 2);

  v_discount := case
    when v_inv.discount_type = 'percent' then round(v_subtotal * least(v_inv.discount_value, 100) / 100, 2)
    when v_inv.discount_type = 'fixed' then least(round(v_inv.discount_value, 2), v_subtotal)
    else 0
  end;

  -- Remise de facture répartie au prorata des lignes : la TVA est calculée sur
  -- le net réellement facturé, ce qui évite de surfacturer la taxe.
  select coalesce(sum(
           round(
             (line_subtotal_ht - case when v_subtotal > 0 then v_discount * line_subtotal_ht / v_subtotal else 0 end)
             * tax_rate / 100, 2)
         ), 0)
    into v_tax
  from public.invoice_items
  where invoice_id = p_invoice_id;
  v_tax := round(v_tax, 2);

  select coalesce(sum(amount), 0) into v_paid
  from public.payments
  where invoice_id = p_invoice_id;
  v_paid := round(v_paid, 2);

  if v_paid > round(v_subtotal - v_discount + v_tax, 2) + 0.005 then
    raise exception 'Le montant payé dépasse le total de la facture.'
      using errcode = 'check_violation';
  end if;

  v_new_status := case
    when v_inv.status = 'cancelled' then 'cancelled'::public.invoice_status
    when v_inv.status = 'draft' then 'draft'::public.invoice_status
    when v_paid > 0 and v_paid >= round(v_subtotal - v_discount + v_tax, 2) - 0.005 then 'paid'::public.invoice_status
    when v_paid > 0 then 'partial'::public.invoice_status
    else 'sent'::public.invoice_status
  end;

  perform set_config('sama.invoice_sync', 'on', true);
  update public.invoices
     set subtotal_ht = v_subtotal,
         discount_total = v_discount,
         net_ht = round(v_subtotal - v_discount, 2),
         tax_total = v_tax,
         total_ttc = round(v_subtotal - v_discount + v_tax, 2),
         amount_paid = v_paid,
         status = v_new_status
   where id = p_invoice_id;
  perform set_config('sama.invoice_sync', 'off', true);
end;
$$;

revoke all on function public.recalculate_invoice(uuid) from public, anon, authenticated;

-- Avant insertion : numérotation, valeurs calculées neutralisées.
create or replace function public.invoices_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.number is null or length(trim(new.number)) = 0 then
    new.number := public.next_document_number(new.organization_id, new.kind);
  end if;

  if new.currency is null then
    select currency into new.currency from public.organizations where id = new.organization_id;
  end if;

  if new.status not in ('draft', 'sent') then
    new.status := 'draft';
  end if;

  -- Les totaux sont toujours recalculés côté base : on ignore ce que le
  -- navigateur prétend envoyer.
  new.subtotal_ht := 0;
  new.discount_total := 0;
  new.net_ht := 0;
  new.tax_total := 0;
  new.total_ttc := 0;
  new.amount_paid := 0;
  new.cancelled_at := null;
  return new;
end;
$$;

drop trigger if exists invoices_before_insert on public.invoices;
create trigger invoices_before_insert before insert on public.invoices
  for each row execute function public.invoices_before_insert();

-- Avant mise à jour : protège les colonnes calculées et les transitions.
create or replace function public.invoices_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('sama.invoice_sync', true) = 'on' then
    return new;
  end if;

  -- Les colonnes dérivées ne sont jamais modifiables directement.
  new.subtotal_ht := old.subtotal_ht;
  new.discount_total := old.discount_total;
  new.net_ht := old.net_ht;
  new.tax_total := old.tax_total;
  new.total_ttc := old.total_ttc;
  new.amount_paid := old.amount_paid;
  new.kind := old.kind;
  new.organization_id := old.organization_id;
  new.number := old.number;
  new.currency := old.currency;

  if new.status is distinct from old.status then
    if old.status = 'cancelled' then
      raise exception 'Une facture annulée ne peut plus changer de statut.'
        using errcode = 'check_violation';
    end if;
    if new.status in ('paid', 'partial') then
      raise exception 'Les statuts « payée » et « partielle » sont calculés à partir des paiements.'
        using errcode = 'check_violation';
    end if;
    if new.status = 'cancelled' then
      if old.amount_paid > 0 then
        raise exception 'Impossible d''annuler une facture déjà encaissée : émettez un avoir.'
          using errcode = 'check_violation';
      end if;
      new.cancelled_at := now();
    end if;
  else
    new.cancelled_at := old.cancelled_at;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_before_update on public.invoices;
create trigger invoices_before_update before update on public.invoices
  for each row execute function public.invoices_before_update();

-- Après changement de remise : recalcul.
create or replace function public.invoices_after_discount_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_invoice(new.id);
  return null;
end;
$$;

drop trigger if exists invoices_discount_changed on public.invoices;
create trigger invoices_discount_changed
  after update of discount_type, discount_value on public.invoices
  for each row execute function public.invoices_after_discount_change();

-- Lignes : calcul des montants et rattachement à la bonne organisation.
create or replace function public.invoice_items_calculate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid;
  v_status public.invoice_status;
begin
  select i.organization_id, i.status into v_org, v_status
  from public.invoices i
  where i.id = new.invoice_id;

  if v_org is null then
    raise exception 'Facture introuvable.' using errcode = 'foreign_key_violation';
  end if;
  if v_org <> new.organization_id then
    raise exception 'La ligne et la facture appartiennent à des organisations différentes.'
      using errcode = 'check_violation';
  end if;

  new.line_gross := round(new.quantity * new.unit_price, 2);
  new.line_subtotal_ht := round(new.line_gross * (1 - new.discount_percent / 100), 2);
  new.line_tax := 0; -- recalculé au niveau facture (remise globale proratisée)
  new.line_total_ttc := new.line_subtotal_ht;
  return new;
end;
$$;

drop trigger if exists invoice_items_calculate on public.invoice_items;
create trigger invoice_items_calculate before insert or update on public.invoice_items
  for each row execute function public.invoice_items_calculate();

-- Les lignes ne sont modifiables que sur un brouillon.
create or replace function public.invoice_items_guard()
returns trigger
language plpgsql
as $$
declare
  v_status public.invoice_status;
begin
  select status into v_status from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);

  -- Suppression en cascade de la facture : la ligne parente a déjà disparu,
  -- il n'y a plus de statut à protéger.
  if tg_op = 'DELETE' and v_status is null then
    return old;
  end if;

  if v_status is distinct from 'draft' then
    raise exception 'Une facture émise est immutable : créez un avoir pour corriger.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists invoice_items_guard on public.invoice_items;
create trigger invoice_items_guard before insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_guard();

create or replace function public.invoice_items_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

drop trigger if exists invoice_items_recalculate on public.invoice_items;
create trigger invoice_items_recalculate
  after insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_after_change();

-- Paiements : la facture doit exister, être émise, appartenir à la même org.
create or replace function public.payments_before_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invoice public.invoices;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select * into v_invoice from public.invoices where id = new.invoice_id;
  if not found then
    raise exception 'Facture introuvable.' using errcode = 'foreign_key_violation';
  end if;
  if v_invoice.organization_id <> new.organization_id then
    raise exception 'Le paiement et la facture appartiennent à des organisations différentes.'
      using errcode = 'check_violation';
  end if;
  if v_invoice.status = 'cancelled' then
    raise exception 'Impossible d''encaisser une facture annulée.' using errcode = 'check_violation';
  end if;
  if v_invoice.status = 'draft' then
    raise exception 'Émettez la facture avant d''enregistrer un paiement.' using errcode = 'check_violation';
  end if;
  if v_invoice.kind = 'credit_note' then
    raise exception 'Un avoir ne peut pas être encaissé.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_before_write on public.payments;
create trigger payments_before_write before insert or update on public.payments
  for each row execute function public.payments_before_write();

create or replace function public.payments_after_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalculate_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

drop trigger if exists payments_recalculate on public.payments;
create trigger payments_recalculate
  after insert or update or delete on public.payments
  for each row execute function public.payments_after_change();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.document_counters enable row level security;

-- Organisations
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  -- Le créateur voit son organisation immédiatement : indispensable pour
  -- `insert ... returning`, l'adhésion étant créée par trigger AFTER INSERT.
  using (public.is_org_member(id) or created_by = auth.uid());

drop policy if exists organizations_insert on public.organizations;
create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (auth.uid() is not null and created_by = auth.uid());

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.can_manage_org(id))
  with check (public.can_manage_org(id));

drop policy if exists organizations_delete on public.organizations;
create policy organizations_delete on public.organizations
  for delete to authenticated
  using (public.has_org_role(id, array['owner']::public.org_role[]));

-- Membres
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members
  for select to authenticated
  using (public.is_org_member(organization_id) or user_id = auth.uid());

drop policy if exists members_insert on public.organization_members;
create policy members_insert on public.organization_members
  for insert to authenticated
  with check (public.can_manage_org(organization_id));

drop policy if exists members_update on public.organization_members;
create policy members_update on public.organization_members
  for update to authenticated
  using (public.can_manage_org(organization_id))
  with check (public.can_manage_org(organization_id));

drop policy if exists members_delete on public.organization_members;
create policy members_delete on public.organization_members
  for delete to authenticated
  using (public.can_manage_org(organization_id));

-- Clients
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur', 'comptable']::public.org_role[]));

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur', 'comptable']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur', 'comptable']::public.org_role[]));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete to authenticated
  using (public.can_manage_org(organization_id));

-- Produits
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur', 'comptable']::public.org_role[]));

drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur', 'comptable']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur', 'comptable']::public.org_role[]));

drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to authenticated
  using (public.can_manage_org(organization_id));

-- Factures
drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur']::public.org_role[]));

drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin', 'vendeur']::public.org_role[]));

drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices
  for delete to authenticated
  using (public.can_manage_org(organization_id) and status = 'draft');

-- Lignes de facture
drop policy if exists invoice_items_select on public.invoice_items;
create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists invoice_items_insert on public.invoice_items;
create policy invoice_items_insert on public.invoice_items
  for insert to authenticated
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'vendeur']::public.org_role[])
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft' and i.organization_id = organization_id
    )
  );

drop policy if exists invoice_items_update on public.invoice_items;
create policy invoice_items_update on public.invoice_items
  for update to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'vendeur']::public.org_role[])
    and exists (select 1 from public.invoices i where i.id = invoice_id and i.status = 'draft')
  )
  with check (
    public.has_org_role(organization_id, array['owner', 'admin', 'vendeur']::public.org_role[])
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id and i.status = 'draft' and i.organization_id = organization_id
    )
  );

drop policy if exists invoice_items_delete on public.invoice_items;
create policy invoice_items_delete on public.invoice_items
  for delete to authenticated
  using (
    public.has_org_role(organization_id, array['owner', 'admin', 'vendeur']::public.org_role[])
    and exists (select 1 from public.invoices i where i.id = invoice_id and i.status = 'draft')
  );

-- Paiements
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments
  for insert to authenticated
  with check (public.can_write_finances(organization_id));

drop policy if exists payments_delete on public.payments;
create policy payments_delete on public.payments
  for delete to authenticated
  using (public.can_manage_org(organization_id));

-- Compteurs : jamais accessibles en direct.
drop policy if exists document_counters_no_access on public.document_counters;
create policy document_counters_no_access on public.document_counters
  for all to authenticated
  using (false)
  with check (false);

-- -----------------------------------------------------------------------------
-- Privilèges
-- -----------------------------------------------------------------------------
revoke all on public.organizations, public.organization_members, public.clients,
  public.products, public.invoices, public.invoice_items, public.payments,
  public.document_counters from anon;

grant select, insert on public.organizations to authenticated;
grant update (name, currency, country, ninea, email, phone, address, logo_url) on public.organizations to authenticated;
grant delete on public.organizations to authenticated;

grant select, insert, update, delete on public.organization_members to authenticated;

grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.products to authenticated;

grant select, insert, delete on public.invoices to authenticated;
-- Mise à jour limitée aux colonnes métier : les totaux, le numéro et le type
-- restent contrôlés par la base.
grant update (client_id, status, issue_date, due_date, notes, discount_type, discount_value)
  on public.invoices to authenticated;

grant select, insert, update, delete on public.invoice_items to authenticated;
grant select, insert, delete on public.payments to authenticated;

revoke all on public.document_counters from authenticated;
