/* ==================================================================
   js/views/programar.js
   Propósito : Selector de fechas para programar las sesiones de un paquete.
   Depende de: state.js, schedule.js, paquetes.js
   La usan   : paquetes.js
   ================================================================== */
/* programar sesiones con calendario: toca un día, elige una hora libre; los atajos rellenan solos */
const PL = {};
const fk = d => ymd(d), hhmm = m => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
function planForm(id) {
  const p = D.p.find(x => x.id === id), sv = D.s.find(x => x.id === p.service_id), m = new Date(); m.setDate(1);
  Object.assign(PL, { p, dur: sv?.duration_min || 60, left: p.sessions_total - committed(p).length, m, sel: {}, act: null, zone: "" });
  modal("Programar sesiones", '<div id="plan"></div>'); planDraw();
}
function freeTimes(d) {   // horas de inicio libres ese día (cada 30 min): dentro del horario, sin bloqueos ni otras citas
  const out = [], base = startOf(d);
  for (let m = 360; m <= 1320; m += 30) {
    const s = new Date(base); s.setHours(0, m, 0, 0); const e = new Date(+s + PL.dur * 6e4);
    if (s > new Date() && !outside(s, e) && !D.b.some(b => s < new Date(b.ends_at) && e > new Date(b.starts_at)) && !D.a.some(a => live(a) && s < new Date(a.ends_at) && e > new Date(a.starts_at))) out.push(m);
  }
  return out;
}
function planDraw() {
  const y = PL.m.getFullYear(), mo = PL.m.getMonth(), pad = (new Date(y, mo, 1).getDay() + 6) % 7, days = new Date(y, mo + 1, 0).getDate(), n = Object.keys(PL.sel).length;
  let cells = ["L", "M", "X", "J", "V", "S", "D"].map(x => `<span class="mu hh">${x}</span>`).join("") + "<span></span>".repeat(pad);
  for (let i = 1; i <= days; i++) { const k = fk(new Date(y, mo, i)), on = PL.sel[k];
    cells += `<button type="button" class="pd ${on ? "on" : ""} ${PL.act === k ? "act" : ""}" ${freeTimes(new Date(y, mo, i)).length || on ? "" : "disabled"} onclick="PL.act='${k}';planDraw()">${i}${on ? `<small>${on}</small>` : ""}</button>`; }
  const dl = k => new Date(k + "T00:00"), hours = PL.act ? freeTimes(dl(PL.act)) : [];
  $("#plan").innerHTML = `<p class="mu" style="margin:0 0 8px">${esc(cn(PL.p.client_id))} · ${esc(sn(PL.p.service_id))} · <b>${n} de ${PL.left}</b> sesiones elegidas</p>
  <div class="chips" style="margin:0 0 10px"><span class="mu" style="align-self:center">Atajo:</span>${[[2, "Interdiario"], [3, "Cada 3 días"], [4, "Cada 4 días"], [7, "Semanal"]].map(([s, l]) => `<button type="button" class="ghost sm" onclick="planShort(${s})">${l}</button>`).join("")}<button type="button" class="ghost sm" onclick="PL.sel={};PL.act=null;planDraw()">Limpiar</button></div>
  <div class="cnav"><button type="button" class="ghost sm" onclick="PL.m=new Date(PL.m.getFullYear(),PL.m.getMonth()-1,1);planDraw()">‹</button><b>${cap(PL.m.toLocaleDateString("es", {month: "long", year: "numeric"}).replace(" de ", " "))}</b><button type="button" class="ghost sm" onclick="PL.m=new Date(PL.m.getFullYear(),PL.m.getMonth()+1,1);planDraw()">›</button></div>
  <div class="pg">${cells}</div>
  ${PL.act ? `<h3>${cap(dl(PL.act).toLocaleDateString("es", {weekday: "long", day: "numeric", month: "long"}))}: elige la hora</h3><div class="chips">${hours.map(m => `<button type="button" class="pill t ${PL.sel[PL.act] === hhmm(m) ? "res" : "info"}" onclick="planTime('${hhmm(m)}')">${hhmm(m)}</button>`).join("") || '<span class="mu">Sin horas libres este día</span>'}</div>${PL.sel[PL.act] ? '<button type="button" class="ghost sm" style="margin-top:8px" onclick="delete PL.sel[PL.act];PL.act=null;planDraw()">Quitar este día</button>' : ""}` : '<p class="mu">Toca un día para elegir su hora. Los días en gris no tienen horas libres.</p>'}
  <h3>Sesiones elegidas</h3><div class="chips">${Object.entries(PL.sel).sort().map(([k, t]) => `<span class="pill info" onclick="PL.act='${k}';planDraw()">${dl(k).toLocaleDateString("es", {weekday: "short", day: "numeric", month: "short"})} · ${t}</span>`).join("") || '<span class="mu">Ninguna todavía</span>'}</div>
  <label style="margin-top:10px">Zona<input maxlength="120" value="${esc(PL.zone)}" oninput="PL.zone=this.value"></label>
  <button style="width:100%;margin-top:10px" ${n ? "" : "disabled"} onclick="confirmPlan()">Agendar ${n} sesiones</button>`;
}
function planTime(t) {
  if (!PL.sel[PL.act] && Object.keys(PL.sel).length >= PL.left) return toast("Ya elegiste todas las sesiones del paquete", 1);
  PL.sel[PL.act] = t; planDraw();
}
function planShort(step) {   // desde el primer día elegido (o hoy), cada N días, a la misma hora o la más cercana libre
  const ks = Object.keys(PL.sel).sort(), lim = PL.p.expires_at ? new Date(PL.p.expires_at + "T23:59") : null;
  let d = ks.length ? new Date(ks[0] + "T00:00") : startOf(new Date()), pref = ks.length ? tm(PL.sel[ks[0]]) : null, g = 0, first = null; PL.sel = {};
  while (Object.keys(PL.sel).length < PL.left && g++ < 400 && !(lim && d > lim)) {
    const ft = freeTimes(d);
    if (ft.length) { const m = pref === null ? ft[0] : ft.includes(pref) ? pref : ft.reduce((a, b) => Math.abs(b - pref) < Math.abs(a - pref) ? b : a);
      if (pref === null) pref = m; if (!first) first = d; PL.sel[fk(d)] = hhmm(m); d = addD(d, step); } else d = addD(d, 1);
  }
  if (first) PL.m = new Date(first.getFullYear(), first.getMonth(), 1);
  PL.act = null; planDraw();
}
function confirmPlan() {
  const lim = PL.p.expires_at ? new Date(PL.p.expires_at + "T23:59") : null;
  const rows = Object.entries(PL.sel).sort().map(([k, t]) => { const s = new Date(k + "T" + t); return { tenant_id: T.id, client_id: PL.p.client_id, service_id: PL.p.service_id, client_package_id: PL.p.id, starts_at: s.toISOString(), ends_at: new Date(+s + PL.dur * 6e4).toISOString(), zone: PL.zone, status: "confirmed", source: "paquete" }; });
  if (lim && rows.some(r => new Date(r.starts_at) > lim)) return toast("Hay sesiones después del vencimiento del paquete", 1);
  run(sb.from("appointments").insert(rows), rows.length + " sesiones agendadas");
}
