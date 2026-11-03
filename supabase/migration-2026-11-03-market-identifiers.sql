-- Margen Personal: identificación inequívoca de instrumentos y control de cotizaciones.
-- Migración aditiva e idempotente. No borra posiciones ni modifica cantidades/costes.

alter table public.investment_positions
  add column if not exists isin text,
  add column if not exists exchange text,
  add column if not exists mic_code text,
  add column if not exists provider_symbol text,
  add column if not exists quote_provider text,
  add column if not exists quote_datetime date,
  add column if not exists quote_status text not null default 'pending',
  add column if not exists quote_error text;

-- El ticker por sí solo no identifica una cotización en bolsas distintas.
-- Sustituimos la unicidad ticker-only por ticker + MIC.
alter table public.investment_positions
  drop constraint if exists investment_positions_user_id_ticker_key;
create unique index if not exists investment_positions_user_ticker_mic_uidx
  on public.investment_positions(user_id, ticker, coalesce(mic_code, ''));

-- Asocia los activos que ya aparecen en la cartera del usuario.
-- No se alteran cantidades, precios de compra ni precios actuales.
update public.investment_positions
set isin='ES0109427734', exchange='Bolsa de Madrid', mic_code='XMAD', provider_symbol='A3M'
where upper(ticker)='A3M' and isin is null;

update public.investment_positions
set isin='US5949181045', exchange='NASDAQ', mic_code='XNAS', provider_symbol='MSFT'
where upper(ticker)='MSFT' and isin is null;

update public.investment_positions
set isin='IE000BI8OT95', exchange='Xetra', mic_code='XETR', provider_symbol='MWRE'
where upper(ticker)='MWRE' and isin is null;

update public.investment_positions
set isin='IE00B5BMR087', exchange='Xetra', mic_code='XETR', provider_symbol='SXR8'
where upper(ticker)='SXR8' and isin is null;

update public.investment_positions
set isin='KYG9830T1067', exchange='Frankfurt', mic_code='XFRA', provider_symbol='3CP'
where upper(ticker)='3CP' and isin is null;

create index if not exists investment_positions_user_isin_idx
  on public.investment_positions(user_id, isin);
