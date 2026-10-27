-- =============================================================================
-- Rollback du schéma initial (migration 001).
-- ATTENTION : supprime toutes les organisations, factures, paiements, clients
-- et produits. Exportez la base avant exécution.
-- Prérequis : avoir exécuté le rollback du module Finances (002).
-- =============================================================================

begin;

drop table if exists public.payments;
drop table if exists public.invoice_items;
drop table if exists public.invoices;
drop table if exists public.products;
drop table if exists public.clients;
drop table if exists public.organization_members;
drop table if exists public.document_counters;
drop table if exists public.organizations;

drop function if exists public.next_document_number(uuid, public.invoice_kind);
drop function if exists public.recalculate_invoice(uuid);
drop function if exists public.invoices_before_insert();
drop function if exists public.invoices_before_update();
drop function if exists public.invoices_after_discount_change();
drop function if exists public.invoice_items_calculate();
drop function if exists public.invoice_items_guard();
drop function if exists public.invoice_items_after_change();
drop function if exists public.payments_before_write();
drop function if exists public.payments_after_change();
drop function if exists public.handle_new_organization();
drop function if exists public.protect_last_owner();
drop function if exists public.touch_updated_at();
drop function if exists public.has_org_role(uuid, public.org_role[]);
drop function if exists public.is_org_member(uuid);
drop function if exists public.org_role_of(uuid);
drop function if exists public.can_write_finances(uuid);
drop function if exists public.can_manage_org(uuid);

drop type if exists public.payment_method;
drop type if exists public.invoice_kind;
drop type if exists public.invoice_status;
drop type if exists public.org_role;

commit;
