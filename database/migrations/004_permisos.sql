-- 004 · Permisos de las tablas para usuarios con sesión (ya aplicados a mano; se guardan aquí para reproducir el entorno).
-- Las reglas RLS siguen decidiendo quién ve qué: estos permisos solo abren la puerta a nivel de tabla.
grant usage on schema public to authenticated;
grant execute on function is_member(uuid) to authenticated;
grant select on members, tenants to authenticated;
grant select, insert, update, delete on clients, custom_fields, services, client_packages, appointments, blocks to authenticated;
grant select, update on bot_state to authenticated;
grant select on messages to authenticated;
grant update on tenants to authenticated;
