/* ==================================================================
   js/views/registro.js
   Propósito : Pestaña Registro (solo dueña): consulta los eventos de la tabla logs.
   Depende de: state.js, logger.js
   La usan   : render.js
   ================================================================== */
/* ---- vista Registro (solo dueña): últimos 200 eventos con filtros ---- */
let LOGS = null; const LOGF = {service: "", level: ""};
async function loadLogs() {
  let q = sb.from("logs").select("*").order("created_at", {ascending: false}).limit(200);
  if (LOGF.service) q = q.eq("service", LOGF.service);
  if (LOGF.level) q = q.eq("level", LOGF.level);
  const { data, error } = await q; LOGS = error ? [] : data;
  if (error) toast(error.message, 1); render();
}
function vRegistro() {
  if (LOGS === null) loadLogs();
  const opt = (list, cur) => list.map(s => `<option ${cur === s ? "selected" : ""}>${s}</option>`).join("");
  return `<div class="top"><h2>Registro de actividad</h2><button class="ghost" onclick="loadLogs()">Actualizar</button></div>
  <div class="f2"><label>Servicio<select onchange="LOGF.service=this.value;loadLogs()"><option value="">Todos</option>${opt(Object.keys(LOG_SERVICES), LOGF.service)}</select></label>
  <label>Nivel<select onchange="LOGF.level=this.value;loadLogs()"><option value="">Todos</option>${opt(["error", "warn", "info"], LOGF.level)}</select></label></div>
  <div class="card" style="margin-top:12px">${(LOGS || []).map(l => `<div class="row"><div><b>${esc(l.event)}</b> <span class="pill ${l.level === "error" ? "cancelled" : l.level === "warn" ? "pending" : "info"}">${l.level}</span><br>
    <span class="mu">${fmtDT(l.created_at)} · ${esc(l.service)}${l.duration_ms ? " · " + l.duration_ms + " ms" : ""}${l.request_id ? " · req " + l.request_id.slice(0, 8) : ""}</span>${l.message ? `<br><span class="mu">${esc(l.message)}</span>` : ""}</div></div>`).join("") || empty(LOGS === null ? "Cargando…" : "Sin registros con estos filtros.")}</div>`;
}
