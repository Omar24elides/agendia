/* ==================================================================
   js/core/render.js
   Propósito : Pestañas del menú y render() que dibuja la vista activa.
   Depende de: Todas las vistas
   La usan   : Todos
   ================================================================== */
/* ---- estructura ---- */
const TABS = {agenda:["📅","Calendario"], clientas:["👥","Clientas"], paquetes:["🎟️","Paquetes"], servicios:["💆","Servicios"], caja:["💰","Caja"], resumen:["📊","Resumen"], horario:["⏰","Horario"], registro:["🧾","Registro"]};
function render() {
  const body = {agenda:vAgenda, clientas:vClientas, paquetes:vPaquetes, servicios:vServicios, caja:vCaja, resumen:vResumen, horario:vHorario, registro:vRegistro}[tab]();
  app(`<header><h1>${esc(T.name)}</h1><div class="btns"><button class="ghost sm" onclick="toggleTheme()" title="Claro / oscuro">◐</button><button class="ghost sm" onclick="logout()">Salir</button></div></header>
  <nav>${Object.entries(TABS).filter(([k]) => k !== "registro" || ROLE === "owner").map(([k, [i, l]]) => `<button class="${k === tab ? "on" : ""}" onclick="tab='${k}';render()"><span>${i}</span>${l}</button>`).join("")}</nav><main>${body}</main>`);
}
const clientOpts = () => D.c.map(c => `<option value="${c.id}">${esc(c.name || c.phone)}</option>`).join("");
const empty = (t, btn = "") => `<div class="empty"><span>🗒️</span><p>${t}</p>${btn}</div>`;
