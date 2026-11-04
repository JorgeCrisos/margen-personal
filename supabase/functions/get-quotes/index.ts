// Supabase Edge Function: Twelve Data primary + Yahoo Finance fallback.
// Secret required for primary provider: TWELVEDATA_API_KEY. Never expose it to the browser.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const KNOWN: Record<string,{isin:string;mic_code:string;exchange:string;symbol:string;yahoo:string;name:string}> = {
  A3M: {isin:"ES0109427734",mic_code:"XMAD",exchange:"Bolsa de Madrid",symbol:"A3M",yahoo:"A3M.MC",name:"Atresmedia"},
  MSFT:{isin:"US5949181045",mic_code:"XNAS",exchange:"NASDAQ",symbol:"MSFT",yahoo:"MSFT",name:"Microsoft"},
  MWRE:{isin:"IE000BI8OT95",mic_code:"XETR",exchange:"Xetra",symbol:"MWRE",yahoo:"MWRE.DE",name:"Amundi Core MSCI World"},
  SXR8:{isin:"IE00B5BMR087",mic_code:"XETR",exchange:"Xetra",symbol:"SXR8",yahoo:"SXR8.DE",name:"iShares Core S&P 500"},
  "3CP":{isin:"KYG9830T1067",mic_code:"XFRA",exchange:"Frankfurt",symbol:"3CP",yahoo:"3CP.F",name:"Xiaomi"}
};
const num=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
async function api(path:string,key:string){
  const url=new URL("https://api.twelvedata.com/"+path);url.searchParams.set("apikey",key);
  const response=await fetch(url.toString(),{headers:{"Accept":"application/json"}});
  const data=await response.json();
  if(!response.ok||data?.status==="error"||data?.code>=400)throw new Error(data?.message||data?.code||"Error del proveedor");
  return data;
}
const YAHOO_SUFFIX:Record<string,string>={XMAD:".MC",XNAS:"",XNYS:"",XETR:".DE",XFRA:".F",XPAR:".PA",XAMS:".AS",XMIL:".MI",XLON:".L",XSWX:".SW",XBRU:".BR",XLIS:".LS",XCSE:".CO",XSTO:".ST",XHEL:".HE",XOSL:".OL"};
function yahooSymbol(ticker:string,mic:string,providerSymbol:string,known:any){
  if(known?.yahoo)return known.yahoo;
  if(providerSymbol&&/[.=-]/.test(providerSymbol))return providerSymbol;
  const suffix=YAHOO_SUFFIX[mic];
  return suffix===undefined?null:(providerSymbol||ticker)+suffix;
}
function exchangeMatches(mic:string,exchange:string){
  const e=String(exchange||"").toUpperCase();
  const patterns:Record<string,RegExp>={XMAD:/(MCE|MADRID)/,XNAS:/(NASDAQ|NMS)/,XNYS:/(NYSE|NYQ)/,XETR:/(XETRA|GER)/,XFRA:/(FRANKFURT|FRA)/,XPAR:/(PARIS|PAR)/,XAMS:/(AMSTERDAM|AMS)/,XMIL:/(MILAN|MIL)/,XLON:/(LONDON|LSE)/,XSWX:/(SWISS|SIX)/,XBRU:/(BRUSSELS|BRU)/,XLIS:/(LISBON|LIS)/,XCSE:/(COPENHAGEN|CPH)/,XSTO:/(STOCKHOLM|STO)/,XHEL:/(HELSINKI|HEL)/,XOSL:/(OSLO|OSL)/};
  return !!patterns[mic]&&patterns[mic].test(e);
}
async function yahooChart(symbol:string){
  const url="https://query1.finance.yahoo.com/v8/finance/chart/"+encodeURIComponent(symbol)+"?range=5d&interval=1d";
  const response=await fetch(url,{headers:{"Accept":"application/json","User-Agent":"Mozilla/5.0 MargenPersonal/1.0"}});
  if(!response.ok)throw new Error("Yahoo Finance respondió HTTP "+response.status);
  const data=await response.json(),result=data?.chart?.result?.[0],err=data?.chart?.error;
  if(err||!result)throw new Error(err?.description||"Yahoo Finance no ha encontrado el símbolo "+symbol);
  const meta=result.meta||{},price=num(meta.regularMarketPrice);
  const timestamp=num(meta.regularMarketTime)||num(result.timestamp?.[result.timestamp.length-1]);
  if(!price||price<=0)throw new Error("Yahoo Finance no ha devuelto un precio válido");
  if(!timestamp||!Number.isFinite(timestamp))throw new Error("Yahoo Finance no ha indicado la fecha del precio");
  const age=(Date.now()/1000-timestamp)/86400;
  if(age>7||age< -0.25)throw new Error("Cotización de Yahoo Finance antigua o con fecha no válida");
  return {symbol:String(meta.symbol||symbol).toUpperCase(),price,currency:String(meta.currency||""),timestamp,exchange:String(meta.exchangeName||meta.fullExchangeName||"") ,name:String(meta.longName||meta.shortName||""),type:String(meta.instrumentType||"")};
}
const fxCache=new Map<string,number>();
async function yahooToEur(price:number,currency:string){
  const raw=String(currency||"");let c=raw.toUpperCase(),value=price;
  if(c==="EUR")return value;
  if(raw==="GBp"||c==="GBX"){value/=100;c="GBP";}
  const cached=fxCache.get(c);if(cached)return value*cached;
  const fx=await yahooChart("EUR"+c+"=X");
  if(fx.currency!==c||fx.price<=0)throw new Error("No se ha podido validar el cambio EUR/"+c+" en Yahoo Finance");
  const rate=1/fx.price;
  fxCache.set(c,rate);
  return value*rate;
}
async function yahooFallback(p:any,ticker:string,known:any,expectedIsin:string,mic:string,providerSymbol:string){
  const symbol=yahooSymbol(ticker,mic,providerSymbol,known);
  if(!symbol)throw new Error("No hay un símbolo Yahoo configurado para la bolsa "+mic+"; añade el símbolo del proveedor con sufijo Yahoo");
  if(known&&expectedIsin&&known.isin!==expectedIsin)throw new Error("El ISIN no coincide con el instrumento registrado");
  const q=await yahooChart(symbol);
  if(q.symbol!==symbol.toUpperCase())throw new Error("Yahoo Finance ha devuelto otro símbolo");
  if(!exchangeMatches(mic,q.exchange))throw new Error("La bolsa de Yahoo ("+(q.exchange||"sin identificar")+") no coincide con "+mic);
  const expectedName=known?.name||String(p.name||"").trim();
  if(expectedName){
    const tokens=expectedName.toLowerCase().split(/[^a-z0-9]+/).filter((x:string)=>x.length>=4);
    const haystack=q.name.toLowerCase();
    const matched=tokens.filter((x:string)=>haystack.includes(x)).length;
    if(!known&&tokens.length&&matched===0)throw new Error("El nombre devuelto por Yahoo no coincide con el activo: "+q.name);
  }
  const priceEur=await yahooToEur(q.price,q.currency);
  if(!Number.isFinite(priceEur)||priceEur<=0)throw new Error("No se ha podido convertir el precio de Yahoo a EUR");
  return {position_id:String(p.id),symbol:q.symbol,mic_code:mic,exchange:q.exchange,currency:q.currency,price:q.price,price_eur:priceEur,datetime:new Date(q.timestamp*1000).toISOString().slice(0,10),validated:true,provider:"Yahoo Finance"};
}
serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  try{
    const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),key=Deno.env.get("TWELVEDATA_API_KEY")||"";
    if(!url||!anon)return json({error:"Falta configurar Supabase"},503);
    const auth=req.headers.get("Authorization")||"";
    const client=createClient(url,anon,{global:{headers:{Authorization:auth}}});
    const {data:{user},error:authError}=await client.auth.getUser();
    if(authError||!user)return json({error:"Unauthorized"},401);
    const body=await req.json(),positions=Array.isArray(body.positions)?body.positions:[];
    if(positions.length>30)return json({error:"Máximo 30 activos por consulta. Divide la cartera en bloques."},400);
    if(!positions.length)return json({quotes:[]});
    const quotes:any[]=[];
    for(const raw of positions){
      const p=raw||{},ticker=String(p.ticker||"").trim().toUpperCase(),id=String(p.id||"");
      if(!id||!ticker){quotes.push({position_id:id,error:"Falta el identificador o ticker"});continue;}
      const known=KNOWN[ticker],expectedIsin=String(p.isin||known?.isin||"").toUpperCase();
      let mic=String(p.mic_code||known?.mic_code||"").toUpperCase();
      let exchange=String(p.exchange||known?.exchange||"");
      let symbol=String(p.provider_symbol||known?.symbol||ticker).toUpperCase();
      let primaryError="Twelve Data no disponible";
      if(key){
        try{
          if(!mic){
            const found=await api("symbol_search?symbol="+encodeURIComponent(symbol)+"&outputsize=120",key);
            const matches=(found.data||[]).filter((x:any)=>String(x.symbol||"").toUpperCase()===symbol);
            if(matches.length!==1)throw new Error(matches.length?"Ticker ambiguo: indica el código MIC de tu bolsa":"No se ha encontrado una coincidencia exacta; añade el MIC de tu bolsa");
            mic=String(matches[0].mic_code||"").toUpperCase();exchange=String(matches[0].exchange||"");
            if(!mic)throw new Error("El proveedor no identifica la bolsa (MIC)");
          }
          const q=await api("quote?symbol="+encodeURIComponent(symbol)+"&mic_code="+encodeURIComponent(mic),key);
          const returnedSymbol=String(q.symbol||"").toUpperCase(),returnedMic=String(q.mic_code||"").toUpperCase();
          if(returnedSymbol!==symbol)throw new Error("El símbolo devuelto no coincide con el solicitado");
          if(returnedMic!==mic)throw new Error("La bolsa devuelta no coincide con el MIC esperado");
          if(expectedIsin&&known&&known.isin!==expectedIsin)throw new Error("El ISIN no coincide con el instrumento registrado");
          const price=num(q.close),currency=String(q.currency||"").toUpperCase(),date=String(q.datetime||"").slice(0,10);
          if(price===null||price<=0)throw new Error("El proveedor no ha devuelto un precio válido");
          if(!currency)throw new Error("El proveedor no ha indicado la divisa");
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error("Fecha de cotización no válida");
          const ageDays=(Date.now()-Date.parse(date+"T23:59:59Z"))/86400000;
          if(!Number.isFinite(ageDays)||ageDays>7)throw new Error("Cotización antigua ("+date+")");
          let rate=1;
          if(currency!=="EUR"){const fx=await api("exchange_rate?symbol="+encodeURIComponent(currency+"/EUR"),key);rate=num(fx.rate)||0;if(rate<=0)throw new Error("No se ha podido convertir "+currency+" a EUR");}
          quotes.push({position_id:id,symbol:returnedSymbol,mic_code:returnedMic,exchange:q.exchange||exchange,currency,price,price_eur:price*rate,datetime:date,validated:true,provider:"Twelve Data"});
          continue;
        }catch(e){primaryError=e instanceof Error?e.message:"Error de Twelve Data";}
      }
      try{
        const q=await yahooFallback(p,ticker,known,expectedIsin,mic,symbol);
        quotes.push({...q,primary_error:primaryError});
      }catch(e){
        const fallbackError=e instanceof Error?e.message:"Yahoo Finance no disponible";
        quotes.push({position_id:id,error:"Twelve Data: "+primaryError+" · Yahoo Finance: "+fallbackError});
      }
    }
    return json({quotes,updated_at:new Date().toISOString(),provider:"Twelve Data + Yahoo Finance"});
  }catch(e){return json({error:e instanceof Error?e.message:"Error interno al obtener cotizaciones"},500);}
});
