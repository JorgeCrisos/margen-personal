-- Migración adicional para Margen Personal.
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- No borra ni modifica registros existentes.

create table if not exists public.dividends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid references public.investment_positions(id) on delete set null,
  asset_name text,
  gross_amount_eur numeric(14,2) not null check (gross_amount_eur >= 0),
  tax_amount_eur numeric(14,2) not null default 0 check (tax_amount_eur >= 0),
  net_amount_eur numeric(14,2) not null check (net_amount_eur >= 0),
  payment_date date not null default current_date,
  created_at timestamptz not null default now(),
  check (abs(gross_amount_eur - tax_amount_eur - net_amount_eur) <= 0.02)
);

create index if not exists dividends_user_date_idx
  on public.dividends(user_id, payment_date desc);

alter table public.bank_accounts enable row level security;
alter table public.investment_positions enable row level security;
alter table public.investment_transactions enable row level security;
alter table public.dividends enable row level security;

drop policy if exists bank_accounts_select_own on public.bank_accounts;
create policy bank_accounts_select_own on public.bank_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists bank_accounts_insert_own on public.bank_accounts;
create policy bank_accounts_insert_own on public.bank_accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists bank_accounts_update_own on public.bank_accounts;
create policy bank_accounts_update_own on public.bank_accounts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists bank_accounts_delete_own on public.bank_accounts;
create policy bank_accounts_delete_own on public.bank_accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists investment_positions_select_own on public.investment_positions;
create policy investment_positions_select_own on public.investment_positions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists investment_positions_insert_own on public.investment_positions;
create policy investment_positions_insert_own on public.investment_positions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists investment_positions_update_own on public.investment_positions;
create policy investment_positions_update_own on public.investment_positions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists investment_positions_delete_own on public.investment_positions;
create policy investment_positions_delete_own on public.investment_positions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists investment_transactions_select_own on public.investment_transactions;
create policy investment_transactions_select_own on public.investment_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists investment_transactions_insert_own on public.investment_transactions;
create policy investment_transactions_insert_own on public.investment_transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists investment_transactions_update_own on public.investment_transactions;
create policy investment_transactions_update_own on public.investment_transactions
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists investment_transactions_delete_own on public.investment_transactions;
create policy investment_transactions_delete_own on public.investment_transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists dividends_select_own on public.dividends;
create policy dividends_select_own on public.dividends
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists dividends_insert_own on public.dividends;
create policy dividends_insert_own on public.dividends
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists dividends_update_own on public.dividends;
create policy dividends_update_own on public.dividends
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists dividends_delete_own on public.dividends;
create policy dividends_delete_own on public.dividends
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.bank_accounts, public.investment_positions,
  public.investment_transactions, public.dividends from anon;
grant select, insert, update, delete on public.bank_accounts,
  public.investment_positions, public.investment_transactions,
  public.dividends to authenticated;
