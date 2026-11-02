-- Libro auxiliar para movimientos de efectivo derivados de inversiones.
-- No importa operaciones históricas: el saldo bancario de apertura al 01/11/2026
-- sigue siendo la referencia y no se altera retroactivamente.
create table if not exists public.investment_cash_movements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 bank_account_id uuid not null references public.bank_accounts(id) on delete restrict,
 position_id uuid references public.investment_positions(id) on delete set null,
 trade_id uuid unique references public.investment_transactions(id) on delete set null,
 dividend_id uuid unique references public.dividends(id) on delete set null,
 movement_date date not null,
 movement_type text not null check(movement_type in('buy','sell','dividend')),
 amount_eur numeric(16,2) not null check(amount_eur<>0),
 description text not null,
 created_at timestamptz not null default now(),
 check ((trade_id is null) <> (dividend_id is null))
);
create index if not exists investment_cash_bank_date_idx on public.investment_cash_movements(bank_account_id,movement_date);
alter table public.investment_cash_movements enable row level security;
drop policy if exists investment_cash_select_own on public.investment_cash_movements;
create policy investment_cash_select_own on public.investment_cash_movements for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.investment_cash_movements from anon,authenticated;
grant select on public.investment_cash_movements to authenticated;

create or replace function public.record_investment_trade(
 p_position_id uuid,p_bank_account_id uuid,p_trade_type text,p_quantity numeric,p_price_eur numeric,p_fees_eur numeric,p_trade_date date,p_post_cash boolean default true
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_pos public.investment_positions%rowtype; v_id uuid; v_qty numeric; v_avg numeric; v_realized numeric; v_cash numeric;
begin
 if v_user is null then raise exception 'Sesión no válida.'; end if;
 if p_trade_type not in('buy','sell') or p_quantity<=0 or p_price_eur<=0 or p_fees_eur<0 then raise exception 'Datos de operación no válidos.'; end if;
 if p_trade_date<date '2026-11-01' then raise exception 'Las operaciones nuevas deben fecharse desde 01/11/2026.'; end if;
 select * into v_pos from public.investment_positions where id=p_position_id and user_id=v_user for update;
 if not found then raise exception 'Activo no encontrado o sin permisos.'; end if;
 if p_post_cash then
  if p_bank_account_id is null or not exists(select 1 from public.bank_accounts where id=p_bank_account_id and user_id=v_user) then raise exception 'Selecciona una cuenta bancaria propia.'; end if;
 elsif p_bank_account_id is not null then raise exception 'No envíes cuenta bancaria cuando el efectivo ya esté contabilizado.'; end if;
 if p_trade_type='sell' and p_quantity>v_pos.quantity then raise exception 'No puedes vender más títulos de los que tienes.'; end if;
 if p_trade_type='buy' then
  v_qty:=v_pos.quantity+p_quantity; v_avg:=(v_pos.quantity*v_pos.average_cost_eur+p_quantity*p_price_eur+p_fees_eur)/v_qty; v_realized:=0; v_cash:=-(p_quantity*p_price_eur+p_fees_eur);
 else
  v_qty:=v_pos.quantity-p_quantity; v_avg:=case when v_qty=0 then 0 else v_pos.average_cost_eur end; v_realized:=(p_price_eur-v_pos.average_cost_eur)*p_quantity-p_fees_eur; v_cash:=p_quantity*p_price_eur-p_fees_eur;
 end if;
 insert into public.investment_transactions(user_id,position_id,trade_type,quantity,price_eur,fees_eur,trade_date,realized_pnl_eur)
 values(v_user,p_position_id,p_trade_type,p_quantity,p_price_eur,p_fees_eur,p_trade_date,v_realized) returning id into v_id;
 update public.investment_positions set quantity=v_qty,average_cost_eur=v_avg,updated_at=now() where id=p_position_id and user_id=v_user;
 if p_post_cash and round(v_cash,2)<>0 then
  insert into public.investment_cash_movements(user_id,bank_account_id,position_id,trade_id,movement_date,movement_type,amount_eur,description)
  values(v_user,p_bank_account_id,p_position_id,v_id,p_trade_date,p_trade_type,round(v_cash,2),case when p_trade_type='buy' then 'Compra de inversión' else 'Venta de inversión' end);
 end if;
 return v_id;
end; $$;

create or replace function public.record_investment_dividend(
 p_position_id uuid,p_bank_account_id uuid,p_gross_eur numeric,p_tax_eur numeric,p_net_eur numeric,p_payment_date date,p_post_cash boolean default true
) returns uuid language plpgsql security definer set search_path=public
as $$
declare v_user uuid:=auth.uid(); v_pos public.investment_positions%rowtype; v_id uuid;
begin
 if v_user is null then raise exception 'Sesión no válida.'; end if;
 if p_gross_eur<0 or p_tax_eur<0 or p_net_eur<0 or abs(p_gross_eur-p_tax_eur-p_net_eur)>0.02 then raise exception 'Bruto menos retención debe ser igual al neto.'; end if;
 if p_payment_date<date '2026-11-01' then raise exception 'Los dividendos nuevos deben fecharse desde 01/11/2026.'; end if;
 select * into v_pos from public.investment_positions where id=p_position_id and user_id=v_user for share;
 if not found then raise exception 'Activo no encontrado o sin permisos.'; end if;
 if p_post_cash then
  if p_bank_account_id is null or not exists(select 1 from public.bank_accounts where id=p_bank_account_id and user_id=v_user) then raise exception 'Selecciona una cuenta bancaria propia.'; end if;
 elsif p_bank_account_id is not null then raise exception 'No envíes cuenta bancaria cuando el efectivo ya esté contabilizado.'; end if;
 insert into public.dividends(user_id,position_id,asset_name,gross_amount_eur,tax_amount_eur,net_amount_eur,payment_date)
 values(v_user,p_position_id,v_pos.name,p_gross_eur,p_tax_eur,p_net_eur,p_payment_date) returning id into v_id;
 if p_post_cash and round(p_net_eur,2)>0 then
  insert into public.investment_cash_movements(user_id,bank_account_id,position_id,dividend_id,movement_date,movement_type,amount_eur,description)
  values(v_user,p_bank_account_id,p_position_id,v_id,p_payment_date,'dividend',round(p_net_eur,2),'Dividendo neto');
 end if;
 return v_id;
end; $$;
revoke all on function public.record_investment_trade(uuid,uuid,text,numeric,numeric,numeric,date,boolean) from public,anon;
revoke all on function public.record_investment_dividend(uuid,uuid,numeric,numeric,numeric,date,boolean) from public,anon;
grant execute on function public.record_investment_trade(uuid,uuid,text,numeric,numeric,numeric,date,boolean) to authenticated;
grant execute on function public.record_investment_dividend(uuid,uuid,numeric,numeric,numeric,date,boolean) to authenticated;
