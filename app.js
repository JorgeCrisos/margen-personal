const $ = (id) => document.getElementById(id);
const categories = {
  expense: ["Vivienda","Alimentación","Transporte","Ocio","Salud","Compras","Servicios","Educación","Viajes","Suscripciones","Impuestos","Otros gastos"],
  income: ["Nómina","Freelance","Inversiones","Alquileres","Ventas","Regalos","Otros ingresos"]
};
const palette = ["#3d8058","#d7a64b","#6b8eae","#c97b65","#9c88bd","#75aaa1","#d18dba","#9da67a","#b6a18d","#8b9ca9"];
const currency = new Intl.NumberFormat("es-ES", {style:"currency",currency:"EUR"});
const BANK_BALANCE_CUTOFF = "2026-11-01";
let supabase = null, user = null, rows = [], banks = [], positions = [], trades = [], dividends = [], investmentCash = [], wealthSnapshots = [], mode = "login", txType = "expense", editId = null, trendChart = null, categoryChart = null, wealthChart = null, wealthHistoryChart = null, toastTimer = null;
// Vincula el submit inmediatamente, antes del resto de inicialización de la app.
$("auth-form")?.addEventListener("submit", handleAuthSubmit);

function setStatus(text, connected=false) { const markup = "<i></i>" + text; const top = $("connection-state"); if(top){top.innerHTML=markup;top.classList.toggle("connected",connected);} const menu=$("connection-state-menu"); if(menu){menu.innerHTML=markup;menu.classList.toggle("connected",connected);} }
function show(id, yes=true) { const el=$(id); if(!el)return; el.hidden=!yes; el.inert=!yes; el.setAttribute("aria-hidden",String(!yes)); el.classList.toggle("hidden", !yes); if(yes) el.style.removeProperty("display"); else el.style.setProperty("display","none","important"); }
function escapeHtml(value="") { return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function localDate(date=new Date()) { const y=date.getFullYear(), m=String(date.getMonth()+1).padStart(2,"0"), d=String(date.getDate()).padStart(2,"0"); return `${y}-${m}-${d}`; }
function selectedMonth() { return $("month-filter").value; }
function periodRows() { const m=selectedMonth(); return rows.filter(r => !m || r.transaction_date.startsWith(m)); }
function fmt(value) { return currency.format(Number(value)||0); }
function toast(message) { const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }
function setMode(next) { mode=next; document.querySelectorAll(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode)); $("auth-title").textContent=mode==="login"?"Qué bueno verte.":"Crea tu espacio."; $("auth-subtitle").textContent=mode==="login"?"Accede a tu espacio financiero privado.":"Un solo lugar para entender tu dinero."; $("auth-submit").textContent=mode==="login"?"Entrar a mi espacio":"Crear cuenta"; $("auth-password").autocomplete=mode==="login"?"current-password":"new-password"; $("auth-message").textContent=""; }
document.querySelectorAll(".auth-tab").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));

function populateCategories(type, selectId, selected="") {
  const select=$(selectId); select.replaceChildren();
  categories[type].forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;select.append(o);});
  if(selected && categories[type].includes(selected)) select.value=selected;
}
function setTxType(type) {
  txType=type;
  document.querySelectorAll(".type-option").forEach(b=>b.classList.toggle("active",b.dataset.type===type));
  populateCategories(type,"tx-category");
}
function openDialog(row=null) {
  editId=row?.id || null;
  $("dialog-title").textContent=row?"Editar movimiento":"Nuevo movimiento";
  $("tx-amount").value=row?row.amount:"";
  $("tx-description").value=row?.description||"";
  $("tx-date").value=row?.transaction_date||localDate();
  $("tx-notes").value=row?.notes||"";
  setTxType(row?.type||"expense");
  if(row?.category) $("tx-category").value=row.category;
  populateBankSelect(row?.bank_account_id || "");
  $("tx-bank").required=($("tx-date").value>=BANK_BALANCE_CUTOFF);
  $("tx-error").textContent="";
  $("save-tx").disabled=banks.length===0;
  if(!banks.length) $("tx-error").textContent="Primero añade tus cuentas bancarias en la sección Bancos.";
  $("transaction-dialog").showModal();
  $("tx-amount").focus();
}
function closeDialog() { $("transaction-dialog").close(); }
$("add-shortcut").addEventListener("click",()=>openDialog());
$("add-inline").addEventListener("click",()=>openDialog());
$("empty-add").addEventListener("click",()=>openDialog());
$("close-dialog").addEventListener("click",closeDialog);
$("cancel-dialog").addEventListener("click",closeDialog);
document.querySelectorAll(".type-option").forEach(b=>b.addEventListener("click",()=>setTxType(b.dataset.type)));

async function loadTransactions() {
  const {data,error}=await supabase.from("transactions").select("id,type,amount,description,category,transaction_date,notes,created_at,bank_account_id").order("transaction_date",{ascending:false}).order("created_at",{ascending:false});
  if(error) throw error;
  rows=data||[];
  render();
}
async function saveTransaction(event) {
  event.preventDefault();
  if(!user) return;
  const amount=Number($("tx-amount").value);
  const description=$("tx-description").value.trim();
  const date=$("tx-date").value;
  const bankId=$("tx-bank").value;
  if(!Number.isFinite(amount)||amount<=0||!description||!date){$("tx-error").textContent="Revisa el importe, la descripción y la fecha.";return;}
  if(date>=BANK_BALANCE_CUTOFF&&!bankId){$("tx-error").textContent="Selecciona la cuenta bancaria del movimiento.";return;}
  if(date<BANK_BALANCE_CUTOFF&&!editId){$("tx-error").textContent="Los nuevos movimientos deben registrarse desde el 1/11/2026.";return;}
  const payload={user_id:user.id,bank_account_id:bankId||null,type:txType,amount,description,category:$("tx-category").value,transaction_date:date,notes:$("tx-notes").value.trim()||null};
  $("save-tx").disabled=true; $("save-tx").textContent="Guardando…"; $("tx-error").textContent="";
  try {
    const result=editId ? await supabase.from("transactions").update(payload).eq("id",editId).select().single() : await supabase.from("transactions").insert(payload).select().single();
    if(result.error) throw result.error;
    closeDialog(); await loadTransactions(); await loadWealth(); toast(editId?"Movimiento actualizado":"Movimiento guardado");
  } catch(e) { $("tx-error").textContent="No se ha podido guardar. Comprueba la conexión y las políticas de seguridad."; console.error(e); }
  finally { $("save-tx").disabled=false; $("save-tx").textContent="Guardar movimiento"; }
}
$("tx-date").addEventListener("change",()=>{$("tx-bank").required=$("tx-date").value>=BANK_BALANCE_CUTOFF;});
$("transaction-form").addEventListener("submit",saveTransaction);

async function deleteTransaction(id) {
  if(!confirm("¿Quieres eliminar este movimiento? Esta acción no se puede deshacer.")) return;
  const {error}=await supabase.from("transactions").delete().eq("id",id);
  if(error){toast("No se ha podido eliminar el movimiento.");console.error(error);return;}
  await loadTransactions(); await loadWealth(); toast("Movimiento eliminado");
}
function filteredRows() {
  const search=$("search-filter").value.trim().toLowerCase(), type=$("type-filter").value, cat=$("category-filter").value;
  return periodRows().filter(r=>(type==="all"||r.type===type)&&(cat==="all"||r.category===cat)&&(!search||`${r.description} ${r.category} ${r.notes||""}`.toLowerCase().includes(search)));
}
function render() {
  const period=periodRows();
  const income=period.filter(r=>r.type==="income").reduce((a,r)=>a+Number(r.amount),0);
  const expense=period.filter(r=>r.type==="expense").reduce((a,r)=>a+Number(r.amount),0);
  $("metric-income").textContent=fmt(income); $("metric-expense").textContent=fmt(expense);
  $("metric-balance").textContent=fmt(income-expense); $("metric-balance").style.color=income-expense<0?"#bd654e":"#266d4c";
  $("metric-balance-foot").textContent=income-expense<0?"Has gastado más de lo ingresado":"Ingresos menos gastos";
  $("metric-count").textContent=String(period.length);
  const cats=[...new Set(rows.map(r=>r.category))].sort((a,b)=>a.localeCompare(b,"es"));
  const cf=$("category-filter"), old=cf.value; cf.replaceChildren(new Option("Todas las categorías","all")); cats.forEach(c=>cf.add(new Option(c,c))); if(cats.includes(old))cf.value=old;
  renderTransactions(filteredRows()); renderCharts(period); renderForecast(period);
}
function renderForecast(period) {
  const now=new Date(), year=now.getFullYear(), month=now.getMonth(), daysInMonth=new Date(year,month+1,0).getDate();
  const today=now.getDate(), remaining=Math.max(0,daysInMonth-today);
  const monthRows=rows.filter(r=>r.transaction_date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`));
  const income=monthRows.filter(r=>r.type==="income").reduce((s,r)=>s+Number(r.amount),0);
  const expense=monthRows.filter(r=>r.type==="expense").reduce((s,r)=>s+Number(r.amount),0);
  const saving=income-expense, daily=expense/Math.max(1,today), projectedExpense=expense+daily*remaining;
  // No se extrapolan ingresos: los ingresos futuros no registrados no se dan por seguros.
  const projected=income-projectedExpense, rate=income>0?saving/income*100:null;
  $("forecast-income").textContent=fmt(income);$("forecast-expense").textContent=fmt(expense);$("forecast-saving").textContent=fmt(saving);
  $("forecast-projected").textContent=fmt(projected);$("forecast-projected").style.color=projected<0?"#bd654e":"#286b53";
  $("forecast-rate").textContent=rate===null?"—":`${rate.toLocaleString("es-ES",{maximumFractionDigits:1})}%`;
  $("forecast-daily").textContent=fmt(daily);$("forecast-days").textContent=String(remaining);
  const confidence=monthRows.length<5?"Estimación inicial":monthRows.length<12?"Estimación orientativa":"Estimación basada en tus registros";
  $("forecast-confidence").textContent=confidence;
  $("forecast-note").textContent=monthRows.length===0?"Registra tus primeros movimientos para activar la previsión.":`Proyección conservadora: mantiene el ritmo medio de gasto diario y solo cuenta los ingresos ya registrados. ${monthRows.length} movimientos considerados.`;
}

function renderTransactions(list) {
  const tbody=$("transactions-body");tbody.replaceChildren();
  $("result-count").textContent=`${list.length} ${list.length===1?"movimiento":"movimientos"}`;
  show("empty-state",list.length===0); $("transactions-section").classList.toggle("has-empty",list.length===0);
  if(!list.length){$("transactions-body").innerHTML="";return;}
  list.forEach(r=>{
    const tr=document.createElement("tr"), isIncome=r.type==="income", bank=banks.find(b=>b.id===r.bank_account_id);
    tr.innerHTML=`<td><div class="movement-cell"><span class="movement-icon">${isIncome?"↗":"↘"}</span><div><div class="movement-title">${escapeHtml(r.description)}</div><div class="movement-subtitle">${escapeHtml(bank?.name||"Cuenta no asignada")}${r.notes?` · ${escapeHtml(r.notes)}`:""}</div></div></div></td><td>${new Date(r.transaction_date+"T12:00:00").toLocaleDateString("es-ES")}</td><td><span class="category-pill">${escapeHtml(r.category)}</span></td><td class="align-right amount ${isIncome?"income":"expense"}">${isIncome?"+":"−"}${fmt(r.amount)}</td><td class="align-right"><button class="row-action" data-edit="${escapeHtml(r.id)}" aria-label="Editar movimiento" title="Editar">✎</button><button class="row-action" data-delete="${escapeHtml(r.id)}" aria-label="Eliminar movimiento" title="Eliminar">×</button></td>`;
    tbody.append(tr);
  });
  tbody.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>{const row=rows.find(r=>r.id===b.dataset.edit);if(row)openDialog(row);}));
  tbody.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteTransaction(b.dataset.delete)));
}
function renderCharts(period) {
  if(!window.Chart)return;
  const labels=[],income=[],expense=[];
  const now=new Date();now.setDate(1);
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;labels.push(d.toLocaleDateString("es-ES",{month:"short"}));const group=rows.filter(r=>r.transaction_date.startsWith(key));income.push(group.filter(r=>r.type==="income").reduce((s,r)=>s+Number(r.amount),0));expense.push(group.filter(r=>r.type==="expense").reduce((s,r)=>s+Number(r.amount),0));}
  if(trendChart)trendChart.destroy();
  trendChart=new Chart($("trend-chart"),{type:"bar",data:{labels,datasets:[{label:"Ingresos",data:income,backgroundColor:"#3d8058",borderRadius:5,maxBarThickness:22},{label:"Gastos",data:expense,backgroundColor:"#e4b6a7",borderRadius:5,maxBarThickness:22}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{usePointStyle:true,boxWidth:7,font:{family:"DM Sans",size:10},padding:17}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}}},scales:{x:{grid:{display:false},ticks:{font:{family:"DM Sans",size:10}}},y:{beginAtZero:true,grid:{color:"#eef0eb"},ticks:{font:{family:"DM Sans",size:10},callback:v=>v>=1000?`${(v/1000).toLocaleString("es-ES")}k`:v}}}}});
  const expenses=period.filter(r=>r.type==="expense"), byCat={};expenses.forEach(r=>byCat[r.category]=(byCat[r.category]||0)+Number(r.amount));
  const entries=Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,8);
  if(categoryChart)categoryChart.destroy();
  categoryChart=new Chart($("category-chart"),{type:"doughnut",data:{labels:entries.map(x=>x[0]),datasets:[{data:entries.map(x=>x[1]),backgroundColor:entries.map((_,i)=>palette[i%palette.length]),borderWidth:3,borderColor:"#fff",hoverOffset:5}]},options:{responsive:true,maintainAspectRatio:false,cutout:"72%",plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${fmt(c.raw)}`}}}}});
  const legend=$("category-legend");legend.replaceChildren();
  if(!entries.length){legend.innerHTML='<span class="muted">Añade gastos para ver las categorías.</span>';return;}
  entries.forEach(([name,val],i)=>{const div=document.createElement("div");div.className="legend-item";div.innerHTML=`<span class="legend-dot" style="background:${palette[i%palette.length]}"></span><span class="legend-name">${escapeHtml(name)}</span><span class="legend-value">${fmt(val)}</span>`;legend.append(div);});
}
// --- Patrimonio, bancos, cartera, operaciones y dividendos ---
const assetTypes = {stock:"Acción",etf:"ETF",fund:"Fondo",crypto:"Criptoactivo",other:"Otro"};
const tradeTypes = {buy:"Compra",sell:"Venta"};
const pct = n => `${(Number(n)||0).toLocaleString("es-ES",{maximumFractionDigits:1,minimumFractionDigits:1})}%`;
const eur = n => currency.format(Number(n)||0);
function bankMovementDelta(bankId){const ordinary=rows.filter(r=>r.bank_account_id===bankId && r.transaction_date>=BANK_BALANCE_CUTOFF).reduce((sum,r)=>sum+(r.type==="income"?1:-1)*Number(r.amount||0),0);const investment=investmentCash.filter(m=>m.bank_account_id===bankId && m.movement_date>=BANK_BALANCE_CUTOFF).reduce((sum,m)=>sum+Number(m.amount_eur||0),0);return ordinary+investment}
function currentBankBalance(bank){return Number(bank.balance_eur||0)+bankMovementDelta(bank.id)}
function totalBanks(){return banks.reduce((s,b)=>s+currentBankBalance(b),0)}
function positionValue(p){return p.current_price_eur==null?0:Number(p.quantity||0)*Number(p.current_price_eur)}
function totalInvestments(){return positions.reduce((s,p)=>s+positionValue(p),0)}
function portfolioCost(){return positions.reduce((s,p)=>s+Number(p.quantity||0)*Number(p.average_cost_eur||0),0)}
function portfolioPnl(){return positions.reduce((s,p)=>s+(p.current_price_eur==null?0:Number(p.quantity||0)*(Number(p.current_price_eur)-Number(p.average_cost_eur||0))),0)}
function realizedPnl(){return trades.reduce((s,t)=>s+Number(t.realized_pnl_eur||0),0)}
function wealthTotal(){return totalBanks()+totalInvestments()}
function share(value,total){return total>0?value/total*100:0}
function setShare(id,barId,value,total){const p=share(value,total);$(id).textContent=`${pct(p)} del patrimonio`;$(barId).style.width=`${Math.min(100,Math.max(0,p))}%`}
function renderWealth(){
  const total=wealthTotal(), bankTotal=totalBanks(), stock=positions.filter(p=>p.asset_type==="stock").reduce((s,p)=>s+positionValue(p),0), etf=positions.filter(p=>["etf","fund"].includes(p.asset_type)).reduce((s,p)=>s+positionValue(p),0), pnl=portfolioPnl(), dividendsNet=dividends.reduce((s,d)=>s+Number(d.net_amount_eur||0),0);
  $("wealth-total").textContent=eur(total);$("wealth-bank-total").textContent=eur(bankTotal);$("wealth-stock-total").textContent=eur(stock);$("wealth-etf-total").textContent=eur(etf);const realized=realizedPnl();const totalPnl=pnl+realized;$("wealth-return").textContent=`${totalPnl>=0?"+":"−"}${eur(Math.abs(totalPnl))}`;$("wealth-return").style.color=totalPnl<0?"#bd654e":"#286b53";$("wealth-return-detail").textContent=`Latente ${eur(pnl)} · Realizada ${eur(realized)}`;
  setShare("wealth-bank-share","bank-share-bar",bankTotal,total);setShare("wealth-stock-share","stock-share-bar",stock,total);setShare("wealth-etf-share","etf-share-bar",etf,total);$("dividend-total").textContent=eur(dividendsNet);
  const tbody=$("banks-body");tbody.replaceChildren();show("banks-empty",banks.length===0);banks.forEach(b=>{const tr=document.createElement("tr");tr.innerHTML=`<td><div class="movement-cell"><span class="movement-icon">▤</span><div><div class="movement-title">${escapeHtml(b.name)}</div><div class="movement-subtitle">Saldo inicial 01/11/2026 · ${eur(b.balance_eur)}</div></div></div></td><td><span class="category-pill">${escapeHtml(b.account_type)}</span></td><td class="align-right amount">${eur(currentBankBalance(b))}</td><td class="align-right">${pct(share(currentBankBalance(b),total))}</td><td class="align-right"><button class="row-action" data-bank-edit="${b.id}" title="Editar saldo">✎</button><button class="row-action" data-bank-delete="${b.id}" title="Eliminar cuenta">×</button></td>`;tbody.append(tr)});
  tbody.querySelectorAll("[data-bank-edit]").forEach(btn=>btn.addEventListener("click",()=>editBank(btn.dataset.bankEdit)));tbody.querySelectorAll("[data-bank-delete]").forEach(btn=>btn.addEventListener("click",()=>deleteBank(btn.dataset.bankDelete)));
  const itbody=$("investments-body");itbody.replaceChildren();show("investments-empty",positions.length===0);positions.forEach(p=>{const value=positionValue(p),cost=Number(p.quantity||0)*Number(p.average_cost_eur||0),gain=value-cost,ret=cost>0?gain/cost*100:0;const tr=document.createElement("tr");tr.innerHTML=`<td><div class="movement-cell"><span class="movement-icon">${p.asset_type==="etf"?"◫":"↗"}</span><div><div class="movement-title">${escapeHtml(p.name)}</div><div class="movement-subtitle">${escapeHtml(p.ticker.toUpperCase())}${p.exchange?" · "+escapeHtml(p.exchange):""}${p.quote_status==="error"?" · "+escapeHtml(p.quote_error||"Cotización pendiente"):""}</div></div></div></td><td><span class="category-pill">${assetTypes[p.asset_type]||"Otro"}</span></td><td>${Number(p.quantity).toLocaleString("es-ES",{maximumFractionDigits:6})}</td><td class="align-right">${p.current_price_eur==null?"—":eur(p.current_price_eur)}</td><td class="align-right amount">${p.current_price_eur==null?"—":eur(value)}</td><td class="align-right"><span class="amount ${p.current_price_eur==null?"":gain>=0?"income":"expense"}">${p.current_price_eur==null?"Pendiente":`${gain>=0?"+":"−"}${eur(Math.abs(gain))} (${pct(ret)})`}</span></td><td class="align-right"><button class="row-action" data-position-edit="${p.id}" title="Editar">✎</button><button class="row-action" data-position-delete="${p.id}" title="Eliminar">×</button></td>`;itbody.append(tr)});
  itbody.querySelectorAll("[data-position-edit]").forEach(btn=>btn.addEventListener("click",()=>editPosition(btn.dataset.positionEdit)));itbody.querySelectorAll("[data-position-delete]").forEach(btn=>btn.addEventListener("click",()=>deletePosition(btn.dataset.positionDelete)));
  const tradeBody=$("trades-body");tradeBody.replaceChildren();show("trades-empty",trades.length===0);trades.slice(0,12).forEach(t=>{const p=positions.find(x=>x.id===t.position_id);const tr=document.createElement("tr");tr.innerHTML=`<td>${new Date(t.trade_date+"T12:00:00").toLocaleDateString("es-ES")}</td><td>${escapeHtml(p?.name||t.asset_name||"Activo eliminado")}</td><td><span class="category-pill">${tradeTypes[t.trade_type]||t.trade_type}</span></td><td>${Number(t.quantity).toLocaleString("es-ES",{maximumFractionDigits:6})}</td><td class="align-right">${eur(t.price_eur)}</td><td class="align-right amount ${(Number(t.realized_pnl_eur||0)>=0)?"income":"expense"}">${t.trade_type==="sell"?`${Number(t.realized_pnl_eur)>=0?"+":"−"}${eur(Math.abs(Number(t.realized_pnl_eur||0)))}`:"—"}</td>`;tradeBody.append(tr)});
  const db=$("dividend-list");db.replaceChildren();if(!dividends.length)db.innerHTML='<p class="muted">Todavía no hay dividendos registrados.</p>';dividends.slice(0,4).forEach(d=>{const p=positions.find(x=>x.id===d.position_id);const div=document.createElement("div");div.className="dividend-row";div.innerHTML=`<div><strong>${escapeHtml(p?.name||d.asset_name||"Dividendo")}</strong><span>${new Date(d.payment_date+"T12:00:00").toLocaleDateString("es-ES")}</span></div><strong>${eur(d.net_amount_eur)}</strong>`;db.append(div)});
  const legend=$("wealth-legend");legend.replaceChildren();const alloc=[{name:"Bancos y efectivo",value:bankTotal,color:"#398665"},{name:"Acciones",value:stock,color:"#6384c6"},{name:"ETF y fondos",value:etf,color:"#d7a64b"},{name:"Otros activos",value:positions.filter(p=>!["stock","etf","fund"].includes(p.asset_type)).reduce((s,p)=>s+positionValue(p),0),color:"#c97b65"}].filter(x=>x.value>0);
  alloc.forEach(a=>{const el=document.createElement("div");el.className="wealth-legend-item";el.innerHTML=`<span class="legend-dot" style="background:${a.color}"></span><span>${a.name}</span><strong>${pct(share(a.value,total))}</strong>`;legend.append(el)});
  if(wealthChart)wealthChart.destroy();if(window.Chart)wealthChart=new Chart($("wealth-chart"),{type:"doughnut",data:{labels:alloc.map(a=>a.name),datasets:[{data:alloc.map(a=>a.value),backgroundColor:alloc.map(a=>a.color),borderWidth:4,borderColor:"#fff"}]},options:{responsive:true,maintainAspectRatio:false,cutout:"73%",plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${eur(c.raw)} (${pct(share(c.raw,total))})`}}}}});
  $("wealth-updated").textContent=`${banks.length} ${banks.length===1?"cuenta":"cuentas"} · ${positions.length} ${positions.length===1?"posición":"posiciones"} · Dividendos netos: ${eur(dividendsNet)}`;
  populatePositionSelects();
}
async function loadWealthSnapshots() {
  const {data,error}=await supabase.from("wealth_snapshots").select("snapshot_date,bank_total_eur,investment_total_eur,net_worth_eur").order("snapshot_date",{ascending:true}).limit(400);
  if(error) { console.warn("No se pudo cargar el histórico de patrimonio:",error.message); wealthSnapshots=[]; return; }
  wealthSnapshots=data||[];
}
async function saveWealthSnapshot() {
  const snapshot_date=localDate(), bank_total_eur=Number(totalBanks().toFixed(2)), investment_total_eur=Number(totalInvestments().toFixed(2));
  const payload={user_id:user.id,snapshot_date,bank_total_eur,investment_total_eur,net_worth_eur:Number((bank_total_eur+investment_total_eur).toFixed(2))};
  const {error}=await supabase.from("wealth_snapshots").upsert(payload,{onConflict:"user_id,snapshot_date"});
  if(error) console.warn("No se pudo guardar la fotografía patrimonial:",error.message);
  else { const existing=wealthSnapshots.findIndex(x=>x.snapshot_date===snapshot_date); if(existing>=0)wealthSnapshots[existing]=payload;else wealthSnapshots.push(payload); }
}
function renderWealthHistory() {
  const canvas=$("wealth-history-chart"); if(!canvas||!window.Chart)return;
  if(wealthHistoryChart)wealthHistoryChart.destroy();
  const recent=wealthSnapshots.slice(-365), labels=recent.map(x=>new Date(x.snapshot_date+"T12:00:00").toLocaleDateString("es-ES",{day:"2-digit",month:"short"}));
  if(!recent.length){$("wealth-history-note").textContent="Aún no hay fotografías guardadas. Se generará una automáticamente cada día que abras la aplicación.";return;}
  wealthHistoryChart=new Chart(canvas,{type:"line",data:{labels,datasets:[{label:"Patrimonio neto",data:recent.map(x=>Number(x.net_worth_eur)),borderColor:"#398665",backgroundColor:"rgba(57,134,101,.12)",fill:true,tension:.25,pointRadius:recent.length>40?0:2,pointHoverRadius:5}]},options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:"index"},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`Patrimonio: ${fmt(c.raw)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8,font:{size:10}}},y:{grid:{color:"#eef0eb"},ticks:{callback:v=>`${(v/1000).toLocaleString("es-ES")}k €`}}}}});
  $("wealth-history-note").textContent=`${recent.length} fotografías guardadas. El histórico comienza el ${new Date(recent[0].snapshot_date+"T12:00:00").toLocaleDateString("es-ES")}; los datos anteriores no se reconstruyen artificialmente.`;
}
async function loadWealth(){
  const requests=await Promise.all([supabase.from("bank_accounts").select("*").order("name"),supabase.from("investment_positions").select("*").order("name"),supabase.from("investment_transactions").select("*").order("trade_date",{ascending:false}),supabase.from("dividends").select("*").order("payment_date",{ascending:false}),supabase.from("investment_cash_movements").select("*").order("movement_date",{ascending:false})]);
  const names=["bancos","cartera","operaciones","dividendos","movimientos de efectivo de inversiones"];requests.forEach((r,i)=>{if(r.error)throw new Error(`Error al cargar ${names[i]}: ${r.error.message}`)});
  [banks,positions,trades,dividends,investmentCash]=requests.map(r=>r.data||[]);
  await loadWealthSnapshots();
  await saveWealthSnapshot();
  renderWealth();renderWealthHistory();populateBankSelect($("tx-bank")?.value||"");render();
}
function populateBankSelect(selected=""){const el=$("tx-bank");if(!el)return;el.replaceChildren(new Option("Selecciona un banco…",""));banks.forEach(b=>el.add(new Option(`${b.name} · ${eur(currentBankBalance(b))}`,b.id)));if(banks.some(b=>b.id===selected))el.value=selected;else if(banks.length===1)el.value=banks[0].id;$("save-tx").disabled=banks.length===0;}
function populatePositionSelects(){["trade-position","dividend-position"].forEach(id=>{const el=$(id),old=el.value;el.replaceChildren();positions.forEach(p=>el.add(new Option(`${p.name} (${p.ticker})`,p.id)));if(positions.some(p=>p.id===old))el.value=old;});["trade-bank","dividend-bank"].forEach(id=>{const el=$(id),old=el.value;el.replaceChildren(new Option("Selecciona una cuenta…",""));banks.forEach(b=>el.add(new Option(`${b.name} · ${eur(currentBankBalance(b))}`,b.id)));if(banks.some(b=>b.id===old))el.value=old;else if(banks.length===1)el.value=banks[0].id;});$("add-trade").disabled=positions.length===0;$("add-dividend").disabled=positions.length===0;}
function editBank(id){const b=banks.find(x=>x.id===id);if(!b)return;const name=prompt("Nombre de la cuenta:",b.name);if(name===null)return;const bal=prompt("Saldo inicial a 01/11/2026 en euros (no el saldo actual):",b.balance_eur);if(bal===null)return;const kind=prompt("Tipo de cuenta (Cuenta corriente, Ahorro, Efectivo, Depósito, Otro):",b.account_type);if(kind===null)return;saveBank({id,name:name.trim(),balance_eur:Number(bal),account_type:kind.trim()||"Otro"});}
async function saveBank(payload){
  if(!user||!supabase){$("bank-error").textContent="No hay una sesión activa. Inicia sesión y vuelve a intentarlo.";return false;}
  if(!payload.name||!Number.isFinite(payload.balance_eur)){$("bank-error").textContent="Revisa el nombre y el saldo inicial.";return false;}
  const {id,...fields}=payload;
  try {
    const {error}=await (id
      ?supabase.from("bank_accounts").update({...fields,updated_at:new Date().toISOString()}).eq("id",id)
      :supabase.from("bank_accounts").insert({...fields,user_id:user.id}));
    if(error)throw error;
    await loadWealth();
    toast("Cuenta bancaria guardada");
    return true;
  } catch(error) {
    console.error("Error guardando cuenta bancaria:",error);
    $("bank-error").textContent=error?.message
      ?`No se ha podido guardar: ${error.message}`
      :"No se ha podido guardar la cuenta. Comprueba la conexión y los permisos de Supabase.";
    return false;
  }
}
async function deleteBank(id){if(!confirm("¿Eliminar esta cuenta bancaria?"))return;const {error}=await supabase.from("bank_accounts").delete().eq("id",id);if(error){toast("No se ha podido eliminar la cuenta");return}await loadWealth()}
function openBank(){["bank-name","bank-balance"].forEach(id=>$(id).value="");$("bank-kind").value="Cuenta corriente";$("bank-error").textContent="";$("bank-dialog").showModal()}
$("add-bank").addEventListener("click",openBank);
$("bank-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const form=e.currentTarget, submit=form.querySelector('button[type="submit"]');
  const originalText=submit.textContent;
  submit.disabled=true;submit.textContent="Guardando…";$("bank-error").textContent="";
  try {
    const saved=await saveBank({name:$("bank-name").value.trim(),account_type:$("bank-kind").value,balance_eur:Number($("bank-balance").value)});
    if(saved){form.reset();$("bank-dialog").close();}
  } catch(error) {
    console.error("Error al guardar cuenta:",error);
    $("bank-error").textContent="Ha ocurrido un error inesperado. No se ha cerrado el formulario.";
  } finally {
    submit.disabled=false;submit.textContent=originalText;
  }
});
function openPositionDialog(p=null){
  const form=$("position-form");form.reset();$("asset-error").textContent="";
  $("position-dialog").dataset.editId=p?.id||"";
  $("position-dialog").querySelector("h2").textContent=p?"Editar activo":"Añadir activo";
  $("asset-name").value=p?.name||"";$("asset-ticker").value=p?.ticker||"";$("asset-type").value=p?.asset_type||"stock";
  $("asset-isin").value=p?.isin||"";$("asset-mic").value=p?.mic_code||"";$("asset-exchange").value=p?.exchange||"";$("asset-provider-symbol").value=p?.provider_symbol||"";
  $("asset-quantity").value=p?.quantity??"";$("asset-cost").value=p?.average_cost_eur??"";
  $("position-dialog").showModal();
}
function editPosition(id){const p=positions.find(x=>x.id===id);if(p)openPositionDialog(p)}
async function savePosition(payload){
  if(!supabase||!user){$("asset-error").textContent="Tu sesión no está activa. Vuelve a iniciar sesión.";return false;}
  if(!payload.name||!payload.ticker||!Number.isFinite(payload.quantity)||payload.quantity<=0||!Number.isFinite(payload.average_cost_eur)||payload.average_cost_eur<0){$("asset-error").textContent="Revisa el nombre, ticker, cantidad y coste medio.";return false;}
  const {id,...fields}=payload;const body={...fields,updated_at:new Date().toISOString()};
  try {
    const {error}=await (id?supabase.from("investment_positions").update(body).eq("id",id):supabase.from("investment_positions").insert({...body,user_id:user.id,current_price_eur:null}));
    if(error) throw error;
    await loadWealth();toast("Activo guardado");return true;
  } catch(error) {
    console.error("Error guardando activo:",error);
    $("asset-error").textContent=`No se ha podido guardar el activo: ${error?.message||"error desconocido"}`;
    return false;
  }
}
async function deletePosition(id){if(!confirm("Eliminar este activo también puede afectar a la vista de su historial. ¿Continuar?"))return;const {error}=await supabase.from("investment_positions").delete().eq("id",id);if(error){toast("No se ha podido eliminar el activo");return}await loadWealth()}
$("add-position").addEventListener("click",()=>openPositionDialog());
$("position-form").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]'),oldText=submit.textContent;submit.disabled=true;submit.textContent="Guardando…";$("asset-error").textContent="";
  try {
    const editId=$("position-dialog").dataset.editId||null;
    const saved=await savePosition({id:editId||undefined,name:$("asset-name").value.trim(),ticker:$("asset-ticker").value.trim().toUpperCase(),asset_type:$("asset-type").value,isin:$("asset-isin").value.trim().toUpperCase()||null,mic_code:$("asset-mic").value.trim().toUpperCase()||null,exchange:$("asset-exchange").value.trim()||null,provider_symbol:$("asset-provider-symbol").value.trim().toUpperCase()||null,quantity:Number($("asset-quantity").value),average_cost_eur:Number($("asset-cost").value)});
    if(saved){form.reset();$("position-dialog").close();}
  } catch(error){console.error(error);$("asset-error").textContent=`Error inesperado: ${error?.message||error}`;}
  finally{submit.disabled=false;submit.textContent=oldText;}
});
async function refreshQuotes(){
  if(!positions.length){toast("Añade activos a la cartera primero");return}
  $("refresh-quotes").disabled=true;
  $("quote-status").textContent=`Consultando ${positions.length} activos por bloques…`;
  try{
    const payload=positions.map(p=>({id:p.id,name:p.name,ticker:p.ticker,isin:p.isin||null,mic_code:p.mic_code||null,exchange:p.exchange||null,provider_symbol:p.provider_symbol||null,asset_type:p.asset_type}));
    const quotes=[];
    const batchSize=30;
    for(let start=0;start<payload.length;start+=batchSize){
      const batch=payload.slice(start,start+batchSize);
      $("quote-status").textContent=`Consultando activos ${start+1}–${start+batch.length} de ${payload.length}…`;
      try{
        const {data,error}=await supabase.functions.invoke("get-quotes",{body:{positions:batch}});
        if(error)throw error;
        if(!Array.isArray(data?.quotes))throw new Error(data?.error||"Respuesta de cotizaciones no válida");
        quotes.push(...data.quotes);
      }catch(batchError){
        const reason=batchError?.message||"No se pudo consultar este bloque";
        batch.forEach(p=>quotes.push({position_id:p.id,error:reason}));
      }
    }
    let updated=0;const problems=[];
    for(const q of quotes){
      const p=positions.find(x=>x.id===q.position_id);if(!p)continue;
      if(Number.isFinite(Number(q.price_eur))&&Number(q.price_eur)>0&&q.validated===true){
        const patch={current_price_eur:Number(q.price_eur),quote_currency:q.currency,quote_updated_at:new Date().toISOString(),quote_provider:"Twelve Data",quote_datetime:q.datetime||null,quote_status:"ok",quote_error:null,provider_symbol:q.symbol||p.provider_symbol,mic_code:q.mic_code||p.mic_code,exchange:q.exchange||p.exchange};
        const {error:upErr}=await supabase.from("investment_positions").update(patch).eq("id",p.id);
        if(upErr){problems.push(p.ticker+": no se pudo guardar el precio");continue}updated++;
      }else{
        const reason=q.error||"Cotización no validada";
        await supabase.from("investment_positions").update({quote_status:"error",quote_error:reason}).eq("id",p.id);
        problems.push(p.ticker+": "+reason);
      }
    }
    await loadWealth();
    $("quote-status").textContent=problems.length?`Actualizadas ${updated}/${positions.length}. Pendientes: ${problems.join(" · ")}`:`Cotizaciones verificadas: ${updated}/${positions.length} · ${new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`;
    toast(problems.length?"Actualización parcial: revisa los avisos":"Cotizaciones verificadas correctamente");
  }catch(e){console.error(e);$("quote-status").textContent="Error al consultar cotizaciones: "+(e.message||"comprueba la función y la API key");toast("No se pudieron actualizar las cotizaciones")}
  finally{$("refresh-quotes").disabled=false}
}
$("refresh-quotes").addEventListener("click",refreshQuotes);

$("add-trade").addEventListener("click",()=>{if(!positions.length)return;$("trade-form").reset();$("trade-date").value=localDate();$("trade-fees").value="0";$("trade-post-cash").checked=true;$("trade-error").textContent="";populatePositionSelects();$("trade-bank").required=true;$("trade-dialog").showModal()});
$("trade-post-cash").addEventListener("change",()=>{$("trade-bank").required=$("trade-post-cash").checked;});
$("trade-form").addEventListener("submit",async e=>{e.preventDefault();const p=positions.find(x=>x.id===$("trade-position").value),type=$("trade-type").value,qty=Number($("trade-quantity").value),price=Number($("trade-price").value),fees=Number($("trade-fees").value),date=$("trade-date").value,postCash=$("trade-post-cash").checked,bankId=$("trade-bank").value;if(!p||!["buy","sell"].includes(type)||!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(fees)||fees<0||!date){$("trade-error").textContent="Revisa los datos de la operación.";return}if(date<BANK_BALANCE_CUTOFF){$("trade-error").textContent="Registra operaciones nuevas desde el 01/11/2026 para no alterar saldos iniciales.";return}if(postCash&&!bankId){$("trade-error").textContent="Selecciona la cuenta bancaria o desmarca el registro del efectivo si ya está incluido.";return}const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Guardando…";try{const {error}=await supabase.rpc("record_investment_trade",{p_position_id:p.id,p_bank_account_id:postCash?bankId:null,p_trade_type:type,p_quantity:qty,p_price_eur:price,p_fees_eur:fees,p_trade_date:date,p_post_cash:postCash});if(error)throw error;$("trade-dialog").close();await loadTransactions();await loadWealth();toast(type==="buy"?"Compra registrada":"Venta registrada");}catch(err){$("trade-error").textContent=err.message||"No se pudo guardar la operación; no se han aplicado cambios parciales.";console.error(err)}finally{submit.disabled=false;submit.textContent="Guardar operación"}});
$("add-dividend").addEventListener("click",()=>{if(!positions.length)return;$("dividend-form").reset();$("dividend-date").value=localDate();$("dividend-tax").value="0";$("dividend-net").value="0";$("dividend-post-cash").checked=true;$("dividend-error").textContent="";populatePositionSelects();$("dividend-bank").required=true;$("dividend-dialog").showModal()});
$("dividend-post-cash").addEventListener("change",()=>{$("dividend-bank").required=$("dividend-post-cash").checked;});
$("dividend-gross").addEventListener("input",()=>{$("dividend-net").value=Math.max(0,Number($("dividend-gross").value||0)-Number($("dividend-tax").value||0)).toFixed(2)});$("dividend-tax").addEventListener("input",()=>{$("dividend-net").value=Math.max(0,Number($("dividend-gross").value||0)-Number($("dividend-tax").value||0)).toFixed(2)});
$("dividend-form").addEventListener("submit",async e=>{e.preventDefault();const p=positions.find(x=>x.id===$("dividend-position").value),gross=Number($("dividend-gross").value),tax=Number($("dividend-tax").value),net=Number($("dividend-net").value),date=$("dividend-date").value,postCash=$("dividend-post-cash").checked,bankId=$("dividend-bank").value;if(!p||!Number.isFinite(gross)||gross<0||!Number.isFinite(tax)||tax<0||!Number.isFinite(net)||net<0||Math.abs(gross-tax-net)>0.02||!date){$("dividend-error").textContent="Comprueba bruto − retención = neto y la fecha.";return}if(date<BANK_BALANCE_CUTOFF){$("dividend-error").textContent="Registra dividendos nuevos desde el 01/11/2026.";return}if(postCash&&!bankId){$("dividend-error").textContent="Selecciona la cuenta donde se ha cobrado o desmarca el registro si ya está incluido.";return}const submit=e.currentTarget.querySelector('button[type="submit"]');submit.disabled=true;submit.textContent="Guardando…";try{const {error}=await supabase.rpc("record_investment_dividend",{p_position_id:p.id,p_bank_account_id:postCash?bankId:null,p_gross_eur:gross,p_tax_eur:tax,p_net_eur:net,p_payment_date:date,p_post_cash:postCash});if(error)throw error;$("dividend-dialog").close();await loadTransactions();await loadWealth();toast("Dividendo registrado");}catch(err){$("dividend-error").textContent=err.message||"No se pudo guardar el dividendo; no se han aplicado cambios parciales.";console.error(err)}finally{submit.disabled=false;submit.textContent="Guardar dividendo"}});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
async function refreshQuotes(){if(!positions.length){toast("Añade activos a la cartera primero");return}$("refresh-quotes").disabled=true;$("quote-status").textContent="Actualizando cotizaciones…";try{const {data,error}=await supabase.functions.invoke("get-quotes",{body:{symbols:[...new Set(positions.map(p=>p.ticker.toUpperCase()))]}});if(error)throw error;if(!data?.quotes)throw new Error(data?.error||"La función de cotizaciones no devolvió datos");let updated=0;for(const q of data.quotes){if(!Number.isFinite(Number(q.price_eur)))continue;const p=positions.find(x=>x.ticker.toUpperCase()===q.symbol.toUpperCase());if(!p)continue;const {error:upErr}=await supabase.from("investment_positions").update({current_price_eur:Number(q.price_eur),quote_currency:q.currency||"EUR",quote_updated_at:new Date().toISOString()}).eq("id",p.id);if(!upErr)updated++}await loadWealth();$("quote-status").textContent=`Cotizaciones actualizadas: ${updated}/${positions.length} posiciones · ${new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`;toast("Cotizaciones actualizadas")}catch(e){console.error(e);$("quote-status").textContent="No se pudieron actualizar las cotizaciones. Configura la función de mercado y su API key.";toast("No se pudieron actualizar cotizaciones")}finally{$("refresh-quotes").disabled=false}}
$("refresh-quotes").addEventListener("click",refreshQuotes);

function exportExcel() {
  if(!window.XLSX){toast("No se ha podido cargar el módulo de Excel.");return;}
  const data=rows.map(r=>({Fecha:r.transaction_date,Tipo:r.type==="income"?"Ingreso":"Gasto",Banco:banks.find(b=>b.id===r.bank_account_id)?.name||"Sin asignar",Descripción:r.description,Categoría:r.category,Importe:Number(r.amount),Notas:r.notes||""}));
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(data);
  ws["!cols"]=[{wch:14},{wch:12},{wch:32},{wch:20},{wch:15},{wch:40}];
  XLSX.utils.book_append_sheet(wb,ws,"Movimientos");
  if(banks.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(banks.map(b=>({Banco:b.name,Tipo:b.account_type,SaldoEUR:Number(b.balance_eur)}))),"Bancos");
  if(positions.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(positions.map(p=>({Activo:p.name,Ticker:p.ticker,Tipo:assetTypes[p.asset_type],Titulos:Number(p.quantity),CosteMedioEUR:Number(p.average_cost_eur),PrecioActualEUR:p.current_price_eur==null?null:Number(p.current_price_eur),ValorActualEUR:positionValue(p),RentabilidadLatenteEUR:Number(p.quantity)*(Number(p.current_price_eur??p.average_cost_eur)-Number(p.average_cost_eur))}))),"Cartera");
  if(trades.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(trades.map(t=>({Fecha:t.trade_date,Activo:positions.find(p=>p.id===t.position_id)?.name||"Activo",Operacion:tradeTypes[t.trade_type],Titulos:Number(t.quantity),PrecioEUR:Number(t.price_eur),ComisionesEUR:Number(t.fees_eur),ResultadoRealizadoEUR:Number(t.realized_pnl_eur||0)}))),"Operaciones");
  if(dividends.length)XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(dividends.map(d=>({Fecha:d.payment_date,Activo:positions.find(p=>p.id===d.position_id)?.name||"Activo",BrutoEUR:Number(d.gross_amount_eur),RetencionEUR:Number(d.tax_amount_eur),NetoEUR:Number(d.net_amount_eur)}))),"Dividendos");
  const totals=[["Resumen","Importe (€)"],["Ingresos",rows.filter(r=>r.type==="income").reduce((a,r)=>a+Number(r.amount),0)],["Gastos",rows.filter(r=>r.type==="expense").reduce((a,r)=>a+Number(r.amount),0)],["Balance",rows.reduce((a,r)=>a+(r.type==="income"?1:-1)*Number(r.amount),0)]];
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(totals),"Resumen");
  XLSX.writeFile(wb,`margen-personal-${localDate()}.xlsx`);
  toast("Exportación preparada");
}
$("export-btn").addEventListener("click",exportExcel);
["month-filter","search-filter","type-filter","category-filter"].forEach(id=>$(id).addEventListener(id==="month-filter"?"change":"input",render));
$("all-periods").addEventListener("click",()=>{$("month-filter").value="";render();});

async function enterApp(currentUser) {
  if(!currentUser) throw new Error("Supabase no ha confirmado una sesión válida.");
  user=currentUser;
  // Mantiene las dos vistas mutuamente excluyentes incluso si hay CSS/PWA antiguo en caché.
  show("auth-view",false);
  show("app-view",true);
  show("app-load-error",false);
  show("logout-btn",true);
  setStatus("Conectado",true);
  $("today-label").textContent=new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
  if(!$("month-filter").value)$("month-filter").value=localDate().slice(0,7);
  try {
    await loadTransactions();
    await loadWealth();
  } catch(e) {
    console.error("Error cargando los datos del usuario:",e);
    const panel=$("app-load-error");
    if(panel) {
      panel.textContent="Has iniciado sesión, pero no se han podido cargar tus datos. No se ha borrado nada. Detalle: "+(e?.message||"error desconocido")+". Comprueba la migración SQL y las políticas RLS de Supabase.";
      show("app-load-error",true);
    } else {
      toast("Sesión iniciada, pero ha fallado la carga de datos. No se ha borrado nada.");
    }
  }
}
async function exitApp() {
  if(typeof closeUserMenu==="function")closeUserMenu();
  user=null;rows=[];
  if(trendChart)trendChart.destroy();
  if(categoryChart)categoryChart.destroy();
  if(wealthHistoryChart)wealthHistoryChart.destroy();
  show("app-view",false);
  show("auth-view",true);
  show("app-load-error",false);
  show("logout-btn",false);
  setStatus("Sin sesión");
}
async function handleAuthSubmit(e) {
  e.preventDefault();

  const button = $("auth-submit");
  const message = $("auth-message");
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  button.disabled = true;
  button.textContent = "Conectando…";
  message.textContent = "";
  message.style.color = "#b45340";

  try {
    if (!supabase) {
      throw new Error(
        "Supabase no está conectado. Comprueba la configuración y recarga la página."
      );
    }

    if (!email || !password) {
      throw new Error("Introduce tu correo electrónico y contraseña.");
    }

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.href.split("#")[0] }
      });
      if (error) throw error;

      if (data.session && data.user) {
        await enterApp(data.user);
      } else {
        message.style.color = "#286b53";
        message.textContent = "Cuenta creada. Revisa tu correo para confirmar la dirección y después inicia sesión.";
        setMode("login");
        message.style.color = "#286b53";
        message.textContent = "Cuenta creada. Revisa tu correo para confirmar la dirección y después inicia sesión.";
      }
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.user) throw new Error("Supabase no ha devuelto ningún usuario.");
    await enterApp(data.user);

  } catch (error) {
    console.error("Error de inicio de sesión:", error);
    show("app-view",false);
    show("auth-view",true);
    message.style.color = "#b45340";
    message.textContent = error?.message || (mode === "signup"
      ? "No se ha podido crear la cuenta."
      : "No se ha podido iniciar sesión.");
  } finally {
    button.disabled = false;
    button.textContent = mode === "login"
      ? "Entrar a mi espacio"
      : "Crear cuenta";
  }
}
function closeUserMenu(){
  const panel=$("user-menu-panel");
  if(!panel)return;
  panel.classList.add("hidden");
  panel.setAttribute("aria-hidden","true");
  $("user-menu-toggle").setAttribute("aria-expanded","false");
}
$("user-menu-toggle").addEventListener("click",()=>{
  const panel=$("user-menu-panel"), opening=panel.classList.contains("hidden");
  panel.classList.toggle("hidden",!opening);
  panel.setAttribute("aria-hidden",String(!opening));
  $("user-menu-toggle").setAttribute("aria-expanded",String(opening));
});
document.addEventListener("click",event=>{
  if(!event.target.closest(".user-menu")){
    closeUserMenu();
  }
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape") closeUserMenu();
});
$("logout-btn").addEventListener("click",async()=>{
  closeUserMenu();
  const button=$("logout-btn");
  button.disabled=true;
  try {
    if(supabase){const {error}=await supabase.auth.signOut();if(error)throw error;}
    await exitApp();
  } catch(error) {
    console.error("Error cerrando sesión:",error);
    toast("No se ha podido cerrar la sesión.");
  } finally { button.disabled=false; }
});
$("month-filter").value=localDate().slice(0,7);
populateCategories("expense","tx-category");
async function bootstrap(){
  // Estado cerrado por defecto: nunca renderizar el dashboard sin sesión validada.
  show("app-view",false);
  show("auth-view",true);
  show("app-load-error",false);
  setStatus("Iniciando…");
  try {
    const config = await import("./config.js");
    const SUPABASE_URL = config.SUPABASE_URL;
    const SUPABASE_ANON_KEY = config.SUPABASE_ANON_KEY;
    if(!SUPABASE_URL||!SUPABASE_ANON_KEY||String(SUPABASE_URL).includes("TU-PROYECTO")||String(SUPABASE_ANON_KEY).includes("TU_CLAVE")){
      show("setup-notice",true);setStatus("Falta configuración");
      $("auth-message").textContent="Falta configurar Supabase en config.js. La pantalla de acceso está disponible, pero no se puede iniciar sesión hasta corregirlo.";
      return;
    }
    const {createClient}=await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    setStatus("Conectando…");
    supabase.auth.onAuthStateChange((event,session)=>{if(event==="SIGNED_OUT")exitApp();});
    const {data:{session},error}=await supabase.auth.getSession();
    if(error)throw error;
    if(session) await enterApp(session.user);
    else {show("auth-view",true);setStatus("Sin sesión");}
  } catch(e) {
    console.error("Error iniciando Margen Personal:",e);
    show("auth-view",true);setStatus("Error de conexión");
    $("auth-message").textContent=`No se ha podido iniciar la conexión: ${e?.message||"comprueba config.js y tu conexión a Internet"}`;
  }
}
bootstrap();


// Registra la PWA para permitir instalación y actualización controlada del shell.
if ("serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=32", { scope: "./", updateViaCache: "none" }).then(registration => registration.update())
      .catch(error => console.warn("No se pudo registrar el service worker:", error));
  }, { once: true });
}
