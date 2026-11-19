/* ==================================================================
   js/views/servicios.js
   Propósito : Catálogo: editar, archivar y eliminar servicios y categorías.
               No habla directo con Supabase: delega todo a CatalogoService.
   Depende de: state.js, ui.js, services/catalogo.js
   La usan   : render.js
   ================================================================== */
/* ---- servicios (etapa 1): editar todo, archivar en vez de borrar ---- */
const KIND = {service: "servicio", package: "paquete", combo: "combo"};

let showArch = false;   // mostrar o no los servicios archivados
function vServicios() {
  const list = D.s.filter(s => showArch || s.active), cats = [...new Set(list.map(s => s.category))];
  const body = cats.map(c => `<div class="top" style="margin:16px 0 6px"><h3 style="margin:0">${esc(c)}</h3><div class="btns">
    <button class="ghost sm" data-c="${esc(c)}" onclick="catForm(this.dataset.c)">Renombrar</button><button class="ghost sm" data-c="${esc(c)}" onclick="CatalogoService.deleteCategory(this.dataset.c)">Eliminar categoría</button></div></div>
    <div class="card">${list.filter(s => s.category === c).map(s => `<div class="row ${s.active ? "" : "closed"}"><div><b>${esc(s.name)}</b>${s.active ? "" : ' <span class="pill cancelled">archivado</span>'}<br>
    <span class="mu">${KIND[s.kind]} · ${s.sessions} ses. · ${s.duration_min || 60} min${s.validity_days ? " · vigencia " + s.validity_days + " d" : ""}</span></div>
    <div class="btns">${editing === s.id ? `<input id="np" data-num="dec" inputmode="decimal" value="${s.price}" style="width:96px"><button class="sm" onclick="savePrice('${s.id}')">Guardar</button><button class="ghost sm" onclick="editing=null;render()">✕</button>`
      : `<span class="pill info">${s.price} ${cur()}</span><button class="ghost sm" onclick="editing='${s.id}';render()">Modificar precio</button>`}
    <button class="ghost sm" onclick="svcForm('${s.id}')">Editar</button>
    <button class="ghost sm" onclick="CatalogoService.toggleActive('${s.id}',${s.active})">${s.active ? "Archivar" : "Restaurar"}</button>
    <button class="ghost sm" onclick="CatalogoService.remove('${s.id}')">Eliminar</button></div></div>`).join("")}</div>`).join("");
  return `<div class="top"><h2>Servicios y precios</h2><div class="btns"><label class="chk"><input type="checkbox" ${showArch ? "checked" : ""} onchange="showArch=this.checked;render()"> Mostrar archivados</label><button onclick="svcForm()">＋ Nuevo servicio</button></div></div>${body || empty("Sin servicios.", '<button onclick="svcForm()">Crear el primero</button>')}`;
}

function catForm(c) {
  modal("Renombrar categoría", `<form class="f" data-c="${esc(c)}" onsubmit="saveCat(event,this.dataset.c);return false"><label>Nombre<input name="n" maxlength="60" value="${esc(c)}" required></label><button>Guardar</button></form>`);
}
function saveCat(e, old) { CatalogoService.renameCategory(old, new FormData(e.target).get("n")); }

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
  const f = new FormData(e.target);
  CatalogoService.save(id, {
    category: f.get("category"),
    name: f.get("name"),
    description: f.get("description"),
    price: f.get("price"),
    kind: f.get("kind"),
    sessions: f.get("sessions"),
    duration_min: f.get("dur"),
    validity_days: f.get("days"),
    location: f.get("location"),
    requires_authorization: !!f.get("auth")
  });
}
async function savePrice(id) {
  if (await CatalogoService.savePrice(id, $("#np").value)) editing = null;
}
