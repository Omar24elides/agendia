/* ==================================================================
   js/views/servicios.js
   Propósito : Catálogo: editar, archivar y eliminar servicios y categorías.
   Depende de: state.js, ui.js, logger.js
   La usan   : render.js
   ================================================================== */
/* ---- servicios (etapa 1): editar todo, archivar en vez de borrar ---- */
const KIND = {service: "servicio", package: "paquete", combo: "combo"};

let showArch = false;   // mostrar o no los servicios archivados
function vServicios() {
  const list = D.s.filter(s => showArch || s.active), cats = [...new Set(list.map(s => s.category))];
  const body = cats.map(c => `<div class="top" style="margin:16px 0 6px"><h3 style="margin:0">${esc(c)}</h3><div class="btns">
    <button class="ghost sm" data-c="${esc(c)}" onclick="catForm(this.dataset.c)">Renombrar</button><button class="ghost sm" data-c="${esc(c)}" onclick="delCat(this.dataset.c)">Eliminar categoría</button></div></div>
    <div class="card">${list.filter(s => s.category === c).map(s => `<div class="row ${s.active ? "" : "closed"}"><div><b>${esc(s.name)}</b>${s.active ? "" : ' <span class="pill cancelled">archivado</span>'}<br>
    <span class="mu">${KIND[s.kind]} · ${s.sessions} ses. · ${s.duration_min || 60} min${s.validity_days ? " · vigencia " + s.validity_days + " d" : ""}</span></div>
    <div class="btns">${editing === s.id ? `<input id="np" data-num="dec" inputmode="decimal" value="${s.price}" style="width:96px"><button class="sm" onclick="savePrice('${s.id}')">Guardar</button><button class="ghost sm" onclick="editing=null;render()">✕</button>`
      : `<span class="pill info">${s.price} ${cur()}</span><button class="ghost sm" onclick="editing='${s.id}';render()">Modificar precio</button>`}
    <button class="ghost sm" onclick="svcForm('${s.id}')">Editar</button>
    <button class="ghost sm" onclick="run(sb.from('services').update({active:${!s.active}}).eq('id','${s.id}'),'Servicio actualizado')">${s.active ? "Archivar" : "Restaurar"}</button>
    <button class="ghost sm" onclick="delSvc('${s.id}')">Eliminar</button></div></div>`).join("")}</div>`).join("");
  return `<div class="top"><h2>Servicios y precios</h2><div class="btns"><label class="chk"><input type="checkbox" ${showArch ? "checked" : ""} onchange="showArch=this.checked;render()"> Mostrar archivados</label><button onclick="svcForm()">＋ Nuevo servicio</button></div></div>${body || empty("Sin servicios.", '<button onclick="svcForm()">Crear el primero</button>')}`;
}
/* Regla: un servicio con historial (citas o paquetes) NO se borra, se archiva. Sin historial, se elimina. */
async function dropSvc(id) {
  const { error } = await sb.from("services").delete().eq("id", id);
  if (!error) return "deleted";
  if (error.code === "23503") { const r = await sb.from("services").update({ active: false }).eq("id", id); return r.error ? "error" : "archived"; }
  return "error";
}
async function delSvc(id) {
  const s = D.s.find(x => x.id === id);
  if (!(await ask(`¿Eliminar «${s.name}»? Si ya tiene citas o paquetes, se archivará para conservar el historial.`, "Eliminar"))) return;
  newReq(); const r = await dropSvc(id);
  log("catalog", r === "error" ? "error" : "info", "catalog." + r, s.name, {}, {type: "services", id});
  await load(); render(); toast(r === "deleted" ? "Servicio eliminado" : r === "archived" ? "Tenía historial: quedó archivado" : "No se pudo eliminar", r === "error");
}
async function delCat(c) {
  const ids = D.s.filter(s => s.category === c).map(s => s.id);
  if (!(await ask(`¿Eliminar la categoría «${c}» y sus ${ids.length} servicios? Los que tengan historial quedarán archivados.`, "Eliminar categoría"))) return;
  newReq(); const res = []; for (const id of ids) res.push(await dropSvc(id));
  const d = res.filter(x => x === "deleted").length, a = res.filter(x => x === "archived").length;
  log("catalog", "info", "catalog.category_delete", c, {deleted: d, archived: a});
  await load(); render(); toast(`${d} eliminados · ${a} archivados`);
}
function catForm(c) { modal("Renombrar categoría", `<form class="f" data-c="${esc(c)}" onsubmit="saveCat(event,this.dataset.c);return false"><label>Nombre<input name="n" maxlength="60" value="${esc(c)}" required></label><button>Guardar</button></form>`); }
function saveCat(e, old) {
  const n = new FormData(e.target).get("n").trim(); if (n.length < 2) return toast("El nombre es muy corto", 1);
  run(sb.from("services").update({ category: n }).eq("tenant_id", T.id).eq("category", old), "Categoría renombrada");
}

function svcForm(id) {
  const s = D.s.find(x => x.id === id) || {kind: "service", sessions: 1, duration_min: 60, location: "home"};
  const sel = (v, o) => o.map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${l}</option>`).join("");
  modal(id ? "Editar servicio" : "Nuevo servicio", `<form class="f" onsubmit="saveSvc(event,'${id || ""}');return false">
  <label>Categoría (menú del bot)<input name="category" list="cats" maxlength="60" value="${esc(s.category)}" required></label>
  <datalist id="cats">${[...new Set(D.s.map(x => x.category))].map(c => `<option value="${esc(c)}">`).join("")}</datalist>
  <label>Nombre<input name="name" maxlength="120" value="${esc(s.name)}" required></label>
  <label>Descripción<textarea name="description" maxlength="300" rows="2">${esc(s.description)}</textarea></label>
  <div class="f2"><label>Precio (${cur()})<input name="price" data-num="dec" inputmode="decimal" value="${s.price ?? ""}" required></label><label>Tipo<select name="kind">${sel(s.kind, [["service", "Servicio"], ["package", "Paquete"], ["combo", "Combo"]])}</select></label></div>
  <div class="f2"><label>Sesiones<input name="sessions" data-num="int" inputmode="numeric" value="${s.sessions}" required></label><label>Duración (min)<input name="dur" data-num="int" inputmode="numeric" value="${s.duration_min || 60}" required></label></div>
  <div class="f2"><label>Vigencia (días)<input name="days" data-num="int" inputmode="numeric" value="${s.validity_days ?? ""}"></label><label>Se ofrece<select name="location">${sel(s.location, [["home", "A domicilio"], ["studio", "En estudio"], ["any", "Ambos"]])}</select></label></div>
  <label class="chk"><input type="checkbox" name="auth" ${s.requires_authorization ? "checked" : ""}> Requiere autorización médica</label><button>Guardar</button></form>`);
}
function saveSvc(e, id) {
  const f = new FormData(e.target), p = +f.get("price"), n = +f.get("sessions"), d = +f.get("dur");
  if (!(p >= 0 && p <= 100000) || !(n >= 1 && n <= 365) || !(d >= 5 && d <= 480)) return toast("Revisa precio, sesiones y duración", 1);
  const row = { category: f.get("category").trim(), name: f.get("name").trim(), description: f.get("description").trim() || null, price: p, kind: f.get("kind"), sessions: n, duration_min: d, validity_days: f.get("days") ? +f.get("days") : null, location: f.get("location"), requires_authorization: !!f.get("auth") };
  run(id ? sb.from("services").update(row).eq("id", id) : sb.from("services").insert({ ...row, tenant_id: T.id, sort: D.s.length + 1 }), id ? "Servicio actualizado" : "Servicio agregado");
}
function savePrice(id) { const v = +$("#np").value; if (!(v >= 0 && v <= 100000)) return toast("Precio inválido", 1); editing = null; run(sb.from("services").update({ price: v }).eq("id", id), "Precio actualizado"); }
