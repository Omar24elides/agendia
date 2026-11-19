/* ==================================================================
   js/core/render.js
   Propósito : Pestañas del menú y render() que dibuja la vista activa.
   Depende de: Todas las vistas
   La usan   : Todos
   ================================================================== */
/* ---- estructura ---- */
const TABS = {agenda:["📅","Calendario"], clientas:["👥","Clientas"], paquetes:["🎟️","Paquetes"], servicios:["💆","Servicios"], caja:["💰","Caja"], resumen:["📊","Resumen"], equipo:["🧑‍🤝‍🧑","Equipo"], horario:["⏰","Ajustes"], registro:["🧾","Registro"]};
const OWNER_TABS = ["registro", "equipo"];   // pestañas solo para la dueña
/** Cambia de pestaña y dispara carga paginada cuando corresponde. */
function goTab(k) {
  tab = k;
  render();
  if (k === "clientas" && typeof refreshClientas === "function") refreshClientas(true);
  if (k === "caja" && typeof refreshCaja === "function") refreshCaja(true);
}
function render() {
  const body = {agenda:vAgenda, clientas:vClientas, paquetes:vPaquetes, servicios:vServicios, caja:vCaja, resumen:vResumen, equipo:vEquipo, horario:vHorario, registro:vRegistro}[tab]();
  app(`<header><h1>${esc(T.name)}</h1><div class="btns"><button class="ghost sm" onclick="toggleTheme()" title="Claro / oscuro">◐</button><button class="ghost sm" onclick="logout()">Salir</button></div></header>
  <nav>${Object.entries(TABS).filter(([k]) => !OWNER_TABS.includes(k) || ROLE === "owner").map(([k, [i, l]]) => `<button class="${k === tab ? "on" : ""}" onclick="goTab('${k}')"><span>${i}</span>${k === "clientas" ? V().Cs : l}</button>`).join("")}</nav><main>${body}</main>`);
}
const clientOpts = () => D.c.map(c => `<option value="${c.id}">${esc(c.name || c.phone)}</option>`).join("");
const empty = (t, btn = "") => `<div class="empty"><span>🗒️</span><p>${t}</p>${btn}</div>`;
