const $ = (id) => document.getElementById(id);
const categories = {
  expense: ["Vivienda","Alimentación","Transporte","Ocio","Salud","Compras","Servicios","Educación","Viajes","Suscripciones","Impuestos","Otros gastos"],
  income: ["Nómina","Freelance","Inversiones","Alquileres","Ventas","Regalos","Otros ingresos"]
};
const palette = ["#3d8058","#d7a64b","#6b8eae","#c97b65","#9c88bd","#75aaa1","#d18dba","#9da67a","#b6a18d","#8b9ca9"];
const currency = new Intl.NumberFormat("es-ES", {style:"currency",currency:"EUR"});
let supabase = null, user = null, rows = [], banks = [], positions = [], trades = [], dividends = [], mode = "login", txType = "expense", editId = null, trendChart = null, categoryChart = null, wealthChart = null, toastTimer = null;

function setStatus(text, connected=false) { $("connection-state").textContent = text; $("connection-state").classList.toggle("connected", connected); if (!connected) $("connection-state").innerHTML = "<i></i>" + text; else $("connection-state").innerHTML = "<i></i>" + text; }
function show(id, yes=true) { $(id).classList.toggle("hidden", !yes); }
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
  $("tx-error").textContent="";
  $("save-tx").disabled=false;
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
  const {data,error}=await supabase.from("transactions").select("id,type,amount,description,category,transaction_date,notes,created_at").order("transaction_date",{ascending:false}).order("created_at",{ascending:false});
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
  if(!Number.isFinite(amount)||amount<=0||!description||!date){$("tx-error").textContent="Revisa el importe, la descripción y la fecha.";return;}
  const payload={user_id:user.id,type:txType,amount,description,category:$("tx-category").value,transaction_date:date,notes:$("tx-notes").value.trim()||null};
  $("save-tx").disabled=true; $("save-tx").textContent="Guardando…"; $("tx-error").textContent="";
  try {
    const result=editId ? await supabase.from("transactions").update(payload).eq("id",editId).select().single() : await supabase.from("transactions").insert(payload).select().single();
    if(result.error) throw result.error;
    closeDialog(); await loadTransactions(); toast(editId?"Movimiento actualizado":"Movimiento guardado");
  } catch(e) { $("tx-error").textContent="No se ha podido guardar. Comprueba la conexión y las políticas de seguridad."; console.error(e); }
  finally { $("save-tx").disabled=false; $("save-tx").textContent="Guardar movimiento"; }
}
$("transaction-form").addEventListener("submit",saveTransaction);

async function deleteTransaction(id) {
  if(!confirm("¿Quieres eliminar este movimiento? Esta acción no se puede deshacer.")) return;
  const {error}=await supabase.from("transactions").delete().eq("id",id);
  if(error){toast("No se ha podido eliminar el movimiento.");console.error(error);return;}
  await loadTransactions();toast("Movimiento eliminado");
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
  renderTransactions(filteredRows()); renderCharts(period);
}
function renderTransactions(list) {
  const tbody=$("transactions-body");tbody.replaceChildren();
  $("result-count").textContent=`${list.length} ${list.length===1?"movimiento":"movimientos"}`;
  show("empty-state",list.length===0); $("transactions-section").classList.toggle("has-empty",list.length===0);
  if(!list.length){$("transactions-body").innerHTML="";return;}
  list.forEach(r=>{
    const tr=document.createElement("tr"), isIncome=r.type==="income";
    tr.innerHTML=`<td><div class="movement-cell"><span class="movement-icon">${isIncome?"↗":"↘"}</span><div><div class="movement-title">${escapeHtml(r.description)}</div><div class="movement-subtitle">${r.notes?escapeHtml(r.notes):isIncome?"Ingreso":"Gasto"}</div></div></div></td><td>${new Date(r.transaction_date+"T12:00:00").toLocaleDateString("es-ES")}</td><td><span class="category-pill">${escapeHtml(r.category)}</span></td><td class="align-right amount ${isIncome?"income":"expense"}">${isIncome?"+":"−"}${fmt(r.amount)}</td><td class="align-right"><button class="row-action" data-edit="${escapeHtml(r.id)}" aria-label="Editar movimiento" title="Editar">✎</button><button class="row-action" data-delete="${escapeHtml(r.id)}" aria-label="Eliminar movimiento" title="Eliminar">×</button></td>`;
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
function totalBanks(){return banks.reduce((s,b)=>s+Number(b.balance_eur||0),0)}
function positionValue(p){return Number(p.quantity||0)*Number(p.current_price_eur ?? p.average_cost_eur ?? 0)}
function totalInvestments(){return positions.reduce((s,p)=>s+positionValue(p),0)}
function portfolioCost(){return positions.reduce((s,p)=>s+Number(p.quantity||0)*Number(p.average_cost_eur||0),0)}
function portfolioPnl(){return positions.reduce((s,p)=>s+Number(p.quantity||0)*(Number(p.current_price_eur ?? p.average_cost_eur ?? 0)-Number(p.average_cost_eur||0)),0)}
function realizedPnl(){return trades.reduce((s,t)=>s+Number(t.realized_pnl_eur||0),0)}
function wealthTotal(){return totalBanks()+totalInvestments()}
function share(value,total){return total>0?value/total*100:0}
function setShare(id,barId,value,total){const p=share(value,total);$(id).textContent=`${pct(p)} del patrimonio`;$(barId).style.width=`${Math.min(100,Math.max(0,p))}%`}
function renderWealth(){
  const total=wealthTotal(), bankTotal=totalBanks(), stock=positions.filter(p=>p.asset_type==="stock").reduce((s,p)=>s+positionValue(p),0), etf=positions.filter(p=>["etf","fund"].includes(p.asset_type)).reduce((s,p)=>s+positionValue(p),0), pnl=portfolioPnl(), dividendsNet=dividends.reduce((s,d)=>s+Number(d.net_amount_eur||0),0);
  $("wealth-total").textContent=eur(total);$("wealth-bank-total").textContent=eur(bankTotal);$("wealth-stock-total").textContent=eur(stock);$("wealth-etf-total").textContent=eur(etf);const realized=realizedPnl();const totalPnl=pnl+realized;$("wealth-return").textContent=`${totalPnl>=0?"+":"−"}${eur(Math.abs(totalPnl))}`;$("wealth-return").style.color=totalPnl<0?"#bd654e":"#286b53";$("wealth-return-detail").textContent=`Latente ${eur(pnl)} · Realizada ${eur(realized)}`;
  setShare("wealth-bank-share","bank-share-bar",bankTotal,total);setShare("wealth-stock-share","stock-share-bar",stock,total);setShare("wealth-etf-share","etf-share-bar",etf,total);$("dividend-total").textContent=eur(dividendsNet);
  const tbody=$("banks-body");tbody.replaceChildren();show("banks-empty",banks.length===0);banks.forEach(b=>{const tr=document.createElement("tr");tr.innerHTML=`<td><div class="movement-cell"><span class="movement-icon">▤</span><div><div class="movement-title">${escapeHtml(b.name)}</div><div class="movement-subtitle">Actualizado ${new Date(b.updated_at||b.created_at||Date.now()).toLocaleDateString("es-ES")}</div></div></div></td><td><span class="category-pill">${escapeHtml(b.account_type)}</span></td><td class="align-right amount">${eur(b.balance_eur)}</td><td class="align-right">${pct(share(Number(b.balance_eur),total))}</td><td class="align-right"><button class="row-action" data-bank-edit="${b.id}" title="Editar saldo">✎</button><button class="row-action" data-bank-delete="${b.id}" title="Eliminar cuenta">×</button></td>`;tbody.append(tr)});
  tbody.querySelectorAll("[data-bank-edit]").forEach(btn=>btn.addEventListener("click",()=>editBank(btn.dataset.bankEdit)));tbody.querySelectorAll("[data-bank-delete]").forEach(btn=>btn.addEventListener("click",()=>deleteBank(btn.dataset.bankDelete)));
  const itbody=$("investments-body");itbody.replaceChildren();show("investments-empty",positions.length===0);positions.forEach(p=>{const value=positionValue(p),cost=Number(p.quantity||0)*Number(p.average_cost_eur||0),gain=value-cost,ret=cost>0?gain/cost*100:0;const tr=document.createElement("tr");tr.innerHTML=`<td><div class="movement-cell"><span class="movement-icon">${p.asset_type==="etf"?"◫":"↗"}</span><div><div class="movement-title">${escapeHtml(p.name)}</div><div class="movement-subtitle">${escapeHtml(p.ticker.toUpperCase())}</div></div></div></td><td><span class="category-pill">${assetTypes[p.asset_type]||"Otro"}</span></td><td>${Number(p.quantity).toLocaleString("es-ES",{maximumFractionDigits:6})}</td><td class="align-right">${p.current_price_eur==null?"—":eur(p.current_price_eur)}</td><td class="align-right amount">${eur(value)}</td><td class="align-right"><span class="amount ${gain>=0?"income":"expense"}">${gain>=0?"+":"−"}${eur(Math.abs(gain))} (${pct(ret)})</span></td><td class="align-right"><button class="row-action" data-position-edit="${p.id}" title="Editar">✎</button><button class="row-action" data-position-delete="${p.id}" title="Eliminar">×</button></td>`;itbody.append(tr)});
  itbody.querySelectorAll("[data-position-edit]").forEach(btn=>btn.addEventListener("click",()=>editPosition(btn.dataset.positionEdit)));itbody.querySelectorAll("[data-position-delete]").forEach(btn=>btn.addEventListener("click",()=>deletePosition(btn.dataset.positionDelete)));
  const tradeBody=$("trades-body");tradeBody.replaceChildren();show("trades-empty",trades.length===0);trades.slice(0,12).forEach(t=>{const p=positions.find(x=>x.id===t.position_id);const tr=document.createElement("tr");tr.innerHTML=`<td>${new Date(t.trade_date+"T12:00:00").toLocaleDateString("es-ES")}</td><td>${escapeHtml(p?.name||t.asset_name||"Activo eliminado")}</td><td><span class="category-pill">${tradeTypes[t.trade_type]||t.trade_type}</span></td><td>${Number(t.quantity).toLocaleString("es-ES",{maximumFractionDigits:6})}</td><td class="align-right">${eur(t.price_eur)}</td><td class="align-right amount ${(Number(t.realized_pnl_eur||0)>=0)?"income":"expense"}">${t.trade_type==="sell"?`${Number(t.realized_pnl_eur)>=0?"+":"−"}${eur(Math.abs(Number(t.realized_pnl_eur||0)))}`:"—"}</td>`;tradeBody.append(tr)});
  const db=$("dividend-list");db.replaceChildren();if(!dividends.length)db.innerHTML='<p class="muted">Todavía no hay dividendos registrados.</p>';dividends.slice(0,4).forEach(d=>{const p=positions.find(x=>x.id===d.position_id);const div=document.createElement("div");div.className="dividend-row";div.innerHTML=`<div><strong>${escapeHtml(p?.name||d.asset_name||"Dividendo")}</strong><span>${new Date(d.payment_date+"T12:00:00").toLocaleDateString("es-ES")}</span></div><strong>${eur(d.net_amount_eur)}</strong>`;db.append(div)});
  const legend=$("wealth-legend");legend.replaceChildren();const alloc=[{name:"Bancos y efectivo",value:bankTotal,color:"#398665"},{name:"Acciones",value:stock,color:"#6384c6"},{name:"ETF y fondos",value:etf,color:"#d7a64b"},{name:"Otros activos",value:positions.filter(p=>!["stock","etf","fund"].includes(p.asset_type)).reduce((s,p)=>s+positionValue(p),0),color:"#c97b65"}].filter(x=>x.value>0);
  alloc.forEach(a=>{const el=document.createElement("div");el.className="wealth-legend-item";el.innerHTML=`<span class="legend-dot" style="background:${a.color}"></span><span>${a.name}</span><strong>${pct(share(a.value,total))}</strong>`;legend.append(el)});
  if(wealthChart)wealthChart.destroy();if(window.Chart)wealthChart=new Chart($("wealth-chart"),{type:"doughnut",data:{labels:alloc.map(a=>a.name),datasets:[{data:alloc.map(a=>a.value),backgroundColor:alloc.map(a=>a.color),borderWidth:4,borderColor:"#fff"}]},options:{responsive:true,maintainAspectRatio:false,cutout:"73%",plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.label}: ${eur(c.raw)} (${pct(share(c.raw,total))})`}}}}});
  $("wealth-updated").textContent=`${banks.length} ${banks.length===1?"cuenta":"cuentas"} · ${positions.length} ${positions.length===1?"posición":"posiciones"} · Dividendos netos: ${eur(dividendsNet)}`;
  populatePositionSelects();
}
async function loadWealth(){
  const requests=await Promise.all([supabase.from("bank_accounts").select("*").order("name"),supabase.from("investment_positions").select("*").order("name"),supabase.from("investment_transactions").select("*").order("trade_date",{ascending:false}),supabase.from("dividends").select("*").order("payment_date",{ascending:false})]);
  const names=["bancos","cartera","operaciones","dividendos"];requests.forEach((r,i)=>{if(r.error)throw new Error(`Error al cargar ${names[i]}: ${r.error.message}`)});
  [banks,positions,trades,dividends]=requests.map(r=>r.data||[]);renderWealth();
}
function populatePositionSelects(){["trade-position","dividend-position"].forEach(id=>{const el=$(id),old=el.value;el.replaceChildren();positions.forEach(p=>el.add(new Option(`${p.name} (${p.ticker})`,p.id)));if(positions.some(p=>p.id===old))el.value=old;});$("add-trade").disabled=positions.length===0;$("add-dividend").disabled=positions.length===0;}
function editBank(id){const b=banks.find(x=>x.id===id);if(!b)return;const name=prompt("Nombre de la cuenta:",b.name);if(name===null)return;const bal=prompt("Saldo actual en euros:",b.balance_eur);if(bal===null)return;const kind=prompt("Tipo de cuenta (Cuenta corriente, Ahorro, Efectivo, Depósito, Otro):",b.account_type);if(kind===null)return;saveBank({id,name:name.trim(),balance_eur:Number(bal),account_type:kind.trim()||"Otro"});}
async function saveBank(payload){
  if(!user||!supabase){$("bank-error").textContent="No hay una sesión activa. Inicia sesión y vuelve a intentarlo.";return false;}
  if(!payload.name||!Number.isFinite(payload.balance_eur)){$("bank-error").textContent="Revisa el nombre y el saldo.";return false;}
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
function editPosition(id){const p=positions.find(x=>x.id===id);if(!p)return;const name=prompt("Nombre del activo:",p.name);if(name===null)return;const ticker=prompt("Ticker:",p.ticker);if(ticker===null)return;const qty=prompt("Títulos actuales:",p.quantity);if(qty===null)return;const cost=prompt("Coste medio por título en EUR:",p.average_cost_eur);if(cost===null)return;const type=prompt("Tipo (stock, etf, fund, crypto, other):",p.asset_type);if(type===null)return;savePosition({id,name:name.trim(),ticker:ticker.trim().toUpperCase(),quantity:Number(qty),average_cost_eur:Number(cost),asset_type:assetTypes[type]?type:"other"})}
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
$("add-position").addEventListener("click",()=>{$("position-form").reset();$("asset-error").textContent="";$("position-dialog").showModal()});
$("position-form").addEventListener("submit",async e=>{
  e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]'),oldText=submit.textContent;submit.disabled=true;submit.textContent="Guardando…";$("asset-error").textContent="";
  try {const saved=await savePosition({name:$("asset-name").value.trim(),ticker:$("asset-ticker").value.trim().toUpperCase(),asset_type:$("asset-type").value,quantity:Number($("asset-quantity").value),average_cost_eur:Number($("asset-cost").value)});if(saved){form.reset();$("position-dialog").close();}}
  catch(error){console.error(error);$("asset-error").textContent=`Error inesperado: ${error?.message||error}`;}
  finally{submit.disabled=false;submit.textContent=oldText;}
});
$("add-trade").addEventListener("click",()=>{if(!positions.length)return;$("trade-form").reset();$("trade-date").value=localDate();$("trade-fees").value="0";$("trade-error").textContent="";populatePositionSelects();$("trade-dialog").showModal()});
$("trade-form").addEventListener("submit",async e=>{e.preventDefault();const p=positions.find(x=>x.id===$("trade-position").value),type=$("trade-type").value,qty=Number($("trade-quantity").value),price=Number($("trade-price").value),fees=Number($("trade-fees").value),date=$("trade-date").value;if(!p||qty<=0||price<=0||fees<0||!date){$("trade-error").textContent="Revisa los datos de la operación.";return}const oldQty=Number(p.quantity),oldCost=Number(p.average_cost_eur),newQty=type==="buy"?oldQty+qty:oldQty-qty;if(type==="sell"&&qty>oldQty){$("trade-error").textContent="No puedes vender más títulos de los que tienes.";return}const realized=type==="sell"?(price-oldCost)*qty-fees:0;const nextAvg=type==="buy"?(oldQty*oldCost+qty*price+fees)/(oldQty+qty):oldCost;const {error:tradeError}=await supabase.from("investment_transactions").insert({user_id:user.id,position_id:p.id,trade_type:type,quantity:qty,price_eur:price,fees_eur:fees,trade_date:date,realized_pnl_eur:realized});if(tradeError){$("trade-error").textContent="No se ha podido guardar la operación. Comprueba el SQL.";console.error(tradeError);return}const {error:posError}=await supabase.from("investment_positions").update({quantity:newQty,average_cost_eur:newQty===0?0:nextAvg,updated_at:new Date().toISOString()}).eq("id",p.id);if(posError){toast("La operación se guardó, pero no se actualizó la posición. Revisa el estado de la cartera.");console.error(posError);return}$("trade-dialog").close();await loadWealth();toast(type==="buy"?"Compra registrada":"Venta registrada")});
$("add-dividend").addEventListener("click",()=>{if(!positions.length)return;$("dividend-form").reset();$("dividend-date").value=localDate();$("dividend-tax").value="0";$("dividend-net").value="0";$("dividend-error").textContent="";populatePositionSelects();$("dividend-dialog").showModal()});
$("dividend-gross").addEventListener("input",()=>{$("dividend-net").value=Math.max(0,Number($("dividend-gross").value||0)-Number($("dividend-tax").value||0)).toFixed(2)});$("dividend-tax").addEventListener("input",()=>{$("dividend-net").value=Math.max(0,Number($("dividend-gross").value||0)-Number($("dividend-tax").value||0)).toFixed(2)});
$("dividend-form").addEventListener("submit",async e=>{e.preventDefault();const p=positions.find(x=>x.id===$("dividend-position").value),gross=Number($("dividend-gross").value),tax=Number($("dividend-tax").value),net=Number($("dividend-net").value);if(!p||gross<0||tax<0||net<0||Math.abs(gross-tax-net)>0.02){$("dividend-error").textContent="Comprueba que bruto − retención = neto.";return}const {error}=await supabase.from("dividends").insert({user_id:user.id,position_id:p.id,gross_amount_eur:gross,tax_amount_eur:tax,net_amount_eur:net,payment_date:$("dividend-date").value});if(error){$("dividend-error").textContent="No se ha podido guardar el dividendo. Comprueba el SQL.";console.error(error);return}$("dividend-dialog").close();await loadWealth();toast("Dividendo registrado")});
document.querySelectorAll("[data-close]").forEach(b=>b.addEventListener("click",()=>$(b.dataset.close).close()));
async function refreshQuotes(){if(!positions.length){toast("Añade activos a la cartera primero");return}$("refresh-quotes").disabled=true;$("quote-status").textContent="Actualizando cotizaciones…";try{const {data,error}=await supabase.functions.invoke("get-quotes",{body:{symbols:[...new Set(positions.map(p=>p.ticker.toUpperCase()))]}});if(error)throw error;if(!data?.quotes)throw new Error(data?.error||"La función de cotizaciones no devolvió datos");let updated=0;for(const q of data.quotes){if(!Number.isFinite(Number(q.price_eur)))continue;const p=positions.find(x=>x.ticker.toUpperCase()===q.symbol.toUpperCase());if(!p)continue;const {error:upErr}=await supabase.from("investment_positions").update({current_price_eur:Number(q.price_eur),quote_currency:q.currency||"EUR",quote_updated_at:new Date().toISOString()}).eq("id",p.id);if(!upErr)updated++}await loadWealth();$("quote-status").textContent=`Cotizaciones actualizadas: ${updated}/${positions.length} posiciones · ${new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}`;toast("Cotizaciones actualizadas")}catch(e){console.error(e);$("quote-status").textContent="No se pudieron actualizar las cotizaciones. Configura la función de mercado y su API key.";toast("No se pudieron actualizar cotizaciones")}finally{$("refresh-quotes").disabled=false}}
$("refresh-quotes").addEventListener("click",refreshQuotes);

function exportExcel() {
  if(!window.XLSX){toast("No se ha podido cargar el módulo de Excel.");return;}
  const data=rows.map(r=>({Fecha:r.transaction_date,Tipo:r.type==="income"?"Ingreso":"Gasto",Descripción:r.description,Categoría:r.category,Importe:Number(r.amount),Notas:r.notes||""}));
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
$("add-shortcut").addEventListener("click",()=>{ $("transactions-section").scrollIntoView({behavior:"smooth",block:"start"}); });

async function enterApp(currentUser) {
  user=currentUser; show("auth-view",false);show("app-view",true);show("logout-btn",true);setStatus("Conectado",true);
  $("today-label").textContent=new Date().toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
  if(!$("month-filter").value)$("month-filter").value=localDate().slice(0,7);
  try { await loadTransactions(); await loadWealth(); } catch(e){console.error(e);toast("Error al cargar datos. Ejecuta el SQL actualizado y revisa las políticas RLS.");}
}
async function exitApp() { user=null;rows=[];if(trendChart)trendChart.destroy();if(categoryChart)categoryChart.destroy();show("app-view",false);show("auth-view",true);show("logout-btn",false);setStatus("Sin sesión"); }
$("auth-form").addEventListener("submit", async (e) => {
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      throw error;
    }

    if (!data.user) {
      throw new Error("Supabase no ha devuelto ningún usuario.");
    }

    await enterApp(data.user);

  } catch (error) {
    console.error("Error de inicio de sesión:", error);
    message.textContent =
      error?.message || "No se ha podido iniciar sesión.";
  } finally {
    button.disabled = false;
    button.textContent = mode === "login"
      ? "Entrar a mi espacio"
      : "Crear cuenta";
  }
});
$("logout-btn").addEventListener("click",async()=>{await supabase.auth.signOut();await exitApp();});
$("month-filter").value=localDate().slice(0,7);
populateCategories("expense","tx-category");
async function bootstrap(){
  show("auth-view",true);
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
