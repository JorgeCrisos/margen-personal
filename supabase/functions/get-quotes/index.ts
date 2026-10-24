// Supabase Edge Function: keeps the market-data API key server-side.
// Configure secret TWELVEDATA_API_KEY before deploying.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({error:"Method not allowed"}), {status:405,headers:cors});
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const apiKey = Deno.env.get("TWELVEDATA_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({error:"Falta configurar TWELVEDATA_API_KEY"}), {status:503,headers:cors});
    const auth = req.headers.get("Authorization") || "";
    const client = createClient(url, anon, {global:{headers:{Authorization:auth}}});
    const {data:{user},error:authError} = await client.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({error:"Unauthorized"}), {status:401,headers:cors});
    const body = await req.json();
    const symbols = [...new Set((Array.isArray(body.symbols)?body.symbols:[]).map((s:string)=>String(s).trim().toUpperCase()).filter((s:string)=>/^[A-Z0-9.\-:]{1,30}$/.test(s)))].slice(0,20);
    if (!symbols.length) return new Response(JSON.stringify({quotes:[]}), {headers:cors});
    const quotes = [];
    for (const symbol of symbols) {
      try {
        const qres = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(apiKey)}`);
        const q = await qres.json();
        if (!qres.ok || q.status === "error" || !Number.isFinite(Number(q.close))) { quotes.push({symbol,error:q.message||"Cotización no disponible"}); continue; }
        const price = Number(q.close), currency = String(q.currency||"USD").toUpperCase();
        let priceEur = price;
        if (currency !== "EUR") {
          const fxres = await fetch(`https://api.twelvedata.com/exchange_rate?symbol=${encodeURIComponent(currency+"/EUR")}&apikey=${encodeURIComponent(apiKey)}`);
          const fx = await fxres.json();
          if (!fxres.ok || fx.status === "error" || !Number.isFinite(Number(fx.rate))) { quotes.push({symbol,error:`No se pudo convertir ${currency} a EUR`}); continue; }
          priceEur = price * Number(fx.rate);
        }
        quotes.push({symbol,price,price_eur:priceEur,currency,datetime:q.datetime||null});
      } catch (_e) { quotes.push({symbol,error:"Error consultando la cotización"}); }
    }
    return new Response(JSON.stringify({quotes,updated_at:new Date().toISOString()}), {headers:cors});
  } catch (_e) { return new Response(JSON.stringify({error:"Error interno al obtener cotizaciones"}), {status:500,headers:cors}); }
});
