/* ==================================================================
   js/core/start.js
   Propósito : Último archivo en cargar: inicia la aplicación o avisa que falta configurar.
   Depende de: Todos los anteriores
   La usan   : index.html
   ================================================================== */
if (!sb) app('<div class="login"><h1>Falta configurar</h1><p>Abre <code>config.js</code> y pega tu URL y tu clave publicable de Supabase.</p></div>');
else init();
