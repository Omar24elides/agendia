# Reglas Permanentes del Proyecto · Agendia

Estas instrucciones aplican siempre que se trabaje en este repositorio.

## 1. Forma de trabajo
- **Idioma**: Responder y documentar siempre en español.
- **Conversar antes de cambios grandes**: Antes de refactorizaciones mayores, cambios de arquitectura o decisiones de producto, comparar opciones (incluyendo buenas prácticas de mercados similares como Fresha, Booksy, Jane App) y pedir confirmación antes de ejecutar.
- **Enfoque multi-rubro**: Agendia nace para Yesmin Spa (estética a domicilio en Caracas y Los Valles del Tuy, Venezuela), pero toda la lógica y la base de datos deben mantenerse reutilizables para cualquier negocio de servicios (barberías, clínicas, consultorios, estudios, etc.).
- **Exclusiones**: No proponer ni implementar funciones de "traslados entre visitas".

## 2. Arquitectura y calidad de código
- **Capas en `web/js/`**:
  - `core/`: estado global, logger, utilidades de UI, arranque y render (no conoce reglas de negocio).
  - `services/`: lógica de negocio y comunicación con Supabase (no dibuja HTML).
  - `views/`: una pantalla por archivo (dibuja y llama a `services/`; **no debe hablar directo con la base de datos**).
- **Estructura jerárquica y comentarios**: Todo código nuevo o modificado debe tener cabecera (propósito, dependencias, quién la usa), secciones claras y comentarios que expliquen el **porqué** para facilitar mantenimiento futuro.
- **Base de datos**: Cambios solo mediante migraciones numeradas en `database/migrations/` (`001`, `002`, ...). Nunca editar una migración ya aplicada. Todas las tablas públicas deben tener RLS activado.
- **Trazabilidad (Logs)**: Toda acción relevante y error se registra por servicio (`log_services` / `logs`) sin almacenar contraseñas, tokens, diagnósticos, alergias ni notas clínicas.

## 3. Diseño e interfaz (UI/UX)
- **Paletas**: Raava (modo claro con fondo blanco grisáceo estilo Facebook) y Vaatu (modo oscuro con negro grisáceo suave y los mismos colores secundarios del modo claro).
- **CSS modular y estable**: `web/css/` (`tokens` → `base` → `views` → `components` → `responsive`). Todos los colores deben salir de variables en `tokens.css`.
- **Responsive total**: Cada vista y formulario debe ser funcional y estético en teléfonos móviles, tablets y escritorio.
- **Inputs numéricos**: Sin flechas de incremento/decremento; solo entrada de números (`data-num="int"` o `data-num="dec"` + `inputmode`).

## 4. Seguridad y rendimiento
- Priorizar seguridad en servidor (RLS, permisos por columna, validaciones `CHECK`, triggers de integridad multiempresa y financiera) y rendimiento para conexiones móviles (paginación, índices, consultas por ventana de tiempo).
- Nunca exponer claves secretas (`SERVICE_ROLE_KEY`, tokens de WhatsApp/Telegram) en `web/` ni subir `.env` a Git.
