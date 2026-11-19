/* ==================================================================
   js/public/reservar.js
   Propósito : Página pública de reservas (sin sesión).
               Lee ?e=<slug>, consulta public_booking_info() y agenda con
               public_book() respetando horario laboral y cupos ocupados.
   Depende de: config.js, supabase-js (CDN)
   La usan   : web/reservar.html
   ================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const slug = new URLSearchParams(location.search).get("e") || "";
const sb = (typeof SUPABASE_URL === "undefined" || SUPABASE_URL.startsWith("PEGA"))
  ? null : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const toast = (m, bad) => {
  const d = document.createElement("div");
  d.textContent = (bad ? "⚠️ " : "✓ ") + m;
  $("#toast").append(d);
  setTimeout(() => d.remove(), 3500);
};

let INFO = null;
const BK = { serviceId: "", staffId: "", date: "", slotIso: "" };

/* ---- Utilidades de horario (espejo de schedule.js sobre INFO.working_hours) ---- */
const hmMin = t => { const [a, b] = String(t || "08:00").split(":"); return +a * 60 + +b; };
const ymdLocal = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

function dayHours(dow) {
  const def = { on: dow > 0, f: "08:00", t: "15:00" };
  return (INFO.working_hours && INFO.working_hours[dow]) || def;
}

function withinWorkingHours(s, e) {
  const h = dayHours(s.getDay());
  if (!h.on || s.toDateString() !== e.toDateString()) return false;
  const sm = s.getHours() * 60 + s.getMinutes();
  const em = e.getHours() * 60 + e.getMinutes();
  const spans = [[hmMin(h.f), hmMin(h.t)]];
  if (h.f2 && h.t2) spans.push([hmMin(h.f2), hmMin(h.t2)]);
  return spans.some(([a, b]) => sm >= a && em <= b);
}

function freeSlotsForDay(dateStr, durMin) {
  const out = [];
  const minStart = new Date(Date.now() + 60 * 60 * 1000); // mínimo 1 hora de anticipación (regla de public_book)
  const base = new Date(dateStr + "T00:00:00");
  const busy = INFO.busy || [];

  for (let m = 360; m <= 1320; m += 30) {
    const s = new Date(base);
    s.setHours(0, m, 0, 0);
    const e = new Date(+s + durMin * 6e4);
    if (s < minStart || !withinWorkingHours(s, e)) continue;

    // Bloqueos (staff=null) aplican a todos; citas aplican al profesional elegido (o a todos si no hay equipo)
    const clashes = busy.some(b => {
      const bs = new Date(b.s), be = new Date(b.e);
      if (!(s < be && e > bs)) return false;
      if (!b.staff) return true;
      return !BK.staffId || b.staff === BK.staffId;
    });
    if (!clashes) out.push(s);
  }
  return out;
}

function renderBooking() {
  const sym = INFO.currency === "EUR" ? "€" : INFO.currency;
  const svcs = INFO.services || [];
  const staff = INFO.staff || [];
  const selSvc = svcs.find(x => x.id === BK.serviceId) || svcs[0];
  if (selSvc && !BK.serviceId) BK.serviceId = selSvc.id;

  const days = [...Array(21)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return ymdLocal(d);
  });
  if (!BK.date) BK.date = days[0];

  const slots = selSvc ? freeSlotsForDay(BK.date, selSvc.duration_min || 60) : [];
  if (BK.slotIso && !slots.some(s => s.toISOString() === BK.slotIso)) BK.slotIso = "";

  $("#app").innerHTML = `
    <header>
      <h1>${esc(INFO.name)}</h1>
      <button class="ghost sm" onclick="document.documentElement.dataset.t=document.documentElement.dataset.t==='dark'?'light':'dark'">◐</button>
    </header>
    <main style="max-width:640px">
      <div class="top"><div><h2>Reservar cita</h2><span class="mu">Elige el servicio, día y hora disponible</span></div></div>
      ${!svcs.length ? `<div class="card"><p class="mu">Este negocio aún no tiene servicios públicos disponibles.</p></div>` : `
      <form class="card f" onsubmit="submitBooking(event);return false">
        <label>Servicio
          <select onchange="BK.serviceId=this.value;BK.slotIso='';renderBooking()">
            ${svcs.map(s => `<option value="${s.id}" ${s.id === BK.serviceId ? "selected" : ""}>${esc(s.category)} · ${esc(s.name)} (${s.price} ${sym} · ${s.duration_min} min)</option>`).join("")}
          </select>
        </label>
        ${selSvc?.description ? `<p class="mu" style="margin:-4px 0 4px">${esc(selSvc.description)}</p>` : ""}
        ${staff.length ? `
          <label>Profesional
            <select onchange="BK.staffId=this.value;BK.slotIso='';renderBooking()">
              <option value="">Cualquiera disponible</option>
              ${staff.map(st => `<option value="${st.id}" ${st.id === BK.staffId ? "selected" : ""}>${esc(st.name)}</option>`).join("")}
            </select>
          </label>` : ""}
        <label>Día
          <select onchange="BK.date=this.value;BK.slotIso='';renderBooking()">
            ${days.map(ds => {
              const label = new Date(ds + "T12:00:00").toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
              return `<option value="${ds}" ${ds === BK.date ? "selected" : ""}>${esc(label)}</option>`;
            }).join("")}
          </select>
        </label>
        <div>
          <span class="mu" style="display:block;margin-bottom:6px">Hora disponible</span>
          <div class="chips">
            ${slots.length ? slots.map(s => {
              const iso = s.toISOString();
              const txt = s.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
              return `<button type="button" class="pill t ${BK.slotIso === iso ? "res" : "info"}" onclick="BK.slotIso='${iso}';renderBooking()">${txt}</button>`;
            }).join("") : '<span class="mu">Sin horarios libres este día. Prueba otro día.</span>'}
          </div>
        </div>
        <div class="f2">
          <label>Tu nombre<input name="name" required minlength="2" maxlength="80" placeholder="Ej: María Pérez"></label>
          <label>Teléfono (WhatsApp)<input name="phone" required maxlength="20" inputmode="tel" placeholder="584121234567"></label>
        </div>
        <label>Zona o referencia (opcional)<input name="zone" maxlength="120" placeholder="Ej: Chacao, Altamira"></label>
        <label class="chk"><input type="checkbox" name="consent"> Quiero recibir promociones y recordatorios</label>
        <button ${BK.slotIso ? "" : "disabled"}>Confirmar solicitud de cita</button>
      </form>`}
    </main>`;
}

async function submitBooking(e) {
  if (!BK.slotIso) return toast("Elige una hora disponible", 1);
  const f = new FormData(e.target);
  const btn = e.target.querySelector("button[type=submit], button:not([type=button])");
  if (btn) btn.disabled = true;

  const { data, error } = await sb.rpc("public_book", {
    p_slug: slug,
    p_service_id: BK.serviceId,
    p_staff_id: BK.staffId || null,
    p_starts_at: BK.slotIso,
    p_name: f.get("name"),
    p_phone: f.get("phone"),
    p_zone: f.get("zone") || null,
    p_consent: !!f.get("consent")
  });

  if (btn) btn.disabled = false;
  if (error) return toast(error.message, 1);

  const when = new Date(data.starts_at).toLocaleString("es", { dateStyle: "full", timeStyle: "short" });
  $("#app").innerHTML = `
    <main style="max-width:520px;margin-top:40px">
      <div class="card" style="text-align:center;padding:28px">
        <h2>¡Solicitud enviada!</h2>
        <p>Tu cita en <b>${esc(data.business)}</b> para el <b>${esc(when)}</b> quedó registrada como <b>pendiente por confirmar</b>.</p>
        <p class="mu">Te contactaremos pronto por WhatsApp.</p>
        <button class="ghost" onclick="BK.slotIso='';initPublic()">Hacer otra reserva</button>
      </div>
    </main>`;
}

async function initPublic() {
  if (!sb) {
    $("#app").innerHTML = `<div class="login"><h1>Falta configurar</h1><p class="mu">Revisa <code>config.js</code>.</p></div>`;
    return;
  }
  if (!slug) {
    $("#app").innerHTML = `<div class="login"><h1>Enlace incompleto</h1><p class="mu">Pide al negocio su enlace personalizado de reservas.</p></div>`;
    return;
  }
  $("#app").innerHTML = `<main style="max-width:520px;margin-top:40px"><div class="card"><span class="sk sk-l"></span><span class="sk sk-l sk-m"></span></div></main>`;
  const { data, error } = await sb.rpc("public_booking_info", { p_slug: slug });
  if (error || !data) {
    $("#app").innerHTML = `<div class="login"><h1>Reservas no disponibles</h1><p class="mu">Este negocio no tiene las reservas en línea activas o el enlace es incorrecto.</p></div>`;
    return;
  }
  INFO = data;
  renderBooking();
}

initPublic();
