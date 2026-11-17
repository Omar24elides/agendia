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

/* estado de una hora de un día: res (cita) > off (no se trabaja) > occ (bloqueo) > lib */
function slot(d, h) {
  const s = new Date(d); s.setHours(h, 0, 0, 0);
  const e = new Date(+s + 36e5), w = hrs()[d.getDay()];
  const ap = D.a.find(a => live(a) && new Date(a.starts_at) < e && new Date(a.ends_at) > s);
  if (ap) return {k: "res", ap, s};
  if (!w.on || !spans(w).some(([a, b]) => h * 60 < b && h * 60 + 60 > a)) return {k: "off", s};
  const b = D.b.find(b => new Date(b.starts_at) < e && new Date(b.ends_at) > s);
  return b ? {k: "occ", b, s} : {k: "lib", s};
}
const calGo = (v, d) => { cv = v || cv; if (d) cd = new Date(d); render(); };
const calNav = n => {
  cd = cv === "day" ? addD(cd, n) : cv === "week" ? addD(cd, 7 * n) : cv === "month" ? new Date(cd.getFullYear(), cd.getMonth() + n, 1) : new Date(cd.getFullYear() + n, cd.getMonth(), 1);
  render();
};
const calLabel = () => {
  if (cv === "day") return cap(cd.toLocaleDateString("es", {weekday: "short", day: "numeric", month: "long"}).replace(".", "").replace(",", ""));
  if (cv === "week") { const m = wk(cd), o = {day: "numeric", month: "short"}; return `${m.toLocaleDateString("es", o).replace(".", "")} – ${addD(m, 6).toLocaleDateString("es", o).replace(".", "")}`; }
  if (cv === "month") return cap(cd.toLocaleDateString("es", {month: "long", year: "numeric"}).replace(" de ", " "));
  return String(cd.getFullYear());
};

function vAgenda() {
  const body = {day: vDay, week: vWeek, month: vMonth, year: vYear}[cv]();
  return `<div class="top"><div><h2>Calendario</h2><span class="mu">Reservas, bloqueos y horarios en una sola vista</span></div><button onclick="apptForm()">＋ Nueva cita</button></div>
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
  const a = D.a.find(x => x.id === id);
  modal("Cita", `<p><b>${esc(cn(a.client_id))}</b><br>${esc(sn(a.service_id))}<br><span class="mu">${new Date(a.starts_at).toLocaleDateString("es", {weekday: "long", day: "numeric", month: "long"})} · ${hm(a.starts_at)}–${hm(a.ends_at)}${a.zone ? " · " + esc(a.zone) : ""}</span></p>
  <p><span class="pill ${a.status}">${ST[a.status]}</span></p><div class="btns">${a.status === "pending" ? `<button onclick="setSt('${a.id}','confirmed')">Confirmar</button>` : ""}
  ${["pending", "confirmed"].includes(a.status) ? `<button onclick="setSt('${a.id}','completed')">Completada</button><button class="ghost" onclick="setSt('${a.id}','cancelled')">Cancelar cita</button>` : ""}</div>`);
}
function blockModal(id) {
  const b = D.b.find(x => x.id === id);
  modal("Bloqueo", `<p><b>${esc(b.reason)}</b><br><span class="mu">${fmtDT(b.starts_at)} → ${fmtDT(b.ends_at)}</span></p><button onclick="run(sb.from('blocks').delete().eq('id','${b.id}'),'Bloqueo quitado')">Quitar bloqueo</button>`);
}
const cfgMenu = () => modal("Configurar", `<div class="f"><button onclick="dlg.close();tab='horario';render()">⏰ Horario de trabajo (horas sin trabajo)</button><button class="ghost" onclick="blockForm()">🚫 Bloquear horas o días</button></div>`);

function apptForm(iso) {
  if (!D.c.length) return toast("Primero crea una clienta", 1);
  const v = iso ? new Date(new Date(iso) - new Date(iso).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : "";
  modal("Nueva cita", `<form class="f" onsubmit="addAppt(event);return false"><label>Clienta<select name="client" onchange="pkgOpts(this.form)" required>${clientOpts()}</select></label>
  <label>¿Usa un paquete?<select name="pkg" onchange="pkgPick(this.form)"></select></label>
  <label>Servicio<select name="service" onchange="this.form.dur.value=this.selectedOptions[0].dataset.d">${D.s.filter(s => s.active).map(s => `<option value="${s.id}" data-d="${s.duration_min || 60}">${esc(s.name)}</option>`).join("")}</select></label>
  <div class="f2"><label>Fecha y hora<input name="start" type="datetime-local" value="${v}" required></label><label>Duración (min)<input name="dur" data-num="int" inputmode="numeric" value="${D.s.find(s => s.active)?.duration_min || 60}"></label></div>
  <label>Zona<input name="zone" placeholder="Ej: Chacao" maxlength="120"></label><button>Agendar</button></form>`);
  pkgOpts($("#dlg form"));
}
function pkgOpts(f) {   // paquetes de la clienta con sesiones sin agendar y no vencidos
  f.pkg.innerHTML = '<option value="">Sesión suelta (sin paquete)</option>' + D.p.filter(p => p.client_id === f.client.value && committed(p).length < p.sessions_total && (!p.expires_at || p.expires_at >= today()))
    .map(p => `<option value="${p.id}">${esc(sn(p.service_id))} · quedan ${p.sessions_total - committed(p).length}</option>`).join("");
}
function pkgPick(f) { const p = D.p.find(x => x.id === f.pkg.value); if (p) { f.service.value = p.service_id; f.dur.value = D.s.find(s => s.id === p.service_id)?.duration_min || 60; } }
async function addAppt(e) {
  const f = new FormData(e.target), dur = +f.get("dur"), s = new Date(f.get("start")), en = new Date(+s + dur * 6e4);
  if (!(dur >= 5 && dur <= 480)) return toast("Duración inválida", 1);
  if (outside(s, en) && !(await ask("Ese horario está fuera de tu horario de trabajo. ¿Agendar igual?", "Agendar igual"))) return;
  if (D.b.some(b => s < new Date(b.ends_at) && en > new Date(b.starts_at)) && !(await ask("Cae en un bloqueo de 'Ocupada'. ¿Agendar igual?", "Agendar igual"))) return;
  run(sb.from("appointments").insert({ tenant_id: T.id, client_id: f.get("client"), service_id: f.get("service") || null, client_package_id: f.get("pkg") || null, starts_at: s.toISOString(), ends_at: en.toISOString(), zone: f.get("zone"), status: "confirmed", source: "manual" }), "Cita agendada");
}
function blockForm() {
  modal("Bloquear horas o días", `<form class="f" onsubmit="addBlock(event);return false">
  <label>Desde<input name="start" type="datetime-local" required></label><label>Hasta<input name="end" type="datetime-local" required></label>
  <label class="chk"><input type="checkbox" name="all" onchange="this.form.start.type=this.form.end.type=this.checked?'date':'datetime-local'"> Todo el día (vacaciones, día libre)</label>
  <label>Motivo<input name="reason" value="Ocupada"></label><button>Bloquear</button></form>`);
}
async function addBlock(e) {
  const f = new FormData(e.target), all = f.get("all"), s = f.get("start"), en = f.get("end");
  run(sb.from("blocks").insert({ tenant_id: T.id, starts_at: new Date(all ? s.slice(0, 10) + "T00:00" : s).toISOString(), ends_at: new Date(all ? en.slice(0, 10) + "T23:59" : en).toISOString(), reason: f.get("reason") }), "Horario bloqueado");
}
