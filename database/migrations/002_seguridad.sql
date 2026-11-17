-- Endurecimiento de seguridad. Ejecutar DESPUÉS de schema.sql, en SQL Editor.

-- 1) Quien no ha iniciado sesión (anon) no puede ejecutar funciones del negocio.
revoke execute on function create_tenant(text, text, text) from public, anon;
grant  execute on function create_tenant(text, text, text) to authenticated;

revoke execute on function seed_yesmin(uuid) from public, anon, authenticated;  -- solo desde SQL Editor
revoke execute on function on_appointment_completed() from public, anon, authenticated;

revoke execute on function is_member(uuid) from public, anon;
grant  execute on function is_member(uuid) to authenticated;

-- 2) Anti-abuso: una cuenta no puede crear empresas en serie.
create or replace function create_tenant(p_name text, p_slug text, p_currency text default 'EUR')
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  if exists (select 1 from members where user_id = auth.uid() and role = 'owner') then
    raise exception 'Esta cuenta ya tiene una empresa';
  end if;
  insert into tenants(name, slug, currency) values (p_name, p_slug, p_currency) returning id into tid;
  insert into members(tenant_id, user_id, role) values (tid, auth.uid(), 'owner');
  return tid;
end $$;

-- 3) Validaciones y límites de tamaño (evitan datos basura y abuso de almacenamiento).
alter table tenants add constraint tenants_slug_fmt check (slug ~ '^[a-z0-9-]{3,40}$');
alter table tenants add constraint tenants_name_len check (char_length(name) between 2 and 80);
alter table tenants add constraint tenants_currency check (currency in ('EUR','USD','VES'));
alter table clients add constraint clients_len check (
  char_length(phone) between 6 and 30
  and char_length(coalesce(name, '')) <= 120
  and char_length(coalesce(notes, '')) <= 2000
  and char_length(coalesce(zone, '')) <= 120);
alter table services add constraint services_price check (price >= 0 and sessions >= 1);
alter table client_packages add constraint pkg_sessions check (sessions_used between 0 and sessions_total);
alter table messages add constraint messages_len check (char_length(coalesce(body, '')) <= 4096);

-- 4) Las tablas del bot y el registro de mensajes solo se leen desde el panel;
--    quien escribe en ellas es la función del bot (con la secret key, que se salta RLS).
drop policy if exists tenant_isolation on messages;
create policy messages_read on messages for select using (is_member(tenant_id));
drop policy if exists tenant_isolation on bot_state;
create policy bot_state_read on bot_state for select using (is_member(tenant_id));
create policy bot_state_update on bot_state for update
  using (is_member(tenant_id)) with check (is_member(tenant_id));   -- para reactivar el bot desde el panel

-- 5) Comprobación: ninguna tabla del esquema público debe tener RLS desactivado.
--    Debe devolver 0 filas:
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
