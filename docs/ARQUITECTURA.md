# Arquitectura de Agendia

## Capas (web/js)
| Carpeta | Qué contiene | Regla |
|---|---|---|
| `core/` | estado, registro, ayudas de interfaz, arranque, render | no conoce negocio |
| `services/` | reglas de negocio reutilizables (hoy: horario) | no dibuja pantallas |
| `views/` | una pantalla por archivo | dibuja y llama a servicios; **objetivo: no hablar directo con la base de datos** |

Orden de carga: ver `<script>` en `web/index.html` (`core/start.js` siempre al final). Los archivos comparten el ámbito global; una función usada por otra vista se anota en su cabecera ("La usan").

## Estado de la migración
Fase 0a: el código se dividió **sin reescribirlo**. Aún hay llamadas a la base de datos dentro de las vistas. Fase 0b las irá moviendo a `services/` (citas, clientas, paquetes, pagos, catálogo), una por una, con pruebas.

## Comentarios
Cada archivo lleva cabecera (propósito, depende de, la usan). Cada función: qué hace; los comentarios explican el **porqué**.

## Base de datos
Cambios solo como archivos numerados en `database/migrations/` (001, 002...). Nunca editar una migración ya aplicada: crear la siguiente. Probar primero en un proyecto `agendia-dev`.

## CSS
`web/css/`: `tokens` (colores) → `base` → `views` → `components` → `responsive`. Los colores salen siempre de las variables de `tokens.css`.
