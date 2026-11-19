# Cambios
## Fase 0a
- Código dividido por capas (web/js/core, services, views) con cabeceras comentadas; CSS en 5 archivos.
- Migraciones numeradas (001-005). **005 agrega los registros.**
- Sistema de registros por servicio + pestaña Registro (dueña).
- Eliminar y renombrar servicios y categorías; los servicios con historial se archivan.
- `config.js` separado.
## Fase 0b (completada)
- **Migración `006_seguridad_rendimiento.sql`**: permisos por columna en `tenants`, guardia anti-cruce multiempresa, integridad financiera multimoneda en servidor, canje de fidelidad atómico (`redeem_loyalty_reward`), índices compuestos + trigramas (`pg_trgm`) y RPCs ligeras (`search_clients_page`, `get_caja_summary`).
- **Migración `007_paquetes_equipo_reservas.sql`**: anulación de paquetes (`cancel_package`), vigencia desde la primera sesión (`set_package_expiry`), tabla `staff` con anti doble-reserva por profesional, servicios de registro `staff` y `booking`, y RPCs públicas `public_booking_info` / `public_book`.
- **Bloques A, C y D implementados**:
  - **A**: editar y eliminar clientas sin historial, ficha completa con historial/paquetes/notas, venta de paquetes con abono inicial, anulación de paquetes, reprogramación de citas, vigencia desde compra o desde primera sesión.
  - **C**: vocabulario configurable por rubro (`vocab.js`: spa, barbería, clínica, general) y gestión de equipo/profesionales (`services/equipo.js`, `views/equipo.js`) con filtro en calendario.
  - **D**: PWA instalable (`manifest.webmanifest`, `icon.svg`, `sw.js`), página pública de reservas (`reservar.html`), recordatorios por WhatsApp (`CitasService.reminderUrl`) y botón de ingreso con Google (`acceso.js`).
- **Bloque B (Seguridad y Rendimiento) completado**:
  - Capa `services/` 100% desacoplada de las vistas (`catalogo.js`, `citas.js`, `clientas.js`, `paquetes.js`, `caja.js`, `equipo.js`, `ajustes.js`, `backup.js`).
  - `boot.js` optimizado con ventana de 90 días y carga bajo demanda (`CitasService.ensureWindow`) al navegar a meses anteriores.
  - Respaldo completo portable en JSON (`BackupService.exportAllJson`) desde **Ajustes**.
