-- Registro de compras históricas de inversión sin alterar saldos bancarios de apertura.
-- Cada compra se conserva como operación y actualiza participaciones y coste medio.
create or replace function public.record_historical_investment_buy(
 p_position_id uuid,
 p_quantity numeric,
 p_price_eur numeric,
 p_fees_eur numeric default 0,
 p_trade_date date default current_date
) returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
 v_user uuid:=auth.uid();
 v_pos public.investment_positions%rowtype;
 v_id uuid;
 v_qty numeric;
 v_avg numeric;
begin
 if v_user is null then raise exception 'Sesión no válida.'; end if;
 if p_trade_date is null or p_trade_date>=date '2026-11-01' then
  raise exception 'Esta función solo admite compras anteriores al 01/11/2026.';
 end if;
 if p_quantity is null or p_quantity<=0 or p_price_eur is null or p_price_eur<=0 or p_fees_eur is null or p_fees_eur<0 then
  raise exception 'Cantidad, precio y comisiones no válidos.';
 end if;
 select * into v_pos
 from public.investment_positions
 where id=p_position_id and user_id=v_user
 for update;
 if not found then raise exception 'Activo no encontrado o sin permisos.'; end if;
 v_qty:=v_pos.quantity+p_quantity;
 v_avg:=(v_pos.quantity*v_pos.average_cost_eur+p_quantity*p_price_eur+p_fees_eur)/v_qty;
 insert into public.investment_transactions(user_id,position_id,trade_type,quantity,price_eur,fees_eur,trade_date,realized_pnl_eur)
 values(v_user,p_position_id,'buy',p_quantity,p_price_eur,p_fees_eur,p_trade_date,0)
 returning id into v_id;
 update public.investment_positions
 set quantity=v_qty,average_cost_eur=v_avg,updated_at=now()
 where id=p_position_id and user_id=v_user;
 return v_id;
end;
$$;
revoke all on function public.record_historical_investment_buy(uuid,numeric,numeric,numeric,date) from public,anon;
grant execute on function public.record_historical_investment_buy(uuid,numeric,numeric,numeric,date) to authenticated;
