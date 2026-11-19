/* ==================================================================
   js/views/caja.js
   Propósito : Vista de Pagos y Caja: totales agregados en servidor por
               día/mes/año, listado paginado ("Cargar más") y alta multimoneda.
               No habla directo con Supabase: delega todo a CajaService.
   Depende de: state.js, ui.js, services/caja.js, resumen.js (vbars, hbars)
   La usan   : render.js, paquetes.js (payOf, payForm, fmtM), core/ui.js (refreshCaja)
   ================================================================== */

/* ---- Alias públicos usados por otras vistas (compatibilidad) ---- */
const SYM  = CajaService.SYM;
const METH = CajaService.METHODS;
const fmtM = (n, c) => m2(n) + " " + (SYM[c] || c);
const payOf = p => CajaService.paidForPackage(p.id);

/* ---- Estado local del período y paginación ---- */
let pv = "day", pd = new Date();
const CAJA_STATE = {
  summary: null,
  items: [],
  total: 0,
  hasMore: false,
  loading: false,
  key: "",
  reqId: 0
};

const cajaKey = () => `${pv}:${pd.getFullYear()}-${pd.getMonth()}-${pd.getDate()}`;

/** Carga en paralelo el resumen ligero (RPC) y la página de pagos del período. */
async function refreshCaja(reset = true) {
  const myReq = ++CAJA_STATE.reqId;
  const key = cajaKey();
  const { fromIso, toIso } = CajaService.periodRange(pv, pd);
  const offset = reset ? 0 : CAJA_STATE.items.length;

  CAJA_STATE.loading = true;
  if (reset) CAJA_STATE.key = key;
  if (tab === "caja") render();

  const tasks = [
    CajaService.listPage({ fromIso, toIso, limit: CajaService.PAGE_SIZE, offset })
  ];
  // Solo pedimos el resumen al cambiar de período o reiniciar; al paginar ("Cargar más") no hace falta
  if (reset || !CAJA_STATE.summary) {
    tasks.push(CajaService.getSummary(fromIso, toIso));
  }

  const [pageRes, sumRes] = await Promise.all(tasks);
  if (myReq !== CAJA_STATE.reqId) return;

  CAJA_STATE.loading = false;

  if (pageRes.error) {
    toast("Error cargando pagos: " + pageRes.error.message, 1);
  } else {
    CAJA_STATE.items = reset ? pageRes.items : CAJA_STATE.items.concat(pageRes.items);
    CAJA_STATE.total = pageRes.total;
    CAJA_STATE.hasMore = pageRes.hasMore;
  }

  if (sumRes) {
    if (sumRes.error) toast("Error cargando totales: " + sumRes.error.message, 1);
    else CAJA_STATE.summary = sumRes.summary;
  }

  if (tab === "caja") render();
}

/** Cambia vista (día/mes/año) o navega hacia atrás/adelante recargando desde servidor. */
const payView = k => { pv = k; refreshCaja(true); };
const payToday = () => { pd = new Date(); refreshCaja(true); };
const payNav = n => {
  pd = pv === "day"
    ? addD(pd, n)
    : pv === "month"
      ? new Date(pd.getFullYear(), pd.getMonth() + n, 1)
      : new Date(pd.getFullYear() + n, 0, 1);
  refreshCaja(true);
};

/** Modal para registrar un pago (suelto o abonado a un paquete). */
function payForm(id) {
  const p = id && D.p.find(x => x.id === id);
  const opt = o => Object.entries(o).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  modal("Registrar pago", `
    <form class="f" onsubmit="savePay(event,'${id || ""}');return false">
      ${p
        ? `<p style="margin:0"><b>${esc(cn(p.client_id))}</b> · ${esc(sn(p.service_id))}</p>`
        : `<label>${V().C} (opcional)<select name="client"><option value="">—</option>${clientOpts()}</select></label>`}
      <div class="f2">
        <label>Monto<input name="amt" data-num="dec" inputmode="decimal" required></label>
        <label>Moneda<select name="cur">${opt(CajaService.CURRENCIES).replace(`value="${T.currency}"`, `value="${T.currency}" selected`)}</select></label>
      </div>
      <label>Tasa del día (solo si la moneda es distinta a ${T.currency}: cuántas unidades de la moneda pagada equivalen a 1 ${T.currency})
        <input name="rate" data-num="dec" inputmode="decimal">
      </label>
      <label>Método<select name="method">${opt(METH)}</select></label>
      <label>Nota (opcional)<input name="note" maxlength="200"></label>
      <button>Guardar pago</button>
    </form>`);
}

function savePay(e, id) {
  const f = new FormData(e.target);
  const p = id && D.p.find(x => x.id === id);
  CajaService.create({
    clientId: p ? p.client_id : f.get("client") || null,
    packageId: p ? p.id : null,
    amount: f.get("amt"),
    currency: f.get("cur"),
    rate: f.get("rate"),
    method: f.get("method"),
    note: f.get("note")
  });
}

/** Pantalla principal de Caja. */
function vCaja() {
  const y = pd.getFullYear(), mo = pd.getMonth(), dd = pd.getDate();
  const isSynced = CAJA_STATE.key === cajaKey() && CAJA_STATE.summary;

  // Datos locales de respaldo mientras llega el resumen de servidor
  const inP = x => {
    const d = new Date(x.paid_at);
    return d.getFullYear() === y && (pv === "year" || (d.getMonth() === mo && (pv === "month" || d.getDate() === dd)));
  };
  const localPeriod = D.pay.filter(inP);

  // KPIs y agrupaciones autoritativas desde Postgres (RPC get_caja_summary)
  const tot = isSynced
    ? Number(CAJA_STATE.summary.total_base || 0)
    : localPeriod.reduce((t, x) => t + Number(x.base_amount), 0);
  const count = isSynced
    ? Number(CAJA_STATE.summary.count || 0)
    : localPeriod.length;

  const byCur = isSynced
    ? (CAJA_STATE.summary.by_currency || []).map(x => [x.currency, Number(x.amount)])
    : Object.entries(localPeriod.reduce((o, x) => (o[x.currency] = (o[x.currency] || 0) + Number(x.amount), o), {})).sort((a, b) => b[1] - a[1]);

  const byMeth = isSynced
    ? (CAJA_STATE.summary.by_method || []).map(x => ({ l: METH[x.method] || x.method, v: Math.round(Number(x.base_amount)) }))
    : Object.entries(localPeriod.reduce((o, x) => (o[x.method] = (o[x.method] || 0) + Number(x.base_amount), o), {})).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l: METH[l] || l, v: Math.round(v) }));

  // Gráfica de barras para Mes y Año
  const chartSource = localPeriod.length ? localPeriod : CAJA_STATE.items;
  const bars = pv === "year"
    ? [...Array(12)].map((_, i) => ({
        l: new Date(y, i, 1).toLocaleDateString("es", { month: "short" }).replace(".", ""),
        v: chartSource
          .filter(x => { const d = new Date(x.paid_at); return d.getFullYear() === y && d.getMonth() === i; })
          .reduce((t, x) => t + Number(x.base_amount), 0)
      }))
    : pv === "month"
      ? [...Array(new Date(y, mo + 1, 0).getDate())].map((_, i) => ({
          l: i % 5 === 0 || i === 0 ? String(i + 1) : "",
          v: chartSource
            .filter(x => new Date(x.paid_at).getDate() === i + 1)
            .reduce((t, x) => t + Number(x.base_amount), 0)
        }))
      : null;

  const label = pv === "day"
    ? cap(pd.toLocaleDateString("es", { weekday: "short", day: "numeric", month: "long" }).replace(".", "").replace(",", ""))
    : pv === "month"
      ? cap(pd.toLocaleDateString("es", { month: "long", year: "numeric" }).replace(" de ", " "))
      : String(y);

  const list = isSynced ? CAJA_STATE.items : localPeriod.slice(0, CajaService.PAGE_SIZE);
  const rows = list.map(x => {
    const pk = D.p.find(p => p.id === x.client_package_id);
    return `
      <div class="row">
        <div>
          <b>${x.client_id ? esc(cn(x.client_id)) : "Sin " + V().c}</b>${pk ? " · " + esc(sn(pk.service_id)) : ""}<br>
          <span class="mu">${new Date(x.paid_at).toLocaleString("es", { dateStyle: "short", timeStyle: "short" })} · ${METH[x.method] || x.method}${x.note ? " · " + esc(x.note) : ""}</span>
        </div>
        <div class="btns">
          <b>${fmtM(x.amount, x.currency)}</b>
          ${x.currency !== T.currency ? `<span class="mu">≈ ${fmtM(x.base_amount, T.currency)}</span>` : ""}
          <button class="ghost sm" onclick="CajaService.cancel('${x.id}')">Anular</button>
        </div>
      </div>`;
  }).join("");

  const pager = isSynced && CAJA_STATE.hasMore
    ? `<div style="text-align:center;margin-top:12px">
         <button class="ghost" onclick="refreshCaja(false)" ${CAJA_STATE.loading ? "disabled" : ""}>
           ${CAJA_STATE.loading ? "Cargando..." : `Cargar más pagos (${list.length} de ${CAJA_STATE.total})`}
         </button>
       </div>`
    : "";

  return `
    <div class="top"><h2>Caja</h2><button onclick="payForm()">＋ Registrar pago</button></div>
    <div class="seg">${[["day", "Día"], ["month", "Mes"], ["year", "Año"]].map(([k, l]) => `<button class="${k === pv ? "on" : ""}" onclick="payView('${k}')">${l}</button>`).join("")}</div>
    <div class="cnav">
      <button class="ghost sm" onclick="payNav(-1)">‹</button>
      <div><b>${label}</b><br><a href="#" onclick="payToday();return false">Hoy</a></div>
      <button class="ghost sm" onclick="payNav(1)">›</button>
    </div>
    <div class="grid">
      <div class="card kpi"><b>${m2(tot)} ${cur()}</b><span class="mu">total equivalente</span></div>
      <div class="card kpi"><b>${count}</b><span class="mu">pagos</span></div>
    </div>
    <h3>Por moneda (monto original)</h3>
    <div class="card btns">${byCur.map(([c, v]) => `<span class="pill info">${fmtM(v, c)}</span>`).join("") || '<span class="mu">Sin pagos en este período.</span>'}</div>
    ${bars ? `<h3>Ingresos ${pv === "year" ? "por mes" : "por día"} (${cur()})</h3><div class="card">${vbars(bars, money)}</div>` : ""}
    <h3>Por método</h3>
    <div class="card">${hbars(byMeth)}</div>
    <h3>Pagos${CAJA_STATE.loading && !list.length ? ' <span class="mu">· cargando...</span>' : ""}</h3>
    <div class="card">${rows || empty("Sin pagos.")}</div>
    ${pager}`;
}
