/* ==================================================================
   js/core/state.js
   Propósito : Cliente de Supabase, estado global y ayudas básicas ($, esc, toast, modal, formatos).
   Depende de: config.js, supabase-js (CDN)
   La usan   : Todos los demás archivos
   ================================================================== */
const sb = (typeof SUPABASE_URL === "undefined" || SUPABASE_URL.startsWith("PEGA")) ? null : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let ROLE = null, T = null, tab = "agenda", D = {c:[],s:[],a:[],b:[],p:[],pay:[]}, q = "", editing = null;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const app = h => $("#app").innerHTML = h;
const cur = () => T.currency === "EUR" ? "€" : T.currency;
const cn = id => { const c = D.c.find(x => x.id === id); return c ? (c.name || c.phone) : "?"; };
const sn = id => D.s.find(x => x.id === id)?.name || "—";
const hm = d => new Date(d).toLocaleTimeString("es", {hour:"2-digit", minute:"2-digit"});
const money = n => Number(n).toLocaleString("es", {maximumFractionDigits:0});
const toast = (m, bad) => { if (bad) unbusy(); const d = document.createElement("div"); d.textContent = (bad ? "⚠️ " : "✓ ") + m; $("#toast").append(d); setTimeout(() => d.remove(), 3200); };
const setTheme = v => { document.documentElement.dataset.t = v; try { localStorage.setItem("t", v); } catch (e) {} };
const toggleTheme = () => setTheme(document.documentElement.dataset.t === "dark" ? "light" : "dark");
const modal = (title, html) => { $("#dlg").innerHTML = `<div class="mh"><b>${title}</b><button class="x" onclick="dlg.close()">✕</button></div>${html}`; if (!dlg.open) dlg.showModal(); };
