/* ==================================================================
   js/services/equipo.js
   Propósito : Profesionales del negocio (tabla staff): listar, crear, renombrar, archivar.
   Depende de: state.js, logger.js, ui.js (run)
   La usan   : views/equipo.js, calendario.js, programar.js, boot.js (carga)
   Nota      : D.st se carga aparte en boot.js; si la migración 007 aún no está
               aplicada, la carga se ignora y la app funciona como antes (sin equipo).
   ================================================================== */
const EquipoService = (() => {
  const active = () => (D.st || []).filter(s => s.active);
  const name = id => (D.st || []).find(s => s.id === id)?.name || "";

  /** Carga el equipo. Devuelve [] si la tabla no existe todavía (migración pendiente). */
  async function load() {
    const { data, error } = await sb.from("staff").select("*").order("sort").order("name");
    if (error) { if (!/staff|PGRST205|42P01/i.test(error.message + error.code)) log("staff", "error", "staff.load_failed", error.message); return []; }
    return data || [];
  }
  function validName(n) {
    const v = String(n || "").trim();
    if (v.length < 2 || v.length > 80) { toast("El nombre debe tener entre 2 y 80 letras", 1); return null; }
    if (/[<>]/.test(v)) { toast("No uses los caracteres < ni >", 1); return null; }
    return v;
  }
  async function create(n) {
    const v = validName(n); if (!v) return false;
    return run(sb.from("staff").insert({ tenant_id: T.id, name: v, sort: (D.st || []).length + 1 }), "Profesional agregado");
  }
  async function rename(id, n) {
    const v = validName(n); if (!v) return false;
    return run(sb.from("staff").update({ name: v }).eq("id", id), "Nombre actualizado");
  }
  const setActive = (id, on) => run(sb.from("staff").update({ active: on }).eq("id", id), on ? "Profesional restaurado" : "Profesional archivado");
  return { active, name, load, create, rename, setActive };
})();
