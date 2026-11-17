/* ==================================================================
   js/core/ui.js
   Propósito : Utilidades de interfaz y escritura: campos numéricos, estados de cita, skeleton, confirmaciones propias y run() (escritura central con registro).
   Depende de: state.js, logger.js
   La usan   : Todas las vistas
   ================================================================== */
/* ---- utilidades (etapa 1) ---- */
const ymd = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const today = () => ymd(new Date());
const m2 = n => Number(n).toLocaleString("es", {minimumFractionDigits: 2, maximumFractionDigits: 2});
/* Campos numéricos: solo dígitos (data-num="int") o dígitos con 2 decimales (data-num="dec"). */
document.addEventListener("input", e => {
  const t = e.target, k = t.dataset && t.dataset.num; if (!k) return;
  t.value = k === "int" ? t.value.replace(/\D/g, "") : t.value.replace(",", ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1").replace(/(\.\d{2}).*/, "$1");
});
const setSt = (id, st) => {
  const a = D.a.find(x => x.id === id);
  if (st === "completed" && new Date(a.starts_at) > new Date()) return toast("No puedes completar una cita futura", 1);
  run(sb.from("appointments").update({ status: st }).eq("id", id), "Cita actualizada");
};

/* ---- carga, confirmaciones y estados (etapa 2 de diseño) ---- */
const ST = {pending: "Pendiente", confirmed: "Confirmada", completed: "Completada", cancelled: "Cancelada", no_show: "No asistió"};
const skel = () => `<header><span class="sk sk-t"></span></header><nav>${'<span class="sk sk-n"></span>'.repeat(6)}</nav><main><span class="sk sk-t"></span>${[0, 1, 2].map(() => '<div class="card"><span class="sk sk-l sk-s"></span><span class="sk sk-l"></span><span class="sk sk-l sk-m"></span></div>').join("")}</main>`;
const unbusy = () => document.querySelectorAll("button.busy").forEach(b => { b.disabled = false; b.classList.remove("busy"); });
document.addEventListener("submit", e => { const b = e.target.querySelector("button:not([type=button])"); if (b) { b.disabled = true; b.classList.add("busy"); setTimeout(unbusy, 2500); } }, true);
const ask = (msg, ok = "Continuar") => new Promise(res => {
  cfm.innerHTML = `<p style="margin:0 0 14px">${esc(msg)}</p><div class="btns" style="justify-content:flex-end"><button class="ghost" id="cfn">Cancelar</button><button id="cfy">${ok}</button></div>`;
  cfm.showModal(); $("#cfy").onclick = () => { cfm.close(); res(true); }; $("#cfn").onclick = () => { cfm.close(); res(false); }; cfm.oncancel = () => res(false);
});
async function delPay(id) { if (await ask("¿Anular este pago? Quedará fuera de la caja.", "Anular")) run(sb.from("payments").delete().eq("id", id), "Pago anulado"); }
const stampsHtml = (n, t) => `<div class="stamps" title="${n} de ${t}">${[...Array(t)].map((_, i) => `<i class="st ${i < n ? "on" : ""}"></i>`).join("")}</div>`;
let RUNNING = false;   // evita guardar dos veces si se pulsa dos veces
async function run(p, msg) {
  if (RUNNING) return false; RUNNING = true; newReq(); const t0 = performance.now();
  try {
    const { error } = await p; logRun(p, error, performance.now() - t0, msg);
    if (error) { toast(/exclusion|overlap/i.test(error.message) ? "Ese horario ya está ocupado" : error.message, 1); return false; }
    if (dlg.open) dlg.close();
    await load(); render(); toast(msg || "Guardado"); return true;
  } finally { RUNNING = false; unbusy(); }
}
