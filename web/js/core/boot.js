/* ==================================================================
   js/core/boot.js
   Propósito : Arranque: init() (sesión, rol, empresa) y load() (carga los datos en D).
   Depende de: state.js, logger.js, ui.js
   La usan   : start.js, ui.js (run)
   ================================================================== */
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return loginView();
  app(skel());
  const fail = (m, h = "Error") => app(`<div class="login"><h1>${h}</h1><p>${esc(m)}</p><button onclick="logout()">Salir</button></div>`);
  const { data: m, error: e1 } = await sb.from("members").select("tenant_id,role").limit(1);
  if (e1) return fail(e1.message);
  if (!m?.length) return onboardView();
  ROLE = m[0].role;
  const { data: t, error: e2 } = await sb.from("tenants").select("*").eq("id", m[0].tenant_id).single();
  if (e2) return fail(e2.message);
  T = t; await load(); render();
}
async function load() {
  const since = new Date(new Date().getFullYear() - 1, 0, 1).toISOString();
  const r = await Promise.all([
    sb.from("clients").select("*").order("created_at", {ascending:false}),
    sb.from("services").select("*").order("sort"),
    sb.from("appointments").select("*").gte("starts_at", since).order("starts_at"),
    sb.from("blocks").select("*").gte("ends_at", since).order("starts_at"),
    sb.from("client_packages").select("*").order("purchased_at", {ascending:false}),
    sb.from("payments").select("*").gte("paid_at", since).order("paid_at", {ascending:false})]);
  const bad = r.find(x => x.error); if (bad) { toast("No se pudieron cargar datos: " + bad.error.message, 1); log("system", "error", "load.failed", bad.error.message); }
  D = {c:r[0].data||[], s:r[1].data||[], a:r[2].data||[], b:r[3].data||[], p:r[4].data||[], pay:r[5].data||[]};
}
