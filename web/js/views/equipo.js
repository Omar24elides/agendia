/* ==================================================================
   js/views/equipo.js
   Propósito : Pestaña Equipo (solo dueña): agregar, renombrar y archivar profesionales.
               Con al menos un profesional, el calendario y las citas permiten asignarlo
               y la doble reserva se evita POR profesional.
   Depende de: state.js, ui.js, services/equipo.js
   La usan   : render.js
   ================================================================== */
function vEquipo() {
  const rows = (D.st || []).map(s => `<div class="row ${s.active ? "" : "closed"}"><div><b>${esc(s.name)}</b>${s.active ? "" : ' <span class="pill cancelled">archivado</span>'}</div>
    <div class="btns"><button class="ghost sm" onclick="staffForm('${s.id}')">Renombrar</button><button class="ghost sm" onclick="EquipoService.setActive('${s.id}',${!s.active})">${s.active ? "Archivar" : "Restaurar"}</button></div></div>`).join("");
  return `<div class="top"><div><h2>Equipo</h2><span class="mu">Profesionales que atienden. Cada uno tiene su propia agenda.</span></div><button onclick="staffForm()">＋ Agregar profesional</button></div>
  <div class="card">${rows || empty("Aún no hay profesionales. Si trabajas sola, no necesitas agregar nada.", '<button onclick="staffForm()">Agregar el primero</button>')}</div>`;
}
function staffForm(id) {
  const s = id && (D.st || []).find(x => x.id === id);
  modal(id ? "Renombrar profesional" : "Agregar profesional", `<form class="f" onsubmit="saveStaff(event,'${id || ""}');return false">
  <label>Nombre<input name="n" maxlength="80" value="${esc(s ? s.name : "")}" required></label><button>Guardar</button></form>`);
}
function saveStaff(e, id) { const n = new FormData(e.target).get("n"); id ? EquipoService.rename(id, n) : EquipoService.create(n); }
