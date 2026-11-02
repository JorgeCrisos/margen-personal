-- Vincula cada gasto/ingreso a una cuenta bancaria y calcula el saldo actual
-- a partir del saldo inicial introducido a 01/11/2026.
-- Migración aditiva: no elimina ni modifica movimientos existentes.

alter table public.transactions
  add column if not exists bank_account_id uuid;

-- La FK deja el movimiento sin cuenta si se elimina una cuenta bancaria.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'transactions_bank_account_id_fkey'
      and conrelid = 'public.transactions'::regclass
  ) then
    alter table public.transactions
      add constraint transactions_bank_account_id_fkey
      foreign key (bank_account_id)
      references public.bank_accounts(id)
      on delete set null;
  end if;
end $$;

create index if not exists transactions_bank_account_date_idx
  on public.transactions (bank_account_id, transaction_date)
  where bank_account_id is not null;

-- Evita asociar desde la API una cuenta bancaria que pertenezca a otro usuario.
create or replace function public.check_transaction_bank_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  bank_owner uuid;
begin
  if new.bank_account_id is null then
    return new;
  end if;

  select user_id into bank_owner
  from public.bank_accounts
  where id = new.bank_account_id;

  if bank_owner is null or bank_owner <> new.user_id then
    raise exception 'La cuenta bancaria no pertenece al usuario del movimiento.';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_check_bank_owner on public.transactions;
create trigger transactions_check_bank_owner
before insert or update of bank_account_id, user_id
on public.transactions
for each row execute function public.check_transaction_bank_owner();

-- Los movimientos antiguos permanecen con bank_account_id NULL y no alteran
-- los saldos iniciales. A partir del 01/11/2026, cada movimiento asignado
-- se suma (ingreso) o resta (gasto) de su cuenta.
