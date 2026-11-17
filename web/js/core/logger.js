/* ==================================================================
   js/core/logger.js
   Propósito : Registro de actividad por servicio: log(), logRun(), captura de errores del navegador.
   Depende de: state.js
   La usan   : ui.js (run), boot.js, servicios.js, start
   ================================================================== */
/* ---- registro de actividad por servicio ---- */
/* Servicios conocidos (espejo de la tabla log_services). Para agregar uno: ver docs/REGISTROS.md */
const LOG_SERVICES = {auth: "Ingreso y sesiones", clients: "Clientas", appointments: "Citas y calendario", packages: "Paquetes y sesiones", payments: "Pagos y caja", catalog: "Servicios y precios", schedule: "Horario y bloqueos", whatsapp: "Bot de WhatsApp", backup: "Copias y exportación", system: "Errores generales"};
/* Tabla de la base de datos -> servicio al que pertenece (lo usa logRun) */
const TABLE_SERVICE = {appointments: "appointments", clients: "clients", client_packages: "packages", payments: "payments", services: "catalog", blocks: "schedule", tenants: "schedule"};
let REQ = null, LOG_N = 0, LOG_T = Date.now();
/** Nueva acción del usuario: todos los eventos que la sigan comparten este id. */
const newReq = () => (REQ = crypto.randomUUID());
/** Envía un evento a la tabla logs (por la función log_event del servidor). Nunca debe romper la app. */
async function log(service, level, event, message, meta = {}, entity = {}) {
  if (!sb || !T) return;
  if (Date.now() - LOG_T > 6e4) { LOG_T = Date.now(); LOG_N = 0; }
  if (++LOG_N > 30) return;                               // límite en el navegador: 30 eventos por minuto
  try { await sb.rpc("log_event", { p_service: service, p_level: level, p_event: event, p_message: String(message || "").slice(0, 500), p_meta: meta, p_entity_type: entity.type || null, p_entity_id: entity.id || null, p_request_id: REQ, p_duration_ms: meta.ms || null }); }
  catch (e) { console.warn("No se pudo registrar:", e); }
}
/** Registra una escritura hecha con run(): deduce servicio y operación del propio request. */
function logRun(p, error, ms, msg) {
  const table = ((p.url && p.url.pathname) || "").split("/").pop(), svc = TABLE_SERVICE[table] || "system";
  const op = ({POST: "create", PATCH: "update", DELETE: "delete"})[p.method] || String(p.method || "call").toLowerCase();
  log(svc, error ? "error" : "info", `${svc}.${op}`, error ? error.message : msg, {ms: Math.round(ms), table, code: error && error.code});
}
window.addEventListener("error", e => log("system", "error", "client.error", e.message, {where: String(e.filename || "").split("/").pop() + ":" + e.lineno}));
window.addEventListener("unhandledrejection", e => log("system", "error", "client.rejection", String((e.reason && e.reason.message) || e.reason)));
