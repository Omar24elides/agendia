/* ==================================================================
   js/views/clientas.js
   Propósito : Lista de clientas, alta, regalo de fidelidad y exportación CSV.
   Depende de: state.js, ui.js
   La usan   : render.js
   ================================================================== */
/* ---- clientas ---- */
function vClientas() {
  const list = D.c.filter(c => ((c.name || "") + c.phone + (c.zone || "")).toLowerCase().includes(q.toLowerCase()));
  const rows = list.map(c => `<div class="row"><div class="btns" style="flex-wrap:nowrap"><span class="av">${esc((c.name || "?")[0].toUpperCase())}</span>
    <div><b>${esc(c.name || "Sin nombre")}</b><br><span class="mu">${esc(c.phone)} ${c.zone ? "· " + esc(c.zone) : ""} ${c.marketing_consent ? "· ✅ promos" : ""}</span></div></div>
    <div class="btns">${stampsHtml(c.loyalty_stamps, T.loyalty_target)}
    ${c.loyalty_stamps >= T.loyalty_target ? `<button class="sm" onclick="reward('${c.id}',${c.loyalty_stamps})">🎁 Regalo entregado</button>` : ""}
    <a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/${c.phone.replace(/\D/g, "")}">WhatsApp</a></div></div>`).join("");
  return `<div class="top"><h2>Clientas</h2><div class="btns"><button onclick="clientForm()">＋ Nueva clienta</button><button class="ghost" onclick="exportCsv()">Exportar CSV</button></div></div>
  <input id="qs" style="width:100%;margin-bottom:12px" placeholder="🔍 Buscar por nombre, teléfono o zona" value="${esc(q)}" oninput="q=this.value;render();const i=$('#qs');i.focus();i.setSelectionRange(99,99)">
  ${rows ? `<div class="card">${rows}</div>` : empty(D.c.length ? "Sin resultados para tu búsqueda." : "Aún no tienes clientas.", D.c.length ? "" : '<button onclick="clientForm()">Crear la primera clienta</button>')}`;
}
function clientForm() {
  modal("Nueva clienta", `<form class="f" onsubmit="addClient(event);return false"><label>Nombre<input name="name"></label><label>Teléfono<input name="phone" required placeholder="584121234567"></label>
  <div class="f2"><label>Zona<input name="zone"></label><label>Origen<select name="source"><option>whatsapp</option><option>instagram</option><option>google</option><option>referida</option></select></label></div>
  <label class="chk"><input type="checkbox" name="consent"> Acepta recibir promociones</label><button>Guardar</button></form>`);
}
const addClient = e => { const f = new FormData(e.target); run(sb.from("clients").insert({ tenant_id: T.id, name: f.get("name"), phone: f.get("phone"), zone: f.get("zone"), source: f.get("source"), marketing_consent: !!f.get("consent") }), "Clienta guardada"); };
const reward = (id, n) => run(sb.from("clients").update({ loyalty_stamps: Math.max(0, n - T.loyalty_target) }).eq("id", id), "Regalo registrado");
function exportCsv() {
  const r = [["nombre","telefono","zona","origen","promos","sellos"], ...D.c.map(c => [c.name, c.phone, c.zone, c.source, c.marketing_consent, c.loyalty_stamps])];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([r.map(x => x.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], {type:"text/csv"}));
  a.download = "clientas.csv"; a.click();
}
