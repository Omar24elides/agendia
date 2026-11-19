/* ==================================================================
   js/views/calendario.js
   Propósito : Calendario (día, semana, mes, año), nueva cita, bloqueos y detalle de cita.
   Depende de: state.js, schedule.js, ui.js
   La usan   : render.js
   ================================================================== */
/* ---- calendario ---- */
let cv = "week", cd = new Date();
const live = a => ["pending", "confirmed", "completed"].includes(a.status);
const cap = s => s[0].toUpperCase() + s.slice(1);
const startOf = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addD = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const wk = d => addD(startOf(d), -((d.getDay() + 6) % 7));
const fmtDT = d => new Date(d).toLocaleString("es", {dateStyle: "short", timeStyle: "short"});
const range = () => { const H = hrs(); let a = 6, b = 22; for (const k in H) if (H[k].on) for (const [x, y] of spans(H[k])) { a = Math.min(a, Math.floor(x / 60)); b = Math.max(b, Math.ceil(y / 60) - 1); } return [a, b]; };

/* Filtro por profesional: "all" = todos, "none" = sin asignar, o el id de un profesional. Solo aplica si hay equipo. */
let STAFF_F = "all";
/** Citas vivas que se cruzan con [s,e), según el profesional filtrado. */
function overlapping(s, e) {
  const L = D.a.filter(a => live(a) && new Date(a.starts_at) < e && new Date(a.ends_at) > s), act = EquipoService.active();
  if (!act.length || STAFF_F === "all") return L;
  return L.filter(a => STAFF_F === "none" ? !a.staff_id : a.staff_id === STAFF_F);
}
/* En "todos" con equipo, una hora solo está llena si TODOS los profesionales están ocupados. */
function allBusy(L) {
  const act = EquipoService.active();
  if (!L.length) return false;
  if (!act.length || STAFF_F !== "all") return true;
  return new Set(L.map(a => a.staff_id || "none")).size >= act.length;
}

/* estado de una hora de un día: res (cita) > off (no se trabaja) > occ (bloqueo) > lib */
function slot(d, h) {
  const s = new Date(d); s.setHours(h, 0, 0, 0);
  const e = new Date(+s + 36e5), w = hrs()[d.getDay()];
  const L = overlapping(s, e), ap = L[0];
  if (ap && allBusy(L)) return {k: "res", ap, s};
  if (!w.on || !spans(w).some(([a, b]) => h * 60 < b && h * 60 + 60 > a)) return {k: "off", s};
  const b = D.b.find(b => new Date(b.starts_at) < e && new Date(b.ends_at) > s);
  return b ? {k: "occ", b, s} : {k: "lib", s};
}
const calGo = (v, d) => { cv = v || cv; if (d) cd = new Date(d); render(); CitasService.ensureWindow(cd); };
const calNav = n => {
  cd = cv === "day" ? addD(cd, n) : cv === "week" ? addD(cd, 7 * n) : cv === "month" ? new Date(cd.getFullYear(), cd.getMonth() + n, 1) : new Date(cd.getFullYear() + n, cd.getMonth(), 1);
  render();
  CitasService.ensureWindow(cd);
};
const calLabel = () => {
  if (cv === "day") return cap(cd.toLocaleDateString("es", {weekday: "short", day: "numeric", month: "long"}).replace(".", "").replace(",", ""));
  if (cv === "week") { const m = wk(cd), o = {day: "numeric", month: "short"}; return `${m.toLocaleDateString("es", o).replace(".", "")} – ${addD(m, 6).toLocaleDateString("es", o).replace(".", "")}`; }
  if (cv === "month") return cap(cd.toLocaleDateString("es", {month: "long", year: "numeric"}).replace(" de ", " "));
  return String(cd.getFullYear());
};

function vAgenda() {
  const body = {day: vDay, week: vWeek, month: vMonth, year: vYear}[cv]();
  const st = EquipoService.active();
  const staffSel = st.length ? `<label class="mu" style="display:block;margin:0 0 10px">Profesional<select onchange="STAFF_F=this.value;render()"><option value="all" ${STAFF_F === "all" ? "selected" : ""}>Todos</option>${st.map(s => `<option value="${s.id}" ${STAFF_F === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}<option value="none" ${STAFF_F === "none" ? "selected" : ""}>Sin asignar</option></select></label>` : "";
  return `<div class="top"><div><h2>Calendario</h2><span class="mu">Reservas, bloqueos y horarios en una sola vista</span></div><div class="btns"><button class="ghost" onclick="remindersModal()">🔔 Recordatorios</button><button onclick="apptForm()">＋ Nueva cita</button></div></div>
  ${staffSel}
  <div class="seg">${[["day", "Día"], ["week", "Semana"], ["month", "Mes"], ["year", "Año"]].map(([k, l]) => `<button class="${k === cv ? "on" : ""}" onclick="calGo('${k}')">${l}</button>`).join("")}</div>
  <div class="cnav"><button class="ghost sm" onclick="calNav(-1)">‹</button><div><b>${calLabel()}</b><br><a href="#" onclick="cd=new Date();render();return false">Hoy</a></div><button class="ghost sm" onclick="calNav(1)">›</button></div>
  <div class="card">${body}</div>
  <div class="leg"><span><i class="lib"></i>Libre</span><span><i class="res"></i>Reservada</span><span><i class="occ"></i>Ocupada / bloqueada</span><span><i class="off"></i>No se trabaja</span></div>
  <button class="ghost" style="width:100%" onclick="cfgMenu()">Configurar horarios, horas sin trabajo y bloqueos</button>`;
}

function vDay() {
  const [a, b] = range(), rows = [];
  for (let h = a; h <= b; h++) {
    const s = slot(cd, h); let inner;
    if (s.k === "res") inner = `<div class="sl res" onclick="apptModal('${s.ap.id}')">${esc(cn(s.ap.client_id))} · ${esc(sn(s.ap.service_id))}</div>`;
    else if (s.k === "occ") inner = `<div class="sl occ" onclick="blockModal('${s.b.id}')">${esc(s.b.reason)}</div>`;
    else if (s.k === "off") inner = `<div class="sl off">Fuera de horario</div>`;
    else inner = `<div class="sl lib" onclick="apptForm('${s.s.toISOString()}')">Libre · toca para agendar</div>`;
    rows.push(`<div class="hr"><span class="mu">${h}:00</span>${inner}</div>`);
  }
  return rows.join("");
}

function vWeek() {
  const [a, b] = range(), n = b - a + 1, m = wk(cd), today = new Date().toDateString();
  let g = `<span></span>` + [...Array(n)].map((_, i) => `<span class="mu hh">${(a + i) % 3 === 0 ? (a + i) + "h" : ""}</span>`).join("");
  for (let i = 0; i < 7; i++) {
    const d = addD(m, i), iso = d.toISOString();
    g += `<b class="dl ${d.toDateString() === today ? "td" : ""}" onclick="calGo('day','${iso}')">${cap(d.toLocaleDateString("es", {weekday: "short"}).replace(".", ""))} ${d.getDate()}</b>`
      + [...Array(n)].map((_, k) => `<i class="c ${slot(d, a + k).k}" onclick="calGo('day','${iso}')"></i>`).join("");
  }
  return `<div class="wg" style="--n:${n}">${g}</div>`;
}

function vMonth() {
  const y = cd.getFullYear(), mo = cd.getMonth(), pad = (new Date(y, mo, 1).getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate(), today = new Date().toDateString(), [a, b] = range();
  let c = ["L", "M", "X", "J", "V", "S", "D"].map(x => `<span class="mu hh">${x}</span>`).join("") + "<span></span>".repeat(pad);
  for (let i = 1; i <= days; i++) {
    const d = new Date(y, mo, i), st = [...Array(b - a + 1)].map((_, k) => slot(d, a + k).k);
    const cnt = D.a.filter(x => live(x) && new Date(x.starts_at).toDateString() === d.toDateString()).length;
    const k = !hrs()[d.getDay()].on ? "off" : (!st.includes("lib") && st.includes("occ")) ? "occ" : "lib";
    c += `<div class="mc ${k} ${d.toDateString() === today ? "td" : ""}" onclick="calGo('day','${d.toISOString()}')"><b>${i}</b><span class="${cnt ? "ct" : "mu"}">${cnt || "·"}</span></div>`;
  }
  return `<div class="mg">${c}</div>`;
}

function vYear() {
  const y = cd.getFullYear();
  return `<div class="yg">${[...Array(12)].map((_, i) => {
    const n = D.a.filter(a => live(a) && new Date(a.starts_at).getFullYear() === y && new Date(a.starts_at).getMonth() === i).length;
    return `<div class="yc" onclick="calGo('month','${new Date(y, i, 1).toISOString()}')"><b>${cap(new Date(y, i, 1).toLocaleDateString("es", {month: "short"}).replace(".", ""))}</b><br><span class="${n ? "ct" : "mu"}">${n} reservas</span></div>`;
  }).join("")}</div>`;
}

function apptModal(id) {
  const a = D.a.find(x => x.id === id), open = ["pending", "confirmed"].includes(a.status), wa = CitasService.reminderUrl(a);
  modal("Cita", `<p><b>${esc(cn(a.client_id))}</b><br>${esc(sn(a.service_id))}${a.staff_id ? " · " + esc(EquipoService.name(a.staff_id)) : ""}<br><span class="mu">${new Date(a.starts_at).toLocaleDateString("es", {weekday: "long", day: "numeric", month: "long"})} · ${hm(a.starts_at)}–${hm(a.ends_at)}${a.zone ? " · " + esc(a.zone) : ""}</span></p>
  <p><span class="pill ${a.status}">${ST[a.status]}</span>${a.source === "web" ? ' <span class="pill info">Reserva en línea</span>' : ""}</p><div class="btns">${a.status === "pending" ? `<button onclick="setSt('${a.id}','confirmed')">Confirmar</button>` : ""}
  ${open ? `<button onclick="setSt('${a.id}','completed')">Completada</button><button class="ghost" onclick="reschedForm('${a.id}')">Reprogramar</button>${wa ? `<a class="btn ghost" target="_blank" rel="noopener" href="${wa}">💬 Recordar por WhatsApp</a>` : ""}<button class="ghost" onclick="setSt('${a.id}','cancelled')">Cancelar cita</button>` : ""}</div>`);
}

/** Reprogramar: nueva fecha/hora, duración y profesional (valida CitasService.reschedule). */
function reschedForm(id) {
  const a = D.a.find(x => x.id === id), s = new Date(a.starts_at), dur = Math.round((new Date(a.ends_at) - s) / 6e4);
  const v = new Date(+s - s.getTimezoneOffset() * 6e4).toISOString().slice(0, 16), st = EquipoService.active();
  modal("Reprogramar cita", `<form class="f" onsubmit="CitasService.reschedule('${id}',{start:this.start.value,dur:this.dur.value,staffId:this.staff?this.staff.value:undefined});return false">
  <p style="margin:0"><b>${esc(cn(a.client_id))}</b> · ${esc(sn(a.service_id))}</p>
  <div class="f2"><label>Nueva fecha y hora<input name="start" type="datetime-local" value="${v}" required></label><label>Duración (min)<input name="dur" data-num="int" inputmode="numeric" value="${dur}"></label></div>
  ${st.length ? `<label>Profesional<select name="staff"><option value="">Sin asignar</option>${st.map(x => `<option value="${x.id}" ${a.staff_id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>` : ""}
  <button>Guardar cambio</button></form>`);
}

/** Recordatorios de mañana: lista con enlace de WhatsApp ya redactado para cada cita. */
function remindersModal() {
  const L = CitasService.tomorrow().sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  modal("Recordatorios de mañana", L.length ? `<p class="mu" style="margin:0 0 8px">Toca cada botón: se abre WhatsApp con el mensaje listo para enviar.</p><div class="card">${L.map(a => `<div class="row"><div><b>${esc(cn(a.client_id))}</b><br><span class="mu">${hm(a.starts_at)} · ${esc(sn(a.service_id))}</span></div><a class="btn sm" target="_blank" rel="noopener" href="${CitasService.reminderUrl(a)}">💬 Enviar</a></div>`).join("")}</div>` : empty("No hay citas para mañana."));
}
function blockModal(id) {
  const b = D.b.find(x => x.id === id);
  modal("Bloqueo", `<p><b>${esc(b.reason)}</b><br><span class="mu">${fmtDT(b.starts_at)} → ${fmtDT(b.ends_at)}</span></p><button onclick="CitasService.deleteBlock('${b.id}')">Quitar bloqueo</button>`);
}
const cfgMenu = () => modal("Configurar", `<div class="f"><button onclick="dlg.close();tab='horario';render()">⏰ Horario de trabajo (horas sin trabajo)</button><button class="ghost" onclick="blockForm()">🚫 Bloquear horas o días</button></div>`);

function apptForm(iso, clientId) {
  if (!D.c.length) return toast(`Primero crea ${V().un} ${V().c}`, 1);
  const v = iso ? new Date(new Date(iso) - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "", st = EquipoService.active();
  modal("Nueva cita", `<form class="f" onsubmit="addAppt(event);return false"><label>${V().C}<select name="client" onchange="pkgOpts(this.form)" required>${clientOpts()}</select></label>
  <label>¿Usa un paquete?<select name="pkg" onchange="pkgPick(this.form)"></select></label>
  <label>Servicio<select name="service" onchange="this.form.dur.value=this.selectedOptions[0].dataset.d">${D.s.filter(s => s.active).map(s => `<option value="${s.id}" data-d="${s.duration_min || 60}">${esc(s.name)}</option>`).join("")}</select></label>
  ${st.length ? `<label>Profesional<select name="staff"><option value="">Sin asignar</option>${st.map(x => `<option value="${x.id}" ${STAFF_F === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label>` : ""}
  <div class="f2"><label>Fecha y hora<input name="start" type="datetime-local" value="${v}" required></label><label>Duración (min)<input name="dur" data-num="int" inputmode="numeric" value="${D.s.find(s => s.active)?.duration_min || 60}"></label></div>
  <label>Zona<input name="zone" placeholder="Ej: Chacao" maxlength="120"></label><button>Agendar</button></form>`);
  if (clientId) $("#dlg form").client.value = clientId;
  pkgOpts($("#dlg form"));
}
function pkgOpts(f) {   // paquetes de la clienta con sesiones sin agendar, no vencidos y no anulados
  f.pkg.innerHTML = '<option value="">Sesión suelta (sin paquete)</option>' + D.p.filter(p => !PaquetesService.isCancelled(p) && p.client_id === f.client.value && committed(p).length < p.sessions_total && (!p.expires_at || p.expires_at >= today()))
    .map(p => `<option value="${p.id}">${esc(sn(p.service_id))} · quedan ${p.sessions_total - committed(p).length}</option>`).join("");
}
function pkgPick(f) { const p = D.p.find(x => x.id === f.pkg.value); if (p) { f.service.value = p.service_id; f.dur.value = D.s.find(s => s.id === p.service_id)?.duration_min || 60; } }
async function addAppt(e) {
  const f = new FormData(e.target);
  CitasService.create({
    clientId: f.get("client"),
    serviceId: f.get("service"),
    packageId: f.get("pkg"),
    staffId: f.get("staff"),
    start: f.get("start"),
    dur: f.get("dur"),
    zone: f.get("zone")
  });
}
function blockForm() {
  modal("Bloquear horas o días", `<form class="f" onsubmit="addBlock(event);return false">
  <label>Desde<input name="start" type="datetime-local" required></label><label>Hasta<input name="end" type="datetime-local" required></label>
  <label class="chk"><input type="checkbox" name="all" onchange="this.form.start.type=this.form.end.type=this.checked?'date':'datetime-local'"> Todo el día (vacaciones, día libre)</label>
  <label>Motivo<input name="reason" value="Ocupada"></label><button>Bloquear</button></form>`);
}
function addBlock(e) {
  const f = new FormData(e.target);
  CitasService.createBlock({
    allDay: !!f.get("all"),
    start: f.get("start"),
    end: f.get("end"),
    reason: f.get("reason")
  });
}
