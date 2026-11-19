/* ==================================================================
   js/services/backup.js
   Propósito : Respaldos portables en JSON (para planes sin backup automático)
               y lectura de registros (logs) para la pestaña Registro.
   Depende de: state.js, logger.js, ui.js (toast)
   La usan   : views/registro.js, views/horario.js (Ajustes)
   ================================================================== */
const BackupService = (() => {
  /** Consulta los últimos 200 registros con filtros opcionales (solo dueña). */
  async function listLogs({ service = "", level = "" } = {}) {
    let q = sb.from("logs").select("*").order("created_at", { ascending: false }).limit(200);
    if (service) q = q.eq("service", service);
    if (level) q = q.eq("level", level);
    const { data, error } = await q;
    if (error) { toast(error.message, 1); return []; }
    return data || [];
  }

  /** Exporta un respaldo completo de la empresa en JSON portable (descarga local).
      Por qué: El plan gratuito de Supabase no incluye copias automáticas. */
  async function exportAllJson() {
    if (!sb || !T) return false;
    toast("Preparando respaldo...");

    const [c, s, st, p, a, b, pay] = await Promise.all([
      sb.from("clients").select("*").order("created_at", { ascending: false }),
      sb.from("services").select("*").order("sort"),
      sb.from("staff").select("*").order("sort"),
      sb.from("client_packages").select("*").order("purchased_at", { ascending: false }),
      sb.from("appointments").select("*").order("starts_at", { ascending: false }),
      sb.from("blocks").select("*").order("starts_at", { ascending: false }),
      sb.from("payments").select("*").order("paid_at", { ascending: false })
    ]);

    const bad = [c, s, p, a, b, pay].find(r => r.error);
    if (bad) {
      toast("Error al respaldar: " + bad.error.message, 1);
      log("backup", "error", "backup.export_failed", bad.error.message);
      return false;
    }

    const payload = {
      exported_at: new Date().toISOString(),
      version: "agendia-v1",
      tenant: { id: T.id, name: T.name, slug: T.slug, currency: T.currency, timezone: T.timezone, loyalty_target: T.loyalty_target, settings: T.settings },
      staff: st.data || [],
      clients: c.data || [],
      services: s.data || [],
      client_packages: p.data || [],
      appointments: a.data || [],
      blocks: b.data || [],
      payments: pay.data || []
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `agendia-respaldo-${T.slug}-${today()}.json`;
    link.click();

    log("backup", "info", "backup.export_json", "Respaldo completo descargado", {
      clients: payload.clients.length,
      appointments: payload.appointments.length,
      payments: payload.payments.length
    });
    toast("Respaldo descargado");
    return true;
  }

  return { listLogs, exportAllJson };
})();
