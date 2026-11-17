/* ==================================================================
   js/views/resumen.js
   Propósito : Resumen con indicadores y gráficas.
   Depende de: state.js, calendario.js (wk, addD)
   La usan   : render.js
   ================================================================== */
/* ---- resumen con gráficas ---- */
function vbars(items, fmt = x => x) {
  const max = Math.max(1, ...items.map(i => i.v)), W = 320, H = 130, bw = W / items.length;
  return `<svg viewBox="0 0 ${W} ${H + 24}" class="ch">${items.map((i, k) => { const h = Math.round(i.v / max * (H - 16)), x = k * bw + bw * .18, cx = x + bw * .32;
    return `<rect x="${x}" y="${H - h}" width="${bw * .64}" height="${Math.max(h, 2)}" rx="4" fill="var(--c1)"/><text x="${cx}" y="${H - h - 4}" text-anchor="middle">${i.v ? fmt(i.v) : ""}</text><text x="${cx}" y="${H + 15}" text-anchor="middle">${esc(i.l)}</text>`; }).join("")}</svg>`;
}
const hbars = items => items.length ? items.map(i => `<div class="hb"><span>${esc(i.l)}</span><div><i style="width:${i.v / Math.max(...items.map(x => x.v)) * 100}%"></i></div><b>${i.v}</b></div>`).join("") : empty("Sin datos todavía.");
const topN = (arr, n = 5) => Object.entries(arr.reduce((o, k) => (o[k] = (o[k] || 0) + 1, o), {})).sort((a, b) => b[1] - a[1]).slice(0, n).map(([l, v]) => ({l, v}));

function vResumen() {
  const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1), inM = d => new Date(d) >= m0;
  const months = [5, 4, 3, 2, 1, 0].map(k => { const d = new Date(now.getFullYear(), now.getMonth() - k, 1), key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    return { l: d.toLocaleString("es", {month: "short"}), v: D.p.filter(p => p.purchased_at.startsWith(key)).reduce((t, p) => t + Number(p.price_paid || 0), 0) }; });
  const weeks = [7, 6, 5, 4, 3, 2, 1, 0].map(k => { const s = addD(wk(now), -7 * k), e = addD(s, 7);
    return { l: s.toLocaleDateString("es", {day: "2-digit", month: "2-digit"}), v: D.a.filter(a => a.status === "completed" && new Date(a.starts_at) >= s && new Date(a.starts_at) < e).length }; });
  const done = D.a.filter(a => a.status === "completed" && inM(a.starts_at)).length;
  const income = D.p.filter(p => inM(p.purchased_at)).reduce((t, p) => t + Number(p.price_paid || 0), 0);
  const today = now.toISOString().slice(0, 10), in30 = new Date(+now + 30 * 864e5).toISOString().slice(0, 10);
  const exp = D.p.filter(p => p.expires_at && p.expires_at >= today && p.expires_at <= in30 && p.sessions_used < p.sessions_total);
  const k = (n, l) => `<div class="card kpi"><b>${n}</b><span class="mu">${l}</span></div>`;
  return `<div class="top"><h2>Resumen</h2></div><div class="grid">${k(D.c.filter(c => inM(c.created_at)).length, "clientas nuevas este mes")}${k(done, "sesiones este mes")}
    ${k(money(income) + " " + cur(), "ventas de paquetes este mes")}${k(D.c.filter(c => c.loyalty_stamps >= T.loyalty_target).length, "regalos por entregar")}</div>
  <h3>Ventas de paquetes por mes (${cur()})</h3><div class="card">${vbars(months, money)}</div>
  <h3>Sesiones realizadas por semana (fecha = lunes de esa semana)</h3><div class="card">${vbars(weeks)}</div>
  <h3>Servicios más agendados</h3><div class="card">${hbars(topN(D.a.filter(a => a.status !== "cancelled").map(a => sn(a.service_id))))}</div>
  <h3>¿De dónde llegan las clientas?</h3><div class="card">${hbars(topN(D.c.map(c => c.source || "sin dato")))}</div>
  <h3>Paquetes por vencer (30 días)</h3><div class="card">${exp.map(p => `<div class="row"><span>${esc(cn(p.client_id))} · ${esc(sn(p.service_id))}</span><span class="mu">vence ${p.expires_at} · quedan ${p.sessions_total - p.sessions_used}</span></div>`).join("") || empty("Ninguno.")}</div>`;
}
