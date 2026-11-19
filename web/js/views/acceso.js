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
  <div class="btns" style="justify-content:center"><button onclick="auth('in')">Entrar</button><button class="ghost" onclick="auth('up')">Crear cuenta</button></div>
  <hr style="border:none;border-top:1px solid var(--bd);margin:14px 0">
  <button class="ghost" style="width:100%" onclick="authGoogle()">Continuar con Google</button></div>`);
}
/** Ingreso con Google (requiere activar el proveedor Google en Supabase > Authentication > Providers). */
async function authGoogle() {
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  if (error) toast(error.message, 1);
}
async function auth(kind) {
  const c = { email: $("#em").value.trim(), password: $("#pw").value };
  const { data, error } = kind === "in" ? await sb.auth.signInWithPassword(c) : await sb.auth.signUp(c);
  if (error) return toast(error.message, 1);
  if (!data.session) return toast("Cuenta creada. Confirma tu correo y entra.");
  init();
}
function onboardView() {
  app(`<div class="login"><h1>Crea tu empresa</h1><p class="mu">Solo necesitamos el nombre de tu negocio y la moneda principal.</p>
  <input id="nm" placeholder="Nombre del negocio" maxlength="80">
  <select id="cu" style="width:100%;margin-bottom:8px"><option value="EUR">EUR · Euro</option><option value="USD">USD · Dólar</option><option value="VES">VES · Bolívar</option></select><button onclick="mkTenant()">Crear</button></div>`);
}
/** Identificador interno genérico y único (no depende del nombre del negocio). Formato: emp-xxxxxxxx */
const genSlug = () => "emp-" + [...crypto.getRandomValues(new Uint8Array(8))].map(b => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");
async function mkTenant() {
  const name = $("#nm").value.trim();
  if (name.length < 2) return toast("Escribe el nombre de tu negocio (mínimo 2 letras)", 1);
  let error;
  for (let i = 0; i < 3; i++) {   // reintenta si por azar el identificador ya existe
    ({ error } = await sb.rpc("create_tenant", { p_name: name, p_slug: genSlug(), p_currency: $("#cu").value }));
    if (!error || error.code !== "23505") break;
  }
  if (error) return toast(error.message, 1); init();
}
const logout = async () => { await sb.auth.signOut(); location.reload(); };
