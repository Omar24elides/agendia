/* ==================================================================
   js/services/citas.js
   Propósito : Reglas de negocio y acceso a datos de Citas y Bloqueos:
               alta individual, alta por lote (paquetes), cambio de estado,
               reprogramar, bloqueos, carga por ventana y recordatorios WhatsApp.
   Depende de: state.js, schedule.js, ui.js (run, ask, toast), equipo.js
   La usan   : views/calendario.js, views/programar.js, core/ui.js
   ================================================================== */
const CitasService = (() => {
  const UNSAFE_HTML = /[<>]/;

  /* ------------------------------------------------------------------
     1. Cambio de estado (pendiente, confirmada, completada, cancelada)
     ------------------------------------------------------------------ */
  function setStatus(id, st) {
    const a = D.a.find(x => x.id === id);
    if (!a) return false;
    if (st === "completed" && new Date(a.starts_at) > new Date()) {
      toast("No puedes completar una cita futura", 1);
      return false;
    }
    return run(sb.from("appointments").update({ status: st }).eq("id", id), "Cita actualizada");
  }

  /* ------------------------------------------------------------------
     2. Alta de cita individual con validaciones de horario y bloqueos
     ------------------------------------------------------------------ */
  async function create({ clientId, serviceId, packageId, staffId, start, dur, zone }) {
    const d = Number(dur);
    const s = new Date(start);
    const cleanZone = String(zone || "").trim();

    if (!clientId) { toast("Elige " + V().un + " " + V().c, 1); return false; }
    if (isNaN(s)) { toast("Fecha y hora inválidas", 1); return false; }
    if (!(d >= 5 && d <= 480)) { toast("Duración inválida (5 a 480 minutos)", 1); return false; }
    if (cleanZone.length > 120 || UNSAFE_HTML.test(cleanZone)) {
      toast("Zona inválida (máximo 120 caracteres, sin < ni >)", 1);
      return false;
    }

    const en = new Date(+s + d * 6e4);
    if (outside(s, en) && !(await ask("Ese horario está fuera de tu horario de trabajo. ¿Agendar igual?", "Agendar igual"))) return false;
    if (D.b.some(b => s < new Date(b.ends_at) && en > new Date(b.starts_at)) && !(await ask("Cae en un bloqueo de 'Ocupada'. ¿Agendar igual?", "Agendar igual"))) return false;

    const row = {
      tenant_id: T.id,
      client_id: clientId,
      service_id: serviceId || null,
      client_package_id: packageId || null,
      starts_at: s.toISOString(),
      ends_at: en.toISOString(),
      zone: cleanZone || null,
      status: "confirmed",
      source: "manual"
    };
    if (staffId) row.staff_id = staffId;   // columna opcional de migración 007
    return run(sb.from("appointments").insert(row), "Cita agendada");
  }

  /* ------------------------------------------------------------------
     3. Alta por lote (programación de múltiples sesiones de un paquete)
     ------------------------------------------------------------------ */
  function createBatch(rows) {
    if (!rows || !rows.length) return false;
    return run(sb.from("appointments").insert(rows), rows.length + " sesiones agendadas");
  }

  /* ------------------------------------------------------------------
     4. Reprogramación de cita existente
     ------------------------------------------------------------------ */
  async function reschedule(id, { start, dur, staffId }) {
    const a = D.a.find(x => x.id === id);
    const s = new Date(start), d = +dur;
    if (!a || isNaN(s)) { toast("Fecha inválida", 1); return false; }
    if (!(d >= 5 && d <= 480)) { toast("Duración inválida (5 a 480 minutos)", 1); return false; }
    const en = new Date(+s + d * 6e4);
    if (outside(s, en) && !(await ask("Ese horario está fuera de tu horario de trabajo. ¿Reprogramar igual?", "Reprogramar igual"))) return false;
    if (D.b.some(b => s < new Date(b.ends_at) && en > new Date(b.starts_at)) && !(await ask("Cae en un bloqueo de 'Ocupada'. ¿Reprogramar igual?", "Reprogramar igual"))) return false;
    const row = { starts_at: s.toISOString(), ends_at: en.toISOString() };
    if (staffId !== undefined) row.staff_id = staffId || null;
    return run(sb.from("appointments").update(row).eq("id", id), "Cita reprogramada");
  }

  /* ------------------------------------------------------------------
     5. Bloqueos ("Ocupada / No disponible")
     ------------------------------------------------------------------ */
  function createBlock({ allDay, start, end, reason }) {
    const s = new Date(allDay ? String(start).slice(0, 10) + "T00:00" : start);
    const en = new Date(allDay ? String(end).slice(0, 10) + "T23:59" : end);
    const cleanReason = String(reason || "Ocupada").trim();

    if (isNaN(s) || isNaN(en) || en <= s) {
      toast("La fecha/hora final debe ser posterior a la inicial", 1);
      return false;
    }
    if (cleanReason.length > 120 || UNSAFE_HTML.test(cleanReason)) {
      toast("Motivo inválido (máximo 120 caracteres, sin < ni >)", 1);
      return false;
    }

    return run(
      sb.from("blocks").insert({
        tenant_id: T.id,
        starts_at: s.toISOString(),
        ends_at: en.toISOString(),
        reason: cleanReason || "Ocupada"
      }),
      "Horario bloqueado"
    );
  }

  const deleteBlock = id => run(sb.from("blocks").delete().eq("id", id), "Bloqueo quitado");

  /* ------------------------------------------------------------------
     6. Ventana bajo demanda: si el usuario navega a un mes/año anterior
        al rango cargado en boot.js, trae ese rango sin recargar todo.
     ------------------------------------------------------------------ */
  async function ensureWindow(date) {
    if (!sb || !T || !WIN_START) return;
    const target = new Date(date.getFullYear(), date.getMonth(), 1);
    if (target >= WIN_START) return;

    const prevIso = target.toISOString();
    const curIso = WIN_START.toISOString();
    WIN_START = target;   // amplía la ventana hacia atrás para no repetir consulta

    const [aRes, bRes] = await Promise.all([
      sb.from("appointments").select("*").gte("starts_at", prevIso).lt("starts_at", curIso).order("starts_at"),
      sb.from("blocks").select("*").gte("ends_at", prevIso).lt("ends_at", curIso).order("starts_at")
    ]);
    if (!aRes.error && aRes.data?.length) D.a = [...aRes.data, ...D.a];
    if (!bRes.error && bRes.data?.length) D.b = [...bRes.data, ...D.b];
    if (tab === "agenda") render();
  }

  /* ------------------------------------------------------------------
     7. Recordatorios por WhatsApp (enlace wa.me)
     ------------------------------------------------------------------ */
  const reminderText = a => {
    const when = new Date(a.starts_at);
    return `Hola ${cn(a.client_id)} 👋 Te recordamos tu cita de ${sn(a.service_id)} el ${when.toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" })} a las ${hm(a.starts_at)}. ¿Nos confirmas? 💛 ${T.name}`;
  };

  const reminderUrl = a => {
    const c = D.c.find(x => x.id === a.client_id);
    return c ? `https://wa.me/${String(c.phone).replace(/\D/g, "")}?text=${encodeURIComponent(reminderText(a))}` : null;
  };

  const tomorrow = () => {
    const s = addD(startOf(new Date()), 1), e = addD(s, 1);
    return D.a.filter(a => ["pending", "confirmed"].includes(a.status) && new Date(a.starts_at) >= s && new Date(a.starts_at) < e);
  };

  return { setStatus, create, createBatch, reschedule, createBlock, deleteBlock, ensureWindow, reminderText, reminderUrl, tomorrow };
})();
