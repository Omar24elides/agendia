/* ==================================================================
   js/views/paquetes.js
   Propósito : Paquetes vendidos (tarjetas), venta de paquete y sesiones comprometidas.
   Depende de: state.js, caja.js (payOf)
   La usan   : render.js
   ================================================================== */
/* ---- paquetes (etapa 2) ---- */
const committed = p => D.a.filter(a => a.client_package_id === p.id && live(a));

function vPaquetes() {
  const cards = D.p.map(p => {
    const cm = committed(p), left = p.sessions_total - cm.length, paid = payOf(p), price = Number(p.price_paid || 0), debt = Math.max(price - paid, 0);
    const days = p.expires_at ? Math.ceil((new Date(p.expires_at) - Date.now()) / 864e5) : null;
    const st = p.sessions_used >= p.sessions_total ? ["completed", "Completado"] : days !== null && days < 0 ? ["cancelled", "Vencido"] : days !== null && days <= 30 ? ["pending", "Vence en " + days + " d"] : ["confirmed", "Activo"];
    return `<div class="pk"><div class="pk-h"><div><b>${esc(cn(p.client_id))}</b><br><span class="mu">${esc(sn(p.service_id))}</span></div><span class="pill ${st[0]}">${st[1]}</span></div>
      <div><div class="bar full"><i style="width:${p.sessions_used / p.sessions_total * 100}%"></i></div><span class="mu">${p.sessions_used} de ${p.sessions_total} realizadas · ${left} sin agendar</span></div>
      <div class="pk-m"><div><span class="mu">Precio</span><b>${m2(price)} ${cur()}</b></div><div><span class="mu">Pagado</span><b>${m2(paid)}</b></div><div><span class="mu">Saldo</span><b class="${debt ? "owe" : ""}">${m2(debt)}</b></div></div>
      ${cm.length ? `<div class="chips">${cm.map((a, i) => `<span class="pill ${a.status}" onclick="apptModal('${a.id}')">${i + 1} · ${new Date(a.starts_at).toLocaleDateString("es", {day: "numeric", month: "short"})}</span>`).join("")}</div>` : ""}
      <div class="pk-a">${left > 0 ? `<button onclick="planForm('${p.id}')">Programar sesiones</button>` : ""}<button class="ghost" onclick="payForm('${p.id}')">Registrar pago</button></div></div>`;
  }).join("");
  return `<div class="top"><h2>Paquetes</h2><button onclick="pkgForm()">＋ Vender paquete o combo</button></div>${cards ? `<div class="pkgs">${cards}</div>` : empty("Aún no hay paquetes vendidos.", '<button onclick="pkgForm()">Vender el primero</button>')}`;
}

function pkgForm() {
  if (!D.c.length) return toast("Primero crea una clienta", 1);
  modal("Vender paquete o combo", `<form class="f" onsubmit="sellPkg(event);return false"><label>Clienta<select name="client" required>${clientOpts()}</select></label>
  <label>Paquete<select name="service" required>${D.s.filter(s => s.kind !== "service" && s.active).map(s => `<option value="${s.id}">${esc(s.name)} (${s.price} ${cur()})</option>`).join("")}</select></label>
  <label>Precio acordado (vacío = precio de lista)<input name="price" data-num="dec" inputmode="decimal"></label><button>Registrar venta</button></form>`);
}
function sellPkg(e) {
  const f = new FormData(e.target), s = D.s.find(x => x.id === f.get("service")), pr = f.get("price") ? +f.get("price") : s.price;
  const exp = s.validity_days ? ymd(new Date(Date.now() + s.validity_days * 864e5)) : null;
  run(sb.from("client_packages").insert({ tenant_id: T.id, client_id: f.get("client"), service_id: s.id, sessions_total: s.sessions, price_paid: pr, expires_at: exp }), "Paquete registrado");
}
