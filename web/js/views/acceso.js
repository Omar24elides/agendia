/* ==================================================================
   js/views/acceso.js
   Propósito : Pantallas de ingreso, registro y creación de empresa.
   Depende de: state.js
   La usan   : boot.js
   ================================================================== */
/* ---- acceso ---- */
function loginView() {
  app(`<div class="login"><h1>Agendia</h1><p class="mu">Ingresa a tu panel</p>
  <input id="em" type="email" placeholder="Correo"><input id="pw" type="password" placeholder="Contraseña">
  <div class="btns" style="justify-content:center"><button onclick="auth('in')">Entrar</button><button class="ghost" onclick="auth('up')">Crear cuenta</button></div></div>`);
}
async function auth(kind) {
  const c = { email: $("#em").value.trim(), password: $("#pw").value };
  const { data, error } = kind === "in" ? await sb.auth.signInWithPassword(c) : await sb.auth.signUp(c);
  if (error) return toast(error.message, 1);
  if (!data.session) return toast("Cuenta creada. Confirma tu correo y entra.");
  init();
}
function onboardView() {
  app(`<div class="login"><h1>Crea tu empresa</h1><input id="nm" placeholder="Nombre del negocio"><input id="sl" placeholder="identificador (ej: yesmin-spa)">
  <select id="cu" style="width:100%;margin-bottom:8px"><option>EUR</option><option>USD</option><option>VES</option></select><button onclick="mkTenant()">Crear</button></div>`);
}
async function mkTenant() {
  const { error } = await sb.rpc("create_tenant", { p_name: $("#nm").value, p_slug: $("#sl").value.toLowerCase().replace(/[^a-z0-9-]/g, "-"), p_currency: $("#cu").value });
  if (error) return toast(error.message, 1); init();
}
const logout = async () => { await sb.auth.signOut(); location.reload(); };
