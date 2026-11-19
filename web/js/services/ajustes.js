/* ==================================================================
   js/services/ajustes.js
   Propósito : Ajustes del negocio guardados en tenants.settings:
               vocabulario por rubro, vigencia de paquetes y reservas públicas.
   Depende de: state.js, ui.js (run)
   La usan   : views/horario.js (tarjeta de ajustes), views/acceso.js
   ================================================================== */
const AjustesService = (() => {
  /** Mezcla un cambio dentro de settings sin perder lo demás (horario, telegram, etc.). */
  async function save(patch, msg = "Ajustes guardados") {
    const next = { ...(T.settings || {}), ...patch };
    const { data, error } = await sb.from("tenants").update({ settings: next }).eq("id", T.id).select().single();
    if (error) { toast(error.message, 1); log("schedule", "error", "settings.save_failed", error.message, { code: error.code }); return false; }
    T = data; log("schedule", "info", "settings.saved", Object.keys(patch).join(","));
    render(); toast(msg); return true;
  }
  /** Guarda horario de trabajo y meta de fidelidad juntos (pestaña Horario/Ajustes). */
  async function saveHoursAndLoyalty(workingHours, loyaltyTarget) {
    const next = { ...(T.settings || {}), working_hours: workingHours };
    const { data, error } = await sb
      .from("tenants")
      .update({ settings: next, loyalty_target: loyaltyTarget })
      .eq("id", T.id)
      .select()
      .single();
    if (error) {
      toast(error.message, 1);
      log("schedule", "error", "schedule.save_failed", error.message, { code: error.code });
      return false;
    }
    T = data;
    log("schedule", "info", "schedule.saved", "Horario y fidelidad actualizados");
    render();
    toast("Horario guardado");
    return true;
  }

  /** Enlace público de reservas de esta empresa (funciona en localhost y en el dominio real). */
  const bookingLink = () => new URL("reservar.html?e=" + encodeURIComponent(T.slug), location.href).href;
  const validityMode = () => (T.settings && T.settings.validity_mode) || "purchase";   // purchase | first_session
  return { save, saveHoursAndLoyalty, bookingLink, validityMode };
})();
