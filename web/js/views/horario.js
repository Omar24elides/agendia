/* ==================================================================
   js/views/horario.js
   Propósito : Horario de trabajo (turno simple o partido) y sesiones para el regalo.
   Depende de: state.js, schedule.js
   La usan   : render.js
   ================================================================== */
/* ---- horario y ajustes: turno simple o partido (ej. 8–12 y 14–18) ---- */
const HD = [1, 2, 3, 4, 5, 6, 0];
function vHorario() {
  const H = hrs(), row = d => {
    const h = H[d], sp = !!(h.f2 && h.t2);
    return `<div class="hd ${h.on ? "" : "offd"}"><label class="chk"><input type="checkbox" id="hon${d}" ${h.on ? "checked" : ""} onchange="hsync()"> <b>${DAYS[d]}</b></label>
    <div class="hx"><input type="time" id="hf${d}" value="${h.f || ""}"><span>–</span><input type="time" id="ht${d}" value="${h.t || ""}"><button type="button" class="ghost sm" id="hb${d}" onclick="hsplit(${d})">${sp ? "✕ Quitar turno" : "＋ Turno partido"}</button></div>
    <div class="hx hx2" id="hs${d}" ${sp ? "" : "hidden"}><span class="mu">Segundo turno</span><input type="time" id="hf2_${d}" value="${h.f2 || ""}"><span>–</span><input type="time" id="ht2_${d}" value="${h.t2 || ""}"></div></div>`;
  };
  return `<div class="top"><h2>Horario de trabajo</h2></div><form class="card" onsubmit="saveHours(event);return false">
  <p class="mu" style="margin:0 0 10px">Fuera de este horario el panel te avisará al agendar, y el bot no ofrecerá esas horas.</p>
  <div class="chips" style="margin:0 0 6px"><button type="button" class="ghost sm" onclick="hpre([1,2,3,4,5],'08:00','17:00')">Lun–Vie 8–17</button><button type="button" class="ghost sm" onclick="hpre([1,2,3,4,5,6],'08:00','15:00')">Lun–Sáb 8–15</button><button type="button" class="ghost sm" onclick="hcopy()">Copiar el lunes a todos</button></div>
  ${HD.map(row).join("")}
  <label style="margin-top:12px">Sesiones para el regalo de fidelidad<input id="lt" data-num="int" inputmode="numeric" value="${T.loyalty_target}" style="width:100px"></label><button style="width:100%;margin-top:12px">Guardar horario</button></form>${vAjustes()}`;
}
/** Ajustes del negocio (tenants.settings): rubro, vigencia de paquetes y reservas en línea. */
function vAjustes() {
  const cur_ = (T.settings && T.settings.vocab) || "spa", vm = AjustesService.validityMode(), pb = !!(T.settings && T.settings.public_booking);
  return `<div class="top" style="margin-top:20px"><h2>Ajustes del negocio</h2></div><div class="card f">
  <label>Tipo de negocio (cambia cómo se llama a quienes atiendes)<select onchange="AjustesService.save({vocab:this.value})">${Object.entries(VOCAB).map(([k, v]) => `<option value="${k}" ${k === cur_ ? "selected" : ""}>${v.label} · ${v.Cs}</option>`).join("")}</select></label>
  <label>La vigencia de un paquete cuenta desde…<select onchange="AjustesService.save({validity_mode:this.value})"><option value="purchase" ${vm === "purchase" ? "selected" : ""}>La fecha de compra</option><option value="first_session" ${vm === "first_session" ? "selected" : ""}>La primera sesión agendada</option></select></label>
  <label class="chk"><input type="checkbox" ${pb ? "checked" : ""} onchange="AjustesService.save({public_booking:this.checked})"> Activar página pública de reservas</label>
  ${pb ? `<div><span class="mu">Comparte este enlace con tus ${V().cs} (Instagram, WhatsApp, Google):</span><input readonly value="${esc(AjustesService.bookingLink())}" onclick="this.select()" style="width:100%;margin:6px 0"><div class="btns"><button type="button" class="ghost sm" onclick="navigator.clipboard.writeText('${esc(AjustesService.bookingLink())}').then(()=>toast('Enlace copiado'))">Copiar enlace</button><a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(AjustesService.bookingLink())}">Abrir</a></div></div>` : ""}
  <hr style="border:none;border-top:1px solid var(--bd);margin:4px 0">
  <div><span class="mu" style="display:block;margin-bottom:6px">Copia de seguridad portable (incluye clientas, citas, paquetes y caja):</span>
  <button type="button" class="ghost sm" onclick="BackupService.exportAllJson()">💾 Descargar respaldo completo (JSON)</button></div>
  </div>`;
}
const hsync = () => HD.forEach(d => { const on = $("#hon" + d).checked; if (on && !$("#hf" + d).value) { $("#hf" + d).value = "08:00"; $("#ht" + d).value = "15:00"; } $("#hon" + d).closest(".hd").classList.toggle("offd", !on); });
const hpre = (days, f, t) => { HD.forEach(d => { const on = days.includes(d); $("#hon" + d).checked = on; if (on) { $("#hf" + d).value = f; $("#ht" + d).value = t; } }); hsync(); };
const hcopy = () => { HD.forEach(d => { $("#hon" + d).checked = true; $("#hf" + d).value = $("#hf1").value; $("#ht" + d).value = $("#ht1").value; $("#hf2_" + d).value = $("#hf2_1").value; $("#ht2_" + d).value = $("#ht2_1").value; $("#hs" + d).hidden = $("#hs1").hidden; $("#hb" + d).textContent = $("#hb1").textContent; }); hsync(); };
const hsplit = d => { const s = $("#hs" + d); s.hidden = !s.hidden; if (s.hidden) { $("#hf2_" + d).value = ""; $("#ht2_" + d).value = ""; } $("#hb" + d).textContent = s.hidden ? "＋ Turno partido" : "✕ Quitar turno"; };
async function saveHours() {
  const wh = {}; let bad = "";
  HD.forEach(d => {
    const o = { on: $("#hon" + d).checked, f: $("#hf" + d).value, t: $("#ht" + d).value };
    if (!$("#hs" + d).hidden) { o.f2 = $("#hf2_" + d).value; o.t2 = $("#ht2_" + d).value; }
    if (o.on && !bad) {
      if (!o.f || !o.t || tm(o.f) >= tm(o.t)) bad = DAYS[d] + ": revisa el primer turno";
      else if (o.f2 !== undefined && (!o.f2 || !o.t2 || tm(o.f2) <= tm(o.t) || tm(o.f2) >= tm(o.t2))) bad = DAYS[d] + ": el segundo turno debe empezar después del primero";
    }
    wh[d] = o;
  });
  if (bad) return toast(bad, 1);
  const lt = +$("#lt").value; if (!(lt >= 1 && lt <= 50)) return toast("Sesiones para el regalo: entre 1 y 50", 1);
  AjustesService.saveHoursAndLoyalty(wh, lt);
}
