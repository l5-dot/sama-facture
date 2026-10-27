-- =============================================================================
-- Rollback du module Finances (migration 002).
-- À exécuter uniquement si l'on souhaite retirer le module : les achats et
-- dépenses saisis sont DÉFINITIVEMENT perdus. Sauvegardez-les d'abord :
--   create table backup_purchases as select * from public.purchases;
--   create table backup_expenses as select * from public.expenses;
-- =============================================================================

begin;

drop view if exists public.v_finance_transactions;

drop function if exists public.finance_summary(uuid, date, date);

drop table if exists public.expenses;
drop table if exists public.purchases;

drop function if exists public.expenses_validate();
drop function if exists public.purchases_validate();

drop type if exists public.expense_category;
drop type if exists public.purchase_category;

commit;
