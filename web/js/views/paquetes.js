/* ==================================================================
   js/views/paquetes.js
   Propósito : Paquetes vendidos (tarjetas): venta con abono inicial, extender vigencia,
               anular, y sesiones comprometidas. Delega en PaquetesService.
   Depende de: state.js, vocab.js, caja.js (payOf, payForm), services/paquetes.js
   La usan   : render.js
   ================================================================== */
const committed = p => D.a.filter(a => a.client_package_id === p.id && live(a));

function vPaquetes() {
  const cards = D.p.map(p => {
    const off = PaquetesService.isCancelled(p);
    const cm = committed(p), left = p.sessions_total - cm.length, paid = payOf(p), price = Number(p.price_paid || 0), debt = Math.max(price - paid, 0);
    const days = p.expires_at ? Math.ceil((new Date(p.expires_at + "T23:59") - Date.now()) / 864e5) : null;
    const st = off ? ["cancelled", "Anulado"]
      : p.sessions_used >= p.sessions_total ? ["completed", "Completado"]
      : days !== null && days < 0 ? ["cancelled", "Vencido"]
      : days !== null && days <= 30 ? ["pending", "Vence en " + days + " d"]
      : ["confirmed", "Activo"];
    const exp = p.expires_at ? "Vence el " + p.expires_at : (p.validity_days ? `Vigencia ${p.validity_days} d desde la 1ª sesión` : "Sin vencimiento");
    return `<div class="pk" style="${off ? "opacity:.6" : ""}"><div class="pk-h"><div><b>${esc(cn(p.client_id))}</b><br><span class="mu">${esc(sn(p.service_id))}</span></div><span class="pill ${st[0]}">${st[1]}</span></div>
      <div><div class="bar full"><i style="width:${p.sessions_used / p.sessions_total * 100}%"></i></div><span class="mu">${p.sessions_used} de ${p.sessions_total} realizadas · ${left} sin agendar</span></div>
      <div class="pk-m"><div><span class="mu">Precio</span><b>${m2(price)} ${cur()}</b></div><div><span class="mu">Pagado</span><b>${m2(paid)}</b></div><div><span class="mu">Saldo</span><b class="${debt ? "owe" : ""}">${m2(debt)}</b></div></div>
      ${cm.length ? `<div class="chips">${cm.map((a, i) => `<span class="pill ${a.status}" onclick="apptModal('${a.id}')">${i + 1} · ${new Date(a.starts_at).toLocaleDateString("es", {day: "numeric", month: "short"})}</span>`).join("")}</div>` : ""}
      <span class="mu">${exp}</span>
      ${off ? (p.cancel_reason ? `<span class="mu">Motivo: ${esc(p.cancel_reason)}</span>` : "") : `<div class="pk-a">${left > 0 ? `<button onclick="planForm('${p.id}')">Programar sesiones</button>` : ""}<button class="ghost" onclick="payForm('${p.id}')">Registrar pago</button><button class="ghost" onclick="extendForm('${p.id}')">Extender vigencia</button><button class="ghost" onclick="cancelPkgForm('${p.id}')">Anular</button></div>`}</div>`;
  }).join("");
  return `<div class="top"><h2>Paquetes</h2><button onclick="pkgForm()">＋ Vender paquete o combo</button></div>${cards ? `<div class="pkgs">${cards}</div>` : empty("Aún no hay paquetes vendidos.", '<button onclick="pkgForm()">Vender el primero</button>')}`;
}

/** Formulario de venta: cualquier servicio activo, con abono inicial opcional. */
function pkgForm() {
  if (!D.c.length) return toast(`Primero crea ${V().un} ${V().c}`, 1);
  const act = D.s.filter(s => s.active);
  if (!act.length) return toast("Primero crea un servicio, paquete o combo en la pestaña Servicios", 1);
  const grp = [["combo", "Combos"], ["package", "Paquetes"], ["service", "Servicios sueltos"]].map(([k, l]) => { const L = act.filter(s => s.kind === k); return L.length ? `<optgroup label="${l}">${L.map(s => `<option value="${s.id}">${esc(s.name)} · ${s.sessions} ses. · ${s.price} ${cur()}</option>`).join("")}</optgroup>` : ""; }).join("");
  const opt = o => Object.entries(o).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  modal("Vender paquete o combo", `<form class="f" onsubmit="sellPkg(event);return false"><label>${V().C}<select name="client" required>${clientOpts()}</select></label>
  <label>Qué se vende<select name="service" required>${grp}</select></label>
  <label>Precio acordado (vacío = precio de lista)<input name="price" data-num="dec" inputmode="decimal"></label>
  <h3 style="margin:6px 0 0">Abono inicial (opcional)</h3>
  <div class="f2"><label>Monto<input name="amt" data-num="dec" inputmode="decimal"></label><label>Moneda<select name="cur">${opt(CajaService.CURRENCIES).replace(`value="${T.currency}"`, `value="${T.currency}" selected`)}</select></label></div>
  <div class="f2"><label>Tasa del día (si la moneda es distinta a ${T.currency})<input name="rate" data-num="dec" inputmode="decimal"></label><label>Método<select name="method">${opt(METH)}</select></label></div>
  <button>Registrar venta</button></form>`);
}
function sellPkg(e) {
  const f = new FormData(e.target);
  PaquetesService.sell({ clientId: f.get("client"), serviceId: f.get("service"), price: f.get("price"),
    pay: f.get("amt") ? { amount: f.get("amt"), currency: f.get("cur"), rate: f.get("rate"), method: f.get("method") } : null });
}

/** Extender vigencia: nueva fecha elegida por la dueña (la vigencia es una regla comercial, debe poder ajustarse). */
function extendForm(id) {
  const p = D.p.find(x => x.id === id), base = p.expires_at && p.expires_at > today() ? p.expires_at : today();
  modal("Extender vigencia", `<form class="f" onsubmit="saveExtend(event,'${id}');return false">
  <p style="margin:0"><b>${esc(cn(p.client_id))}</b> · ${esc(sn(p.service_id))}<br><span class="mu">${p.expires_at ? "Vence el " + p.expires_at : "Sin vencimiento"}</span></p>
  <div class="chips">${[7, 15, 30, 60].map(n => `<button type="button" class="ghost sm" onclick="this.form.date.value=ymd(addD(new Date('${base}T12:00'),${n}))">+${n} días</button>`).join("")}</div>
  <label>Nueva fecha de vencimiento (vacío = sin vencimiento)<input name="date" type="date" value="${p.expires_at || ""}"></label><button>Guardar</button></form>`);
}
function saveExtend(e, id) { PaquetesService.setExpiry(id, new FormData(e.target).get("date")); }

/** Anular: pide motivo opcional y confirma (cancela citas futuras del paquete). */
function cancelPkgForm(id) {
  const p = D.p.find(x => x.id === id);
  modal("Anular paquete", `<form class="f" onsubmit="PaquetesService.cancel('${id}',new FormData(this).get('reason'));return false">
  <p style="margin:0"><b>${esc(cn(p.client_id))}</b> · ${esc(sn(p.service_id))}</p>
  <label>Motivo (opcional)<input name="reason" maxlength="200" placeholder="Ej: error de venta, devolución"></label>
  <button>Continuar</button></form>`);
}
