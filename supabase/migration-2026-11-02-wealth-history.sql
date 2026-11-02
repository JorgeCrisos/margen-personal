-- Histórico diario del patrimonio neto. Migración aditiva y aislada.
create table if not exists public.wealth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  bank_total_eur numeric(16,2) not null default 0,
  investment_total_eur numeric(16,2) not null default 0,
  net_worth_eur numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, snapshot_date)
);
create index if not exists wealth_snapshots_user_date_idx on public.wealth_snapshots(user_id, snapshot_date desc);
alter table public.wealth_snapshots enable row level security;
drop policy if exists "Users can read own wealth snapshots" on public.wealth_snapshots;
create policy "Users can read own wealth snapshots" on public.wealth_snapshots for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own wealth snapshots" on public.wealth_snapshots;
create policy "Users can insert own wealth snapshots" on public.wealth_snapshots for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own wealth snapshots" on public.wealth_snapshots;
create policy "Users can update own wealth snapshots" on public.wealth_snapshots for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.wealth_snapshots from anon;
grant select, insert, update on public.wealth_snapshots to authenticated;
