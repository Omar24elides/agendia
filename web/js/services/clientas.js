/* ==================================================================
   js/services/clientas.js
   Propósito : Reglas de negocio y acceso a datos de Clientas
               (búsqueda paginada en servidor, alta validada, canje de
               fidelidad atómico y exportación CSV completa).
   Depende de: state.js, logger.js, ui.js
   La usan   : views/clientas.js
   ================================================================== */

const ClientasService = (() => {
  /* ---- Constantes de validación (espejo de restricciones en Postgres) ---- */
  const PAGE_SIZE = 30;
  const UNSAFE_HTML = /[<>]/;

  /* ------------------------------------------------------------------
     1. Lectura paginada e indexada (usa RPC search_clients_page de 006)
     Por qué: Evita filtrar miles de registros en el teléfono y aprovecha
              el índice GIN pg_trgm en Postgres sobre nombre/teléfono/zona.
     ------------------------------------------------------------------ */
  async function searchPage({ query = "", limit = PAGE_SIZE, offset = 0 } = {}) {
    if (!sb || !T) return { items: [], total: 0, hasMore: false, error: null };

    const t0 = performance.now();
    const { data, error } = await sb.rpc("search_clients_page", {
      p_tenant_id: T.id,
      p_query: String(query || "").trim(),
      p_limit: limit,
      p_offset: offset
    });

    if (error) {
      log("clients", "error", "clients.search_failed", error.message, {
        ms: Math.round(performance.now() - t0),
        code: error.code
      });
      return { items: [], total: 0, hasMore: false, error };
    }

    const items = data || [];
    // total_count viene calculado por ventana (count(*) over()) en cada fila
    const total = items.length ? Number(items[0].total_count || items.length) : 0;
    const hasMore = offset + items.length < total;
    return { items, total, hasMore, error: null };
  }

  /* ------------------------------------------------------------------
     2. Alta de nueva clienta con validación previa antes de tocar la red
     Por qué: Da retroalimentación inmediata al usuario y evita viajes
              innecesarios a la BD cuando faltan datos o hay caracteres < >.
     ------------------------------------------------------------------ */
  /** Valida los campos de una clienta; devuelve la fila limpia o null (ya mostró el aviso). */
  function clean({ name = "", phone = "", zone = "", source = "whatsapp", marketing_consent = false, notes = "" }) {
    const cleanPhone = String(phone || "").trim();
    const cleanName = String(name || "").trim();
    const cleanZone = String(zone || "").trim();
    const cleanNotes = String(notes || "").trim();
    if (cleanPhone.length < 6 || cleanPhone.length > 30) { toast("El teléfono debe tener entre 6 y 30 caracteres", 1); return null; }
    if (cleanName.length > 120 || cleanZone.length > 120) { toast("Nombre o zona demasiado largos (máximo 120 caracteres)", 1); return null; }
    if (cleanNotes.length > 2000) { toast("Las notas son demasiado largas (máximo 2000 caracteres)", 1); return null; }
    if (UNSAFE_HTML.test(cleanName) || UNSAFE_HTML.test(cleanZone) || UNSAFE_HTML.test(cleanNotes)) { toast("No uses los caracteres < ni >", 1); return null; }
    return {
      name: cleanName || null, phone: cleanPhone, zone: cleanZone || null, source: source || "whatsapp",
      marketing_consent: Boolean(marketing_consent), notes: cleanNotes || null
    };
  }

  async function create(input) {
    const row = clean(input);
    if (!row) return false;
    return run(sb.from("clients").insert({ tenant_id: T.id, ...row }), V().C + " guardad" + (V().C.endsWith("a") ? "a" : "o"));
  }

  /** Edita una clienta existente (no toca los sellos: esos solo cambian por citas/regalos). */
  async function update(id, input) {
    const row = clean(input);
    if (!row) return false;
    return run(sb.from("clients").update(row).eq("id", id), "Datos actualizados");
  }

  /** Elimina una clienta SOLO si no tiene historial (citas, paquetes). Si lo tiene, avisa:
      borrar historial rompería la caja y los reportes. */
  async function remove(id) {
    const c = D.c.find(x => x.id === id);
    const hist = D.a.some(a => a.client_id === id) || D.p.some(p => p.client_id === id);
    if (hist) { toast("Tiene citas o paquetes: no se puede eliminar para conservar el historial", 1); return false; }
    if (!(await ask(`¿Eliminar a ${c ? (c.name || c.phone) : "este registro"}? No se puede deshacer.`, "Eliminar"))) return false;
    return run(sb.from("clients").delete().eq("id", id), "Eliminado");
  }

  /* ------------------------------------------------------------------
     3. Canje atómico de regalo de fidelidad (usa RPC redeem_loyalty_reward)
     Por qué: Bloquea la fila con FOR UPDATE en Postgres para impedir doble
              canje por doble clic y deja auditoría automática en logs.
     ------------------------------------------------------------------ */
  async function redeemReward(clientId) {
    if (!clientId) return false;
    const ok = await ask(
      `¿Confirmar entrega del regalo de fidelidad? Se descontarán ${T.loyalty_target} sellos.`,
      "Entregar regalo"
    );
    if (!ok) return false;

    return run(
      sb.rpc("redeem_loyalty_reward", { p_client_id: clientId }),
      "Regalo de fidelidad entregado"
    );
  }

  /* ------------------------------------------------------------------
     4. Exportación CSV completa (consulta bajo demanda)
     Por qué: La lista en pantalla está paginada, pero el respaldo CSV
              debe incluir todas las clientas registradas de la empresa.
     ------------------------------------------------------------------ */
  async function exportCsv() {
    if (!sb || !T) return;

    const { data, error } = await sb
      .from("clients")
      .select("name,phone,zone,source,marketing_consent,loyalty_stamps")
      .order("created_at", { ascending: false });

    if (error) {
      toast("No se pudo exportar: " + error.message, 1);
      log("backup", "error", "clients.export_failed", error.message, { code: error.code });
      return;
    }

    const rows = [
      ["nombre", "telefono", "zona", "origen", "promos", "sellos"],
      ...(data || []).map(c => [c.name, c.phone, c.zone, c.source, c.marketing_consent, c.loyalty_stamps])
    ];
    const csv = rows
      .map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "clientas.csv";
    a.click();

    log("backup", "info", "clients.export_csv", "Exportación CSV de clientas", { count: (data || []).length });
  }

  return { PAGE_SIZE, searchPage, create, update, remove, redeemReward, exportCsv };
})();
