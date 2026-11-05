-- Permite borrar únicamente la última operación de un activo y revertir todos sus efectos.
create or replace function public.delete_latest_investment_trade(p_trade_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare
 v_user uuid:=auth.uid();
 v_trade public.investment_transactions%rowtype;
 v_pos public.investment_positions%rowtype;
 v_new_qty numeric;
 v_new_avg numeric;
begin
 if v_user is null then raise exception 'Sesión no válida.'; end if;
 select * into v_trade from public.investment_transactions
 where id=p_trade_id and user_id=v_user for update;
 if not found then raise exception 'Operación no encontrada.'; end if;
 if v_trade.position_id is null then raise exception 'No se puede revertir esta operación porque el activo ya no existe.'; end if;
 select * into v_pos from public.investment_positions
 where id=v_trade.position_id and user_id=v_user for update;
 if not found then raise exception 'Activo no encontrado.'; end if;
 if exists(select 1 from public.investment_transactions
   where user_id=v_user and position_id=v_trade.position_id
   and (created_at>v_trade.created_at or (created_at=v_trade.created_at and id>v_trade.id))) then
   raise exception 'Solo puedes eliminar la operación más reciente de ese activo. Elimina primero las posteriores.';
 end if;
 if v_trade.trade_type='buy' then
   v_new_qty:=v_pos.quantity-v_trade.quantity;
   if v_new_qty < -0.00000001 then raise exception 'No se puede revertir la compra: los títulos actuales no cuadran.'; end if;
   if v_new_qty<=0.00000001 then v_new_qty:=0;v_new_avg:=0;
   else
     v_new_avg:=(v_pos.quantity*v_pos.average_cost_eur-v_trade.quantity*v_trade.price_eur-v_trade.fees_eur)/v_new_qty;
     if v_new_avg<0 then raise exception 'No se puede reconstruir el coste medio de esta operación.'; end if;
   end if;
 else
   v_new_qty:=v_pos.quantity+v_trade.quantity;
   v_new_avg:=v_pos.average_cost_eur;
 end if;
 delete from public.investment_cash_movements where trade_id=v_trade.id and user_id=v_user;
 delete from public.investment_transactions where id=v_trade.id and user_id=v_user;
 update public.investment_positions set quantity=v_new_qty,average_cost_eur=v_new_avg,updated_at=now()
 where id=v_pos.id and user_id=v_user;
end; $$;
revoke all on function public.delete_latest_investment_trade(uuid) from public,anon;
grant execute on function public.delete_latest_investment_trade(uuid) to authenticated;
