/* ==================================================================
   js/services/caja.js
   Propósito : Reglas de negocio y acceso a datos de Pagos y Caja
               (resumen agregado en servidor, listado paginado por período,
               registro multimoneda EUR/USD/VES y anulación auditada).
   Depende de: state.js, logger.js, ui.js
   La usan   : views/caja.js, views/paquetes.js, core/ui.js
   ================================================================== */

const CajaService = (() => {
  /* ---- Constantes de dominio (monedas y métodos aceptados en 003) ---- */
  const PAGE_SIZE = 30;
  const UNSAFE_HTML = /[<>]/;
  const SYM = { EUR: "€", USD: "US$", VES: "Bs" };
  const CURRENCIES = { EUR: "€ Euro", USD: "US$ Dólar", VES: "Bs Bolívar" };
  const METHODS = {
    efectivo: "Efectivo",
    zelle: "Zelle",
    pago_movil: "Pago Móvil",
    transferencia: "Transferencia",
    tarjeta: "Tarjeta",
    otro: "Otro"
  };

  /* ------------------------------------------------------------------
     1. Cálculo de rango temporal exacto [from, to) para Día / Mes / Año
     Por qué: Permite consultar únicamente los pagos del período visible
              usando el índice idx_payments_tenant_paid en Postgres.
     ------------------------------------------------------------------ */
  function periodRange(view, date) {
    const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
    let from, to;
    if (view === "day") {
      from = new Date(y, m, d, 0, 0, 0, 0);
      to   = new Date(y, m, d + 1, 0, 0, 0, 0);
    } else if (view === "month") {
      from = new Date(y, m, 1, 0, 0, 0, 0);
      to   = new Date(y, m + 1, 1, 0, 0, 0, 0);
    } else {
      from = new Date(y, 0, 1, 0, 0, 0, 0);
      to   = new Date(y + 1, 0, 1, 0, 0, 0, 0);
    }
    return { from, to, fromIso: from.toISOString(), toIso: to.toISOString() };
  }

  /* ------------------------------------------------------------------
     2. Resumen agregado de Caja en Postgres (usa RPC get_caja_summary)
     Por qué: Envía menos de 1 KB con totales por moneda y método en vez
              de descargar miles de pagos al teléfono para sumarlos en JS.
     ------------------------------------------------------------------ */
  async function getSummary(fromIso, toIso) {
    const emptySummary = { total_base: 0, count: 0, by_currency: [], by_method: [] };
    if (!sb || !T) return { summary: emptySummary, error: null };

    const t0 = performance.now();
    const { data, error } = await sb.rpc("get_caja_summary", {
      p_tenant_id: T.id,
      p_from: fromIso,
      p_to: toIso
    });

    if (error) {
      log("payments", "error", "payments.summary_failed", error.message, {
        ms: Math.round(performance.now() - t0),
        code: error.code
      });
      return { summary: emptySummary, error };
    }

    return { summary: data || emptySummary, error: null };
  }

  /* ------------------------------------------------------------------
     3. Listado paginado de pagos del período
     Por qué: Carga solo 30 movimientos iniciales (red móvil rápida) y
              permite pedir más bajo demanda con "Cargar más".
     ------------------------------------------------------------------ */
  async function listPage({ fromIso, toIso, limit = PAGE_SIZE, offset = 0 } = {}) {
    if (!sb || !T) return { items: [], total: 0, hasMore: false, error: null };

    const t0 = performance.now();
    const { data, count, error } = await sb
      .from("payments")
      .select("*", { count: "exact" })
      .gte("paid_at", fromIso)
      .lt("paid_at", toIso)
      .order("paid_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log("payments", "error", "payments.list_failed", error.message, {
        ms: Math.round(performance.now() - t0),
        code: error.code
      });
      return { items: [], total: 0, hasMore: false, error };
    }

    const items = data || [];
    const total = Number(count ?? items.length);
    return { items, total, hasMore: offset + items.length < total, error: null };
  }

  /* ------------------------------------------------------------------
     4. Registro de pago multimoneda (EUR / USD / VES)
     Por qué: Valida entradas en cliente; el disparador enforce_payment_integrity
              de 006 recalcula y sella rate y base_amount de forma autoritativa
              en Postgres para impedir manipulación desde el navegador.
     ------------------------------------------------------------------ */
  /** Valida un pago y devuelve la fila lista para insertar, o null (ya mostró el aviso).
      Se reutiliza en la venta de paquetes con abono inicial. */
  function buildRow({ clientId = null, packageId = null, amount, currency, rate, method, note = "" }) {
    const amt = Number(amount);
    const curCode = String(currency || T.currency);
    const rt = curCode === T.currency ? 1 : Number(rate);
    const cleanNote = String(note || "").trim();

    if (!(amt > 0 && amt <= 1e7)) { toast("Monto inválido (debe ser mayor a 0)", 1); return null; }
    if (!CURRENCIES[curCode]) { toast("Moneda no soportada", 1); return null; }
    if (curCode !== T.currency && !(rt > 0)) { toast("Indica la tasa del día para convertir a " + T.currency, 1); return null; }
    if (!METHODS[method]) { toast("Método de pago inválido", 1); return null; }
    if (cleanNote.length > 200 || UNSAFE_HTML.test(cleanNote)) { toast("La nota debe tener máximo 200 caracteres y sin < ni >", 1); return null; }

    const baseAmount = curCode === T.currency ? +amt.toFixed(2) : +(amt / rt).toFixed(2);
    if (!(baseAmount > 0)) { toast("El equivalente en " + T.currency + " debe ser mayor a 0", 1); return null; }

    return {
      tenant_id: T.id, client_id: clientId || null, client_package_id: packageId || null,
      amount: +amt.toFixed(2), currency: curCode, rate: rt, base_amount: baseAmount,
      method, note: cleanNote || null
    };
  }

  async function create(input) {
    const row = buildRow(input);
    if (!row) return false;
    return run(sb.from("payments").insert(row), "Pago registrado");
  }

  /* ------------------------------------------------------------------
     5. Anulación de pago con confirmación (sin UPDATE para trazabilidad)
     ------------------------------------------------------------------ */
  async function cancel(paymentId) {
    if (!paymentId) return false;
    const ok = await ask("¿Anular este pago? Quedará fuera de la caja.", "Anular");
    if (!ok) return false;
    return run(sb.from("payments").delete().eq("id", paymentId), "Pago anulado");
  }

  /* ------------------------------------------------------------------
     6. Total abonado a un paquete (apoyo para la vista de Paquetes)
     ------------------------------------------------------------------ */
  function paidForPackage(packageId) {
    return D.pay
      .filter(x => x.client_package_id === packageId)
      .reduce((total, x) => total + Number(x.base_amount), 0);
  }

  return {
    PAGE_SIZE,
    SYM,
    CURRENCIES,
    METHODS,
    periodRange,
    getSummary,
    listPage,
    buildRow,
    create,
    cancel,
    paidForPackage
  };
})();
