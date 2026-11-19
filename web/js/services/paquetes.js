/* ==================================================================
   js/services/paquetes.js
   Propósito : Paquetes de clientas: venta (con abono inicial opcional),
               vigencia (desde la compra o desde la 1ª sesión), extender y anular.
   Depende de: state.js, logger.js, ui.js, services/caja.js, services/ajustes.js
   La usan   : views/paquetes.js, views/programar.js
   ================================================================== */
const PaquetesService = (() => {
  const isCancelled = p => (p.status || "active") === "cancelled";

  /** Vende un paquete/combo/servicio. Si trae abono, valida el pago ANTES de guardar nada
      y lo registra enlazado al paquete (si falla el pago, el aviso lo dice con claridad). */
  async function sell({ clientId, serviceId, price, pay }) {
    const s = D.s.find(x => x.id === serviceId);
    if (!clientId || !s) { toast("Elige " + V().un + " " + V().c + " y qué se vende", 1); return false; }
    const pr = price === "" || price == null ? Number(s.price) : Number(price);
    if (!(pr >= 0 && pr <= 10000000)) { toast("Precio inválido", 1); return false; }

    let payRow = null;
    if (pay && pay.amount) {                                 // abono inicial opcional
      payRow = CajaService.buildRow({ ...pay, clientId });
      if (!payRow) return false;
    }

    // Vigencia: "purchase" = fecha fija desde hoy; "first_session" = la calcula Postgres al agendar la 1ª cita
    const fromFirst = AjustesService.validityMode() === "first_session" && s.validity_days;
    const row = { tenant_id: T.id, client_id: clientId, service_id: s.id, sessions_total: s.sessions, price_paid: pr,
      expires_at: !fromFirst && s.validity_days ? ymd(new Date(Date.now() + s.validity_days * 864e5)) : null };
    if (fromFirst) row.validity_days = s.validity_days;      // solo se envía en este modo (columna de la migración 007)

    const job = (async () => {
      const ins = await sb.from("client_packages").insert(row).select("id").single();
      if (ins.error) return { error: ins.error };
      if (payRow) {
        const pe = await sb.from("payments").insert({ ...payRow, client_package_id: ins.data.id });
        if (pe.error) { toast("El paquete se guardó, pero el abono falló: " + pe.error.message, 1); return { error: null }; }
      }
      return { error: null };
    })();
    // run() deduce servicio y operación del request: se las indicamos para que quede en "packages"
    job.url = { pathname: "/rest/v1/client_packages" }; job.method = "POST";
    return run(job, payRow ? "Paquete vendido con abono" : "Paquete registrado");
  }

  /** Cambia el vencimiento (null = sin vencimiento). */
  const setExpiry = (id, date) => run(sb.from("client_packages").update({ expires_at: date || null }).eq("id", id), "Vigencia actualizada");

  /** Extiende vencimiento sin recargar toda la UI (usado justo antes de agendar lote). */
  async function setExpiryDirect(id, date) {
    const { error } = await sb.from("client_packages").update({ expires_at: date || null }).eq("id", id);
    if (error) { toast(error.message, 1); return false; }
    return true;
  }

  /** Anula el paquete y cancela sus citas futuras (RPC cancel_package, atómica y auditada). */
  async function cancel(id, reason) {
    const p = D.p.find(x => x.id === id);
    if (!p) return false;
    const ok = await ask(`¿Anular el paquete de ${cn(p.client_id)}? Se cancelarán sus citas futuras. Las sesiones ya realizadas y los pagos se conservan.`, "Anular paquete");
    if (!ok) return false;
    return run(sb.rpc("cancel_package", { p_package_id: id, p_reason: reason || null }), "Paquete anulado");
  }
  return { isCancelled, sell, setExpiry, setExpiryDirect, cancel };
})();
