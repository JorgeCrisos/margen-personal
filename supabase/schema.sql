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
create index if not exists investment_transactions_user_date_idx on public.investment_transactions(user_id,trade_date desc);

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
  check (gross_amount_eur >= tax_amount_eur)
);
create index if not exists dividends_user_date_idx on public.dividends(user_id,payment_date desc);

-- RLS: cada usuario solo accede a sus propios registros.
do $$ declare t text; begin
  foreach t in array array['bank_accounts','investment_positions','investment_transactions','dividends'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists %I on public.%I',t||'_select_own',t);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t||'_select_own',t);
    execute format('drop policy if exists %I on public.%I',t||'_insert_own',t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',t||'_insert_own',t);
    execute format('drop policy if exists %I on public.%I',t||'_update_own',t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t||'_update_own',t);
    execute format('drop policy if exists %I on public.%I',t||'_delete_own',t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',t||'_delete_own',t);
    execute format('revoke all on public.%I from anon',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
  end loop;
end $$;
