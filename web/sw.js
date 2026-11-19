/* ==================================================================
   web/sw.js (Service Worker PWA)
   Propósito : Permite instalar Agendia como app en el teléfono y acelerar
               la carga de archivos estáticos.
   Seguridad : NUNCA cachea peticiones a Supabase ni llamadas de API/auth;
               usa estrategia Network-First para que las mejoras se reflejen
               de inmediato cuando hay conexión.
   ================================================================== */
const CACHE = "agendia-static-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./icon.svg",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/base.css",
  "./css/views.css",
  "./css/components.css",
  "./css/responsive.css"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // Solo peticiones GET del mismo origen y nunca config.js ni APIs externas
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith("/config.js")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
