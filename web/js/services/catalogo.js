/* ==================================================================
   js/services/catalogo.js
   Propósito : Reglas de negocio y acceso a datos del Catálogo de servicios:
               alta, edición, precio rápido, archivar/restaurar, eliminar
               (archiva si tiene historial) y gestión de categorías.
   Depende de: state.js, logger.js, ui.js (run, ask)
   La usan   : views/servicios.js
   ================================================================== */
const CatalogoService = (() => {
  const UNSAFE_HTML = /[<>]/;

  /** Regla: un servicio con historial (citas o paquetes) NO se borra, se archiva. */
  async function dropOne(id) {
    const { error } = await sb.from("services").delete().eq("id", id);
    if (!error) return "deleted";
    if (error.code === "23503") {
      const r = await sb.from("services").update({ active: false }).eq("id", id);
      return r.error ? "error" : "archived";
    }
    return "error";
  }

  /** Guarda un servicio nuevo o actualiza uno existente tras validar en cliente. */
  async function save(id, input) {
    const nm  = String(input.name || "").trim();
    const cat = String(input.category || "").trim();
    const desc = String(input.description || "").trim();
    const p   = Number(input.price);
    const n   = Number(input.sessions);
    const d   = Number(input.duration_min);
    const days = input.validity_days === "" || input.validity_days == null ? null : Number(input.validity_days);

    if (nm.length < 2 || nm.length > 120) { toast("El nombre debe tener entre 2 y 120 letras", 1); return false; }
    if (cat.length < 2 || cat.length > 60) { toast("La categoría debe tener entre 2 y 60 letras", 1); return false; }
    if (desc.length > 300) { toast("La descripción admite máximo 300 caracteres", 1); return false; }
    if (UNSAFE_HTML.test(nm + cat + desc)) { toast("No uses los caracteres < ni >", 1); return false; }
    if (!(p >= 0 && p <= 100000) || !(n >= 1 && n <= 365) || !(d >= 5 && d <= 480)) {
      toast("Revisa precio, sesiones y duración", 1);
      return false;
    }
    if (days !== null && !(days >= 1 && days <= 1095)) {
      toast("Vigencia: entre 1 y 1095 días (vacío = sin vencimiento)", 1);
      return false;
    }

    const row = {
      category: cat,
      name: nm,
      description: desc || null,
      price: p,
      kind: input.kind || "service",
      sessions: n,
      duration_min: d,
      validity_days: days,
      location: input.location || "home",
      requires_authorization: Boolean(input.requires_authorization)
    };

    return run(
      id
        ? sb.from("services").update(row).eq("id", id)
        : sb.from("services").insert({ ...row, tenant_id: T.id, sort: D.s.length + 1 }),
      id ? "Servicio actualizado" : "Servicio agregado"
    );
  }

  async function savePrice(id, price) {
    const v = Number(price);
    if (!(v >= 0 && v <= 100000)) { toast("Precio inválido", 1); return false; }
    return run(sb.from("services").update({ price: v }).eq("id", id), "Precio actualizado");
  }

  const toggleActive = (id, active) =>
    run(sb.from("services").update({ active: !active }).eq("id", id), "Servicio actualizado");

  async function remove(id) {
    const s = D.s.find(x => x.id === id);
    if (!s) return false;
    const ok = await ask(
      `¿Eliminar «${s.name}»? Si ya tiene citas o paquetes, se archivará para conservar el historial.`,
      "Eliminar"
    );
    if (!ok) return false;

    newReq();
    const r = await dropOne(id);
    log("catalog", r === "error" ? "error" : "info", "catalog." + r, s.name, {}, { type: "services", id });
    await load();
    render();
    toast(
      r === "deleted" ? "Servicio eliminado"
        : r === "archived" ? "Tenía historial: quedó archivado"
        : "No se pudo eliminar",
      r === "error"
    );
    return r !== "error";
  }

  async function renameCategory(oldName, newName) {
    const n = String(newName || "").trim();
    if (n.length < 2 || n.length > 60 || UNSAFE_HTML.test(n)) {
      toast("Nombre de categoría inválido (2 a 60 letras, sin < ni >)", 1);
      return false;
    }
    return run(
      sb.from("services").update({ category: n }).eq("tenant_id", T.id).eq("category", oldName),
      "Categoría renombrada"
    );
  }

  async function deleteCategory(cat) {
    const ids = D.s.filter(s => s.category === cat).map(s => s.id);
    const ok = await ask(
      `¿Eliminar la categoría «${cat}» y sus ${ids.length} servicios? Los que tengan historial quedarán archivados.`,
      "Eliminar categoría"
    );
    if (!ok) return false;

    newReq();
    const res = [];
    for (const id of ids) res.push(await dropOne(id));
    const d = res.filter(x => x === "deleted").length;
    const a = res.filter(x => x === "archived").length;
    log("catalog", "info", "catalog.category_delete", cat, { deleted: d, archived: a });
    await load();
    render();
    toast(`${d} eliminados · ${a} archivados`);
    return true;
  }

  return { save, savePrice, toggleActive, remove, renameCategory, deleteCategory };
})();
