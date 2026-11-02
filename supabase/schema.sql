-- Ejecuta este SQL en Supabase > SQL Editor.
-- Cada usuario solo puede leer y modificar sus propios movimientos.
create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(12,2) not null check (amount > 0),
  description text not null check (char_length(description) between 1 and 120),
  category text not null check (char_length(category) between 1 and 80),
  transaction_date date not null default current_date,
  notes text check (notes is null or char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migración segura: CREATE TABLE IF NOT EXISTS no actualiza tablas antiguas.
alter table public.transactions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.transactions add column if not exists type text not null default 'expense';
alter table public.transactions add column if not exists amount numeric(12,2) not null default 0;
alter table public.transactions add column if not exists description text not null default 'Movimiento';
alter table public.transactions add column if not exists category text not null default 'Otros gastos';
alter table public.transactions add column if not exists transaction_date date not null default current_date;
alter table public.transactions add column if not exists notes text;
alter table public.transactions add column if not exists created_at timestamptz not null default now();
alter table public.transactions add column if not exists updated_at timestamptz not null default now();
create index if not exists transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc);

alter table public.transactions enable row level security;

drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own transactions" on public.transactions;
create policy "Users can insert own transactions"
  on public.transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own transactions" on public.transactions;
create policy "Users can update own transactions"
  on public.transactions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own transactions" on public.transactions;
create policy "Users can delete own transactions"
  on public.transactions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Restringe las columnas accesibles por la API.
revoke all on public.transactions from anon;
grant select, insert, update, delete on public.transactions to authenticated;

-- Recomendado: en Authentication > URL Configuration, configura la URL de tu web.
-- En Authentication > Providers > Email, decide si exigir confirmación por correo.
-- No pongas una clave service_role en el navegador.

-- Margen Personal: patrimonio, bancos, cartera, operaciones y dividendos.
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  account_type text not null default 'Cuenta corriente',
  balance_eur numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.bank_accounts add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.bank_accounts add column if not exists name text not null default 'Cuenta';
alter table public.bank_accounts add column if not exists account_type text not null default 'Cuenta corriente';
alter table public.bank_accounts add column if not exists balance_eur numeric(14,2) not null default 0;
alter table public.bank_accounts add column if not exists created_at timestamptz not null default now();
alter table public.bank_accounts add column if not exists updated_at timestamptz not null default now();
create index if not exists bank_accounts_user_idx on public.bank_accounts(user_id);

create table if not exists public.investment_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  ticker text not null check (char_length(ticker) between 1 and 20),
  asset_type text not null check (asset_type in ('stock','etf','fund','crypto','other')),
  quantity numeric(20,8) not null default 0 check (quantity >= 0),
  average_cost_eur numeric(20,8) not null default 0 check (average_cost_eur >= 0),
  current_price_eur numeric(20,8),
  quote_currency text not null default 'EUR',
  quote_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,ticker)
);
alter table public.investment_positions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.investment_positions add column if not exists name text not null default 'Activo';
alter table public.investment_positions add column if not exists ticker text not null default 'UNKNOWN';
alter table public.investment_positions add column if not exists asset_type text not null default 'other';
alter table public.investment_positions add column if not exists quantity numeric(20,8) not null default 0;
alter table public.investment_positions add column if not exists average_cost_eur numeric(20,8) not null default 0;
alter table public.investment_positions add column if not exists current_price_eur numeric(20,8);
alter table public.investment_positions add column if not exists quote_currency text not null default 'EUR';
alter table public.investment_positions add column if not exists quote_updated_at timestamptz;
alter table public.investment_positions add column if not exists created_at timestamptz not null default now();
alter table public.investment_positions add column if not exists updated_at timestamptz not null default now();
create index if not exists investment_positions_user_idx on public.investment_positions(user_id);

create table if not exists public.investment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid references public.investment_positions(id) on delete set null,
  asset_name text,
  trade_type text not null check (trade_type in ('buy','sell')),
  quantity numeric(20,8) not null check (quantity > 0),
  price_eur numeric(20,8) not null check (price_eur > 0),
  fees_eur numeric(14,2) not null default 0 check (fees_eur >= 0),
  realized_pnl_eur numeric(14,2) not null default 0,
  trade_date date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.investment_transactions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.investment_transactions add column if not exists position_id uuid references public.investment_positions(id) on delete set null;
alter table public.investment_transactions add column if not exists asset_name text;
alter table public.investment_transactions add column if not exists trade_type text not null default 'buy';
alter table public.investment_transactions add column if not exists quantity numeric(20,8) not null default 0;
alter table public.investment_transactions add column if not exists price_eur numeric(20,8) not null default 0;
alter table public.investment_transactions add column if not exists fees_eur numeric(14,2) not null default 0;
alter table public.investment_transactions add column if not exists realized_pnl_eur numeric(14,2) not null default 0;
