# Registros (logs) por servicio

Tabla `logs`: `service`, `level` (debug/info/warn/error), `event` (`servicio.accion`), `message`, `entity_type/id`, `request_id`, `duration_ms`, `meta`.

## Quién escribe
1. **Disparadores de la base de datos** (eventos `db.*`): pagos, paquetes, estado de citas y precios. No se pueden saltar desde el navegador.
2. **El panel** (`js/core/logger.js`): cada escritura hecha con `run()` y los errores del navegador. Límite: 30 por minuto.
3. **Funciones del servidor** (bot, copias): escriben con su propio `service`.

`request_id` une todo lo que pasó en una misma acción.

## Agregar un servicio nuevo (sin tocar lo demás)
1. `insert into log_services values ('mi_servicio', 'Descripción');` (nueva migración).
2. Añadirlo a `LOG_SERVICES` en `js/core/logger.js` (y a `TABLE_SERVICE` si tiene tabla propia).
3. Registrar con `log('mi_servicio', 'info', 'mi_servicio.accion', 'mensaje', {ms: 12})`.

## Privacidad
Nunca registrar contraseñas, tokens, cirugías, alergias ni notas. En `meta`, solo cifras, estados y códigos. Los teléfonos, enmascarados.

## Ver los registros
Pestaña **Registro** (solo dueña). Tablas de Supabase: `logs`.

## Retención
`purge_logs()` borra informativos no financieros a los 90 días y todo a los 365. Debe ejecutarse a diario (pg_cron o una función de servidor); **verificar en Supabase si pg_cron está disponible en tu plan**.

## Pendiente
Alertas por Telegram al subir los errores; registros de `auth` (Fase 1); registros del bot (`whatsapp`).
