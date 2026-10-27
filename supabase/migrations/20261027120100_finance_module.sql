-- =============================================================================
-- Sama Facture — 002 · Module Finances
--   * « Mes achats » : achats professionnels saisis manuellement
--   * « Mes dépenses » : charges d'exploitation
--   * Vue de journal financier + fonction d'agrégation serveur
--
-- Les achats saisis ici ne sont PAS les mouvements de stock. Le coût des
-- marchandises vendues (COGS) est approché par les achats des catégories
-- « marchandises » et « matières premières » (is_cogs = true).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'purchase_category') then
    create type public.purchase_category as enum (
      'marchandises',        -- COGS
      'matieres_premieres',  -- COGS
      'fournitures',         -- charge d'exploitation
      'services',            -- charge d'exploitation
      'equipement',          -- investissement (hors résultat estimé)
      'autre'                -- charge d'exploitation
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'expense_category') then
    create type public.expense_category as enum (
      'transport',
      'loyer',
      'salaires',
      'electricite_internet',
      'marketing',
      'frais_bancaires',
      'autre'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Achats
-- -----------------------------------------------------------------------------
create table if not exists public.purchases (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  supplier_name            text,
  supplier_invoice_number  text,
  purchase_date            date not null default current_date,
  description              text not null check (length(trim(description)) between 1 and 500),
  category                 public.purchase_category not null default 'marchandises',
  quantity                 numeric(14, 3) not null check (quantity > 0),
  unit_price               numeric(14, 2) not null check (unit_price >= 0),
  total_amount             numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  amount_paid              numeric(14, 2) not null default 0 check (amount_paid >= 0),
  amount_due               numeric(14, 2) generated always as (round(quantity * unit_price, 2) - amount_paid) stored,
  is_cogs                  boolean generated always as (category in ('marchandises', 'matieres_premieres')) stored,
  is_capex                 boolean generated always as (category = 'equipement') stored,
  payment_method           public.payment_method,
  notes                    text,
  created_by               uuid not null default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists purchases_org_date_idx on public.purchases (organization_id, purchase_date desc);
create index if not exists purchases_org_category_idx on public.purchases (organization_id, category);

-- -----------------------------------------------------------------------------
-- Dépenses
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  expense_date     date not null default current_date,
  category         public.expense_category not null,
  description      text not null check (length(trim(description)) between 1 and 500),
  amount           numeric(14, 2) not null check (amount > 0),
  reference        text,
  notes            text,
  created_by       uuid not null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists expenses_org_date_idx on public.expenses (organization_id, expense_date desc);
create index if not exists expenses_org_category_idx on public.expenses (organization_id, category);

-- -----------------------------------------------------------------------------
-- Triggers de validation (la base reste l'autorité, pas le navigateur)
-- -----------------------------------------------------------------------------
create or replace function public.purchases_validate()
returns trigger
language plpgsql
as $$
declare
  v_total numeric(14, 2);
begin
  v_total := round(new.quantity * new.unit_price, 2);

  if new.amount_paid > v_total + 0.005 then
    raise exception 'Le montant payé (%) dépasse le total de l''achat (%).', new.amount_paid, v_total
      using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'L''organisation d''un achat est immuable.' using errcode = 'check_violation';
  end if;

  if new.amount_paid < 0 then
    raise exception 'Le montant payé ne peut pas être négatif.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists purchases_validate on public.purchases;
create trigger purchases_validate before insert or update on public.purchases
  for each row execute function public.purchases_validate();

create or replace function public.expenses_validate()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'L''organisation d''une dépense est immuable.' using errcode = 'check_violation';
  end if;
  if new.amount <= 0 then
    raise exception 'Le montant d''une dépense doit être strictement positif.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_validate on public.expenses;
create trigger expenses_validate before insert or update on public.expenses
  for each row execute function public.expenses_validate();

drop trigger if exists purchases_touch on public.purchases;
create trigger purchases_touch before update on public.purchases
  for each row execute function public.touch_updated_at();

drop trigger if exists expenses_touch on public.expenses;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.purchases enable row level security;
alter table public.expenses enable row level security;

drop policy if exists purchases_select on public.purchases;
create policy purchases_select on public.purchases
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists purchases_insert on public.purchases;
create policy purchases_insert on public.purchases
  for insert to authenticated
  with check (public.can_write_finances(organization_id));

drop policy if exists purchases_update on public.purchases;
create policy purchases_update on public.purchases
  for update to authenticated
  using (public.can_write_finances(organization_id))
  with check (public.can_write_finances(organization_id));

-- Suppression réservée aux propriétaires / administrateurs : un comptable peut
-- corriger mais pas effacer une pièce financière.
drop policy if exists purchases_delete on public.purchases;
create policy purchases_delete on public.purchases
  for delete to authenticated
  using (public.can_manage_org(organization_id));

drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.can_write_finances(organization_id));

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update to authenticated
  using (public.can_write_finances(organization_id))
  with check (public.can_write_finances(organization_id));

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses
  for delete to authenticated
  using (public.can_manage_org(organization_id));

revoke all on public.purchases, public.expenses from anon;
grant select, insert, update, delete on public.purchases, public.expenses to authenticated;

-- -----------------------------------------------------------------------------
-- Journal financier unifié (respecte la RLS via security_invoker)
--   * amount_ht : impact sur le résultat (avoir = négatif)
--   * cash_in / cash_out : impact trésorerie
-- Une facture et son paiement apparaissent sur deux lignes distinctes : la
-- première est un fait générateur, la seconde un mouvement de trésorerie.
-- -----------------------------------------------------------------------------
create or replace view public.v_finance_transactions
with (security_invoker = true)
as
select
  i.organization_id,
  i.issue_date as occurred_on,
  case when i.kind = 'credit_note' then 'avoir' else 'facture' end::text as source,
  i.id as source_id,
  i.number as reference,
  coalesce(c.name, 'Client de passage') as counterparty,
  case when i.kind = 'credit_note' then 'avoir' else 'vente' end::text as category,
  (case when i.kind = 'credit_note' then -1 else 1 end) * i.net_ht as amount_ht,
  (case when i.kind = 'credit_note' then -1 else 1 end) * i.tax_total as amount_tax,
  (case when i.kind = 'credit_note' then -1 else 1 end) * i.total_ttc as amount_ttc,
  0::numeric(14, 2) as cash_in,
  0::numeric(14, 2) as cash_out,
  false as is_cogs
from public.invoices i
left join public.clients c on c.id = i.client_id
where i.status in ('sent', 'partial', 'paid')

union all

select
  p.organization_id,
  p.paid_at as occurred_on,
  'paiement'::text as source,
  p.id as source_id,
  coalesce(i.number, '—') as reference,
  coalesce(c.name, 'Client de passage') as counterparty,
  'encaissement'::text as category,
  0::numeric(14, 2) as amount_ht,
  0::numeric(14, 2) as amount_tax,
  0::numeric(14, 2) as amount_ttc,
  p.amount as cash_in,
  0::numeric(14, 2) as cash_out,
  false as is_cogs
from public.payments p
join public.invoices i on i.id = p.invoice_id
left join public.clients c on c.id = i.client_id

union all

select
  pu.organization_id,
  pu.purchase_date as occurred_on,
  'achat'::text as source,
  pu.id as source_id,
  coalesce(pu.supplier_invoice_number, '—') as reference,
  coalesce(pu.supplier_name, 'Fournisseur non renseigné') as counterparty,
  pu.category::text as category,
  pu.total_amount as amount_ht,
  0::numeric(14, 2) as amount_tax,
  pu.total_amount as amount_ttc,
  0::numeric(14, 2) as cash_in,
  pu.amount_paid as cash_out,
  pu.is_cogs
from public.purchases pu

union all

select
  e.organization_id,
  e.expense_date as occurred_on,
  'depense'::text as source,
  e.id as source_id,
  coalesce(e.reference, '—') as reference,
  '—'::text as counterparty,
  e.category::text as category,
  e.amount as amount_ht,
  0::numeric(14, 2) as amount_tax,
  e.amount as amount_ttc,
  0::numeric(14, 2) as cash_in,
  e.amount as cash_out,
  false as is_cogs
from public.expenses e;

grant select on public.v_finance_transactions to authenticated;
revoke all on public.v_finance_transactions from anon;

-- -----------------------------------------------------------------------------
-- Agrégat financier serveur
--   CA : factures émises (sent/partial/paid) nettes de remises et d'avoirs.
--   Les brouillons et annulées sont comptés à part, jamais dans le CA.
--   Trésorerie : paiements et décaissements datés dans la période.
--   Résultat estimé : CA net - COGS - achats d'exploitation - dépenses.
--   Les investissements (equipement) sont exclus du résultat estimé.
-- -----------------------------------------------------------------------------
create or replace function public.finance_summary(
  p_organization_id uuid,
  p_start date,
  p_end date
)
returns table (
  invoiced_ht numeric,
  invoiced_tax numeric,
  invoiced_ttc numeric,
  credited_ht numeric,
  collected_on_invoices numeric,
  outstanding numeric,
  cash_in numeric,
  cash_out numeric,
  net_cash numeric,
  purchases_total numeric,
  purchases_paid numeric,
  purchases_due numeric,
  cogs_total numeric,
  operating_purchases_total numeric,
  capex_total numeric,
  expenses_total numeric,
  gross_margin numeric,
  estimated_result numeric,
  draft_invoices_count integer,
  draft_invoices_total numeric,
  cancelled_invoices_count integer,
  cancelled_invoices_total numeric,
  cogs_available boolean,
  partial_estimate boolean
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_org_member(p_organization_id) then
    raise exception 'Accès refusé à cette organisation.' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Période invalide.' using errcode = '22007';
  end if;

  return query
  with confirmed as (
    select i.*
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.issue_date between p_start and p_end
      and i.status in ('sent', 'partial', 'paid')
  ),
  drafts as (
    select count(*)::integer as n, coalesce(sum(i.total_ttc), 0)::numeric as total
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.issue_date between p_start and p_end
      and i.status = 'draft'
  ),
  cancelled as (
    select count(*)::integer as n, coalesce(sum(i.total_ttc), 0)::numeric as total
    from public.invoices i
    where i.organization_id = p_organization_id
      and i.issue_date between p_start and p_end
      and i.status = 'cancelled'
  ),
  invoices_agg as (
    select
      coalesce(sum(case when kind = 'invoice' then net_ht else -net_ht end), 0)::numeric as invoiced_ht,
      coalesce(sum(case when kind = 'invoice' then tax_total else -tax_total end), 0)::numeric as invoiced_tax,
      coalesce(sum(case when kind = 'invoice' then total_ttc else -total_ttc end), 0)::numeric as invoiced_ttc,
      coalesce(sum(case when kind = 'credit_note' then net_ht else 0 end), 0)::numeric as credited_ht,
      coalesce(sum(case when kind = 'invoice' then amount_paid else 0 end), 0)::numeric as collected_on_invoices,
      coalesce(sum(case when kind = 'invoice' then amount_due else 0 end), 0)::numeric as outstanding
    from confirmed
  ),
  payments_agg as (
    select coalesce(sum(p.amount), 0)::numeric as cash_in
    from public.payments p
    where p.organization_id = p_organization_id
      and p.paid_at between p_start and p_end
  ),
  purchases_agg as (
    select
      coalesce(sum(pu.total_amount), 0)::numeric as total,
      coalesce(sum(pu.amount_paid), 0)::numeric as paid,
      coalesce(sum(pu.total_amount - pu.amount_paid), 0)::numeric as due,
      coalesce(sum(case when pu.is_cogs then pu.total_amount else 0 end), 0)::numeric as cogs,
      coalesce(sum(case when not pu.is_cogs and not pu.is_capex then pu.total_amount else 0 end), 0)::numeric as operating,
      coalesce(sum(case when pu.is_capex then pu.total_amount else 0 end), 0)::numeric as capex,
      count(*) filter (where pu.is_cogs)::integer as cogs_count,
      count(*)::integer as purchase_count
    from public.purchases pu
    where pu.organization_id = p_organization_id
      and pu.purchase_date between p_start and p_end
  ),
  expenses_agg as (
    select coalesce(sum(e.amount), 0)::numeric as total, count(*)::integer as n
    from public.expenses e
    where e.organization_id = p_organization_id
      and e.expense_date between p_start and p_end
  )
  select
    ia.invoiced_ht,
    ia.invoiced_tax,
    ia.invoiced_ttc,
    ia.credited_ht,
    ia.collected_on_invoices,
    ia.outstanding,
    pa.cash_in,
    round(pua.paid + ea.total, 2),
    round(pa.cash_in - (pua.paid + ea.total), 2),
    pua.total,
    pua.paid,
    pua.due,
    pua.cogs,
    pua.operating,
    pua.capex,
    ea.total,
    case when pua.cogs_count > 0 then round(ia.invoiced_ht - pua.cogs, 2) else null end,
    round(ia.invoiced_ht - pua.cogs - pua.operating - ea.total, 2),
    d.n,
    d.total,
    c.n,
    c.total,
    pua.cogs_count > 0,
    (pua.cogs_count = 0)
      or (ia.invoiced_ht > 0 and ea.n = 0)
  from invoices_agg ia
  cross join payments_agg pa
  cross join purchases_agg pua
  cross join expenses_agg ea
  cross join drafts d
  cross join cancelled c;
end;
$$;

revoke all on function public.finance_summary(uuid, date, date) from public, anon;
grant execute on function public.finance_summary(uuid, date, date) to authenticated;
