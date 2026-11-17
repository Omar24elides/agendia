/* ==================================================================
   js/views/caja.js
   Propósito : Pagos y caja: registrar pagos, totales por día, mes y año.
   Depende de: state.js, ui.js
   La usan   : render.js, paquetes.js
   ================================================================== */
/* ---- pagos y caja (etapa 3) ---- */
const SYM = {EUR: "€", USD: "US$", VES: "Bs"}, METH = {efectivo: "Efectivo", zelle: "Zelle", pago_movil: "Pago Móvil", transferencia: "Transferencia", tarjeta: "Tarjeta", otro: "Otro"};
const fmtM = (n, c) => m2(n) + " " + (SYM[c] || c);
const payOf = p => D.pay.filter(x => x.client_package_id === p.id).reduce((t, x) => t + Number(x.base_amount), 0);
function payForm(id) {
  const p = id && D.p.find(x => x.id === id), opt = o => Object.entries(o).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  modal("Registrar pago", `<form class="f" onsubmit="savePay(event,'${id || ""}');return false">
  ${p ? `<p style="margin:0"><b>${esc(cn(p.client_id))}</b> · ${esc(sn(p.service_id))}</p>` : `<label>Clienta (opcional)<select name="client"><option value="">—</option>${clientOpts()}</select></label>`}
  <div class="f2"><label>Monto<input name="amt" data-num="dec" inputmode="decimal" required></label><label>Moneda<select name="cur">${opt({EUR: "€ Euro", USD: "US$ Dólar", VES: "Bs Bolívar"}).replace(`value="${T.currency}"`, `value="${T.currency}" selected`)}</select></label></div>
  <label>Tasa del día (solo si la moneda es distinta a ${T.currency}: cuántas unidades de la moneda pagada equivalen a 1 ${T.currency})<input name="rate" data-num="dec" inputmode="decimal"></label>
  <label>Método<select name="method">${opt(METH)}</select></label><label>Nota (opcional)<input name="note" maxlength="200"></label><button>Guardar pago</button></form>`);
}
function savePay(e, id) {
  const f = new FormData(e.target), amt = +f.get("amt"), c = f.get("cur"), rate = +f.get("rate"), p = id && D.p.find(x => x.id === id);
  if (!(amt > 0 && amt <= 1e7)) return toast("Monto inválido", 1);
  if (c !== T.currency && !(rate > 0)) return toast("Indica la tasa del día para convertir a " + T.currency, 1);
  run(sb.from("payments").insert({ tenant_id: T.id, client_id: p ? p.client_id : f.get("client") || null, client_package_id: p ? p.id : null, amount: amt, currency: c, rate: c === T.currency ? 1 : rate,
    base_amount: c === T.currency ? amt : +(amt / rate).toFixed(2), method: f.get("method"), note: f.get("note").trim() || null }), "Pago registrado");
}
let pv = "day", pd = new Date();
const payNav = n => { pd = pv === "day" ? addD(pd, n) : pv === "month" ? new Date(pd.getFullYear(), pd.getMonth() + n, 1) : new Date(pd.getFullYear() + n, 0, 1); render(); };
function vCaja() {
  const y = pd.getFullYear(), mo = pd.getMonth(), dd = pd.getDate();
  const inP = x => { const d = new Date(x.paid_at); return d.getFullYear() === y && (pv === "year" || (d.getMonth() === mo && (pv === "month" || d.getDate() === dd))); };
  const L = D.pay.filter(inP), tot = L.reduce((t, x) => t + Number(x.base_amount), 0);
  const group = (key, val) => Object.entries(L.reduce((o, x) => (o[x[key]] = (o[x[key]] || 0) + Number(x[val]), o), {})).sort((a, b) => b[1] - a[1]);
  const byCur = group("currency", "amount"), byMeth = group("method", "base_amount").map(([l, v]) => ({ l: METH[l] || l, v: Math.round(v) }));
  const bars = pv === "year" ? [...Array(12)].map((_, i) => ({ l: new Date(y, i, 1).toLocaleDateString("es", {month: "short"}).replace(".", ""), v: D.pay.filter(x => { const d = new Date(x.paid_at); return d.getFullYear() === y && d.getMonth() === i; }).reduce((t, x) => t + Number(x.base_amount), 0) }))
    : pv === "month" ? [...Array(new Date(y, mo + 1, 0).getDate())].map((_, i) => ({ l: i % 5 === 0 || i === 0 ? String(i + 1) : "", v: L.filter(x => new Date(x.paid_at).getDate() === i + 1).reduce((t, x) => t + Number(x.base_amount), 0) })) : null;
  const label = pv === "day" ? cap(pd.toLocaleDateString("es", {weekday: "short", day: "numeric", month: "long"}).replace(".", "").replace(",", "")) : pv === "month" ? cap(pd.toLocaleDateString("es", {month: "long", year: "numeric"}).replace(" de ", " ")) : String(y);
  const rows = L.slice(0, 100).map(x => { const pk = D.p.find(p => p.id === x.client_package_id);
    return `<div class="row"><div><b>${x.client_id ? esc(cn(x.client_id)) : "Sin clienta"}</b>${pk ? " · " + esc(sn(pk.service_id)) : ""}<br><span class="mu">${new Date(x.paid_at).toLocaleString("es", {dateStyle: "short", timeStyle: "short"})} · ${METH[x.method] || x.method}${x.note ? " · " + esc(x.note) : ""}</span></div>
    <div class="btns"><b>${fmtM(x.amount, x.currency)}</b>${x.currency !== T.currency ? `<span class="mu">≈ ${fmtM(x.base_amount, T.currency)}</span>` : ""}<button class="ghost sm" onclick="delPay('${x.id}')">Anular</button></div></div>`; }).join("");
  return `<div class="top"><h2>Caja</h2><button onclick="payForm()">＋ Registrar pago</button></div>
  <div class="seg">${[["day", "Día"], ["month", "Mes"], ["year", "Año"]].map(([k, l]) => `<button class="${k === pv ? "on" : ""}" onclick="pv='${k}';render()">${l}</button>`).join("")}</div>
  <div class="cnav"><button class="ghost sm" onclick="payNav(-1)">‹</button><div><b>${label}</b><br><a href="#" onclick="pd=new Date();render();return false">Hoy</a></div><button class="ghost sm" onclick="payNav(1)">›</button></div>
  <div class="grid"><div class="card kpi"><b>${m2(tot)} ${cur()}</b><span class="mu">total equivalente</span></div><div class="card kpi"><b>${L.length}</b><span class="mu">pagos</span></div></div>
  <h3>Por moneda (monto original)</h3><div class="card btns">${byCur.map(([c, v]) => `<span class="pill info">${fmtM(v, c)}</span>`).join("") || '<span class="mu">Sin pagos en este período.</span>'}</div>
  ${bars ? `<h3>Ingresos ${pv === "year" ? "por mes" : "por día"} (${cur()})</h3><div class="card">${vbars(bars, money)}</div>` : ""}
  <h3>Por método</h3><div class="card">${hbars(byMeth)}</div><h3>Pagos</h3><div class="card">${rows || empty("Sin pagos.")}</div>`;
}
