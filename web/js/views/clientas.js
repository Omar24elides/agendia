/* ==================================================================
   js/views/clientas.js
   Propósito : Vista de Clientas: búsqueda indexada con debounce, listado
               paginado ("Cargar más"), alta/edición, ficha con historial,
               canje de fidelidad y CSV. El texto cambia según el rubro (vocab.js).
               No habla directo con Supabase: delega todo a ClientasService.
   Depende de: state.js, ui.js, vocab.js, services/clientas.js
   La usan   : render.js, core/ui.js (refreshClientas)
   ================================================================== */

/* ---- Estado local de paginación y búsqueda ---- */
const CLI_STATE = {
  items: [],
  total: 0,
  hasMore: false,
  loading: false,
  loaded: false,
  reqId: 0
};
let cliSearchTimer = null;

/** Consulta una página al servidor (reset=true reinicia en 0). */
async function refreshClientas(reset = true) {
  const myReq = ++CLI_STATE.reqId;
  const offset = reset ? 0 : CLI_STATE.items.length;
  CLI_STATE.loading = true;
  if (tab === "clientas") renderClientasBody();

  const res = await ClientasService.searchPage({ query: q, limit: ClientasService.PAGE_SIZE, offset });

  // Ignorar respuestas viejas si el usuario siguió escribiendo en red móvil lenta
  if (myReq !== CLI_STATE.reqId) return;

  CLI_STATE.loading = false;
  CLI_STATE.loaded = true;

  if (res.error) {
    toast("Error cargando " + V().cs + ": " + res.error.message, 1);
  } else {
    CLI_STATE.items = reset ? res.items : CLI_STATE.items.concat(res.items);
    CLI_STATE.total = res.total;
    CLI_STATE.hasMore = res.hasMore;
  }
  if (tab === "clientas") renderClientasBody();
}

/** Debounce de búsqueda (250 ms) para no saturar la red al teclear. */
function onClientSearch(val) {
  q = val;
  clearTimeout(cliSearchTimer);
  cliSearchTimer = setTimeout(() => refreshClientas(true), 250);
}

/** Actualiza solo el contenedor de resultados sin perder el foco del buscador. */
function renderClientasBody() {
  const box = $("#cli-results");
  if (box) box.innerHTML = buildClientasRowsHtml();
}

/** Construye el HTML de las filas y el botón "Cargar más". */
function buildClientasRowsHtml() {
  if (CLI_STATE.loading && !CLI_STATE.items.length) {
    return `<div class="card"><span class="sk sk-l"></span><span class="sk sk-l sk-m"></span></div>`;
  }
  const list = CLI_STATE.loaded ? CLI_STATE.items : D.c.slice(0, ClientasService.PAGE_SIZE);
  const total = CLI_STATE.loaded ? CLI_STATE.total : D.c.length;

  if (!list.length) {
    return empty(
      q ? "Sin resultados para tu búsqueda." : `Aún no tienes ${V().cs}.`,
      q ? "" : `<button onclick="clientForm()">Crear ${V().un} ${V().c}</button>`
    );
  }

  const rows = list.map(c => `
    <div class="row">
      <div class="btns" style="flex-wrap:nowrap">
        <span class="av">${esc((c.name || "?")[0].toUpperCase())}</span>
        <div>
          <b>${esc(c.name || "Sin nombre")}</b><br>
          <span class="mu">${esc(c.phone)} ${c.zone ? "· " + esc(c.zone) : ""} ${c.marketing_consent ? "· ✅ promos" : ""}</span>
        </div>
      </div>
      <div class="btns">
        ${stampsHtml(c.loyalty_stamps, T.loyalty_target)}
        ${c.loyalty_stamps >= T.loyalty_target ? `<button class="sm" onclick="reward('${c.id}')">🎁 Regalo entregado</button>` : ""}
        <button class="ghost sm" onclick="clientCard('${c.id}')">Ver ficha</button>
        <a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${String(c.phone || "").replace(/\D/g, "")}">WhatsApp</a>
      </div>
    </div>`).join("");

  const footer = CLI_STATE.hasMore
    ? `<div style="text-align:center;margin-top:12px">
         <button class="ghost" onclick="refreshClientas(false)" ${CLI_STATE.loading ? "disabled" : ""}>
           ${CLI_STATE.loading ? "Cargando..." : `Cargar más (${list.length} de ${total})`}
         </button>
       </div>`
    : `<p class="mu" style="text-align:center;margin:10px 0 0">Mostrando ${list.length} de ${total} ${V().cs}</p>`;

  return `<div class="card">${rows}</div>${footer}`;
}

/** Pantalla principal. */
function vClientas() {
  return `
    <div class="top">
      <h2>${V().Cs}</h2>
      <div class="btns">
        <button onclick="clientForm()">＋ ${V().nuevo} ${V().c}</button>
        <button class="ghost" onclick="ClientasService.exportCsv()">Exportar CSV</button>
      </div>
    </div>
    <input id="qs" style="width:100%;margin-bottom:12px"
      placeholder="🔍 Buscar por nombre, teléfono o zona"
      value="${esc(q)}"
      oninput="onClientSearch(this.value)">
    <div id="cli-results">${buildClientasRowsHtml()}</div>`;
}

/** Modal de alta (sin id) o edición (con id). */
function clientForm(id) {
  const c = (id && D.c.find(x => x.id === id)) || {};
  const src = ["whatsapp", "instagram", "google", "web", "referida"];
  modal(id ? "Editar " + V().c : V().nuevo + " " + V().c, `
    <form class="f" onsubmit="saveClient(event,'${id || ""}');return false">
      <label>Nombre<input name="name" maxlength="120" value="${esc(c.name)}"></label>
      <label>Teléfono<input name="phone" required maxlength="30" placeholder="584121234567" value="${esc(c.phone)}"></label>
      <div class="f2">
        <label>Zona<input name="zone" maxlength="120" value="${esc(c.zone)}"></label>
        <label>Origen<select name="source">${src.map(s => `<option ${c.source === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      </div>
      <label>Notas (no se guardan en los registros de actividad)<textarea name="notes" rows="3" maxlength="2000">${esc(c.notes)}</textarea></label>
      <label class="chk"><input type="checkbox" name="consent" ${c.marketing_consent ? "checked" : ""}> Acepta recibir promociones</label>
      <button>Guardar</button>
    </form>`);
}

function saveClient(e, id) {
  const f = new FormData(e.target);
  const data = { name: f.get("name"), phone: f.get("phone"), zone: f.get("zone"), source: f.get("source"),
                 notes: f.get("notes"), marketing_consent: !!f.get("consent") };
  id ? ClientasService.update(id, data) : ClientasService.create(data);
}

/** Ficha: todo lo de una persona en una sola pantalla (citas, paquetes, pagos, notas). */
function clientCard(id) {
  const c = D.c.find(x => x.id === id);
  if (!c) return toast("No se encontró el registro", 1);
  const now = new Date();
  const appts = D.a.filter(a => a.client_id === id);
  const next = appts.filter(a => ["pending", "confirmed"].includes(a.status) && new Date(a.starts_at) >= now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = appts.filter(a => !next.includes(a)).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)).slice(0, 8);
  const pkgs = D.p.filter(p => p.client_id === id);
  const pays = D.pay.filter(p => p.client_id === id);
  const paid = pays.reduce((t, p) => t + Number(p.base_amount), 0);
  const line = a => `<div class="row"><span>${new Date(a.starts_at).toLocaleDateString("es", {day: "numeric", month: "short", year: "2-digit"})} · ${hm(a.starts_at)} · ${esc(sn(a.service_id))}${a.staff_id ? " · " + esc(EquipoService.name(a.staff_id)) : ""}</span><span class="pill ${a.status}">${ST[a.status]}</span></div>`;
  modal(esc(c.name || c.phone), `
    <p class="mu" style="margin:0 0 8px">${esc(c.phone)}${c.zone ? " · " + esc(c.zone) : ""}${c.source ? " · origen: " + esc(c.source) : ""}</p>
    ${stampsHtml(c.loyalty_stamps, T.loyalty_target)}
    ${c.notes ? `<p style="white-space:pre-wrap;background:var(--in);border-radius:10px;padding:8px;margin:10px 0">${esc(c.notes)}</p>` : ""}
    <div class="grid" style="margin:10px 0"><div class="card kpi"><b>${appts.filter(a => a.status === "completed").length}</b><span class="mu">sesiones realizadas</span></div>
      <div class="card kpi"><b>${m2(paid)} ${cur()}</b><span class="mu">pagado en total</span></div></div>
    <h3>Próximas citas</h3><div class="card">${next.map(line).join("") || '<span class="mu">Ninguna.</span>'}</div>
    <h3>Paquetes</h3><div class="card">${pkgs.map(p => `<div class="row"><span>${esc(sn(p.service_id))} · ${p.sessions_used}/${p.sessions_total}</span><span class="pill ${PaquetesService.isCancelled(p) ? "cancelled" : "info"}">${PaquetesService.isCancelled(p) ? "Anulado" : "Activo"}</span></div>`).join("") || '<span class="mu">Ninguno.</span>'}</div>
    <h3>Historial reciente</h3><div class="card">${past.map(line).join("") || '<span class="mu">Sin historial.</span>'}</div>
    <div class="btns" style="margin-top:12px">
      <button onclick="dlg.close();apptForm(null,'${c.id}')">＋ Nueva cita</button>
      <button class="ghost" onclick="clientForm('${c.id}')">Editar</button>
      <a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/${String(c.phone).replace(/\D/g, "")}">WhatsApp</a>
      <button class="ghost" onclick="dlg.close();ClientasService.remove('${c.id}')">Eliminar</button>
    </div>`);
}

function reward(id) {
  ClientasService.redeemReward(id);
}
