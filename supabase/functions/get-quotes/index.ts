// Supabase Edge Function: market-aware quotes with strict instrument validation.
// Secret required: TWELVEDATA_API_KEY. Never expose it to the browser.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const KNOWN: Record<string,{isin:string;mic_code:string;exchange:string;symbol:string}> = {
  A3M: {isin:"ES0109427734",mic_code:"XMAD",exchange:"Bolsa de Madrid",symbol:"A3M"},
  MSFT:{isin:"US5949181045",mic_code:"XNAS",exchange:"NASDAQ",symbol:"MSFT"},
  MWRE:{isin:"IE000BI8OT95",mic_code:"XETR",exchange:"Xetra",symbol:"MWRE"},
  SXR8:{isin:"IE00B5BMR087",mic_code:"XETR",exchange:"Xetra",symbol:"SXR8"},
  "3CP":{isin:"KYG9830T1067",mic_code:"XFRA",exchange:"Frankfurt",symbol:"3CP"}
};
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
async function api(path:string,key:string){
  const url=new URL("https://api.twelvedata.com/"+path);
  url.searchParams.set("apikey",key);
  const response=await fetch(url.toString(),{headers:{"Accept":"application/json"}});
  const data=await response.json();
  if(!response.ok || data?.status==="error" || data?.code>=400) throw new Error(data?.message||data?.code||"Error del proveedor");
  return data;
}
serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL"), anon=Deno.env.get("SUPABASE_ANON_KEY"), key=Deno.env.get("TWELVEDATA_API_KEY");
    if(!url||!anon||!key) return json({error:"Falta configurar Supabase o TWELVEDATA_API_KEY"},503);
    const auth=req.headers.get("Authorization")||"";
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError||!user) return json({error:"Unauthorized"},401);
    const body=await req.json();
    const positions=Array.isArray(body.positions)?body.positions:[];
    if(positions.length>30) return json({error:"Máximo 30 activos por consulta. Divide la cartera en bloques."},400);
    if(!positions.length) return json({quotes:[]});
    const quotes=[];
    for(const raw of positions){
      const p=raw||{},ticker=String(p.ticker||"").trim().toUpperCase(),id=String(p.id||"");
      if(!id||!ticker){quotes.push({position_id:id,error:"Falta el identificador o ticker"});continue;}
      try{
        const known=KNOWN[ticker];
        const expectedIsin=String(p.isin||known?.isin||"").toUpperCase();
        let mic=String(p.mic_code||known?.mic_code||"").toUpperCase();
        let exchange=String(p.exchange||known?.exchange||"");
        let symbol=String(p.provider_symbol||known?.symbol||ticker).toUpperCase();
        // When the user has not selected a MIC, discover only an unambiguous exact ticker match.
        if(!mic){
          const found=await api("symbol_search?symbol="+encodeURIComponent(symbol)+"&outputsize=120",key);
          const matches=(found.data||[]).filter((x:any)=>String(x.symbol||"").toUpperCase()===symbol);
          if(matches.length!==1) throw new Error(matches.length?"Ticker ambiguo: indica el código MIC de tu bolsa":"No se ha encontrado una coincidencia exacta; añade el MIC de tu bolsa");
          mic=String(matches[0].mic_code||"").toUpperCase();exchange=String(matches[0].exchange||"");
          if(!mic) throw new Error("El proveedor no identifica la bolsa (MIC)");
        }
        const q=await api("quote?symbol="+encodeURIComponent(symbol)+"&mic_code="+encodeURIComponent(mic),key);
        const returnedSymbol=String(q.symbol||"").toUpperCase(),returnedMic=String(q.mic_code||"").toUpperCase();
        if(returnedSymbol!==symbol) throw new Error("El símbolo devuelto no coincide con el solicitado");
        if(returnedMic!==mic) throw new Error("La bolsa devuelta no coincide con el MIC esperado");
        if(expectedIsin && known && known.isin!==expectedIsin) throw new Error("El ISIN no coincide con el instrumento registrado");
        const price=num(q.close),currency=String(q.currency||"").toUpperCase(),date=String(q.datetime||"").slice(0,10);
        if(price===null||price<=0) throw new Error("El proveedor no ha devuelto un precio válido");
        if(!currency) throw new Error("El proveedor no ha indicado la divisa");
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha de cotización no válida");
        const ageDays=(Date.now()-Date.parse(date+"T23:59:59Z"))/86400000;
        if(!Number.isFinite(ageDays)||ageDays>7) throw new Error("Cotización antigua ("+date+"); se conserva el último precio válido");
        let rate=1;
        if(currency!=="EUR"){
          const fx=await api("exchange_rate?symbol="+encodeURIComponent(currency+"/EUR"),key);
          rate=num(fx.rate)||0;
          if(rate<=0) throw new Error("No se ha podido convertir "+currency+" a EUR");
        }
        quotes.push({position_id:id,symbol:returnedSymbol,mic_code:returnedMic,exchange:q.exchange||exchange,currency,price,price_eur:price*rate,datetime:date,validated:true});
      }catch(e){quotes.push({position_id:id,error:e instanceof Error?e.message:"Error consultando el mercado"});}
    }
    return json({quotes,updated_at:new Date().toISOString(),provider:"Twelve Data"});
  }catch(e){return json({error:e instanceof Error?e.message:"Error interno al obtener cotizaciones"},500);}
});
