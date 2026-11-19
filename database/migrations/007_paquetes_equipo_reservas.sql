-- ============================================================================
-- 007 · PAQUETES (anular, vigencia desde 1ª sesión) · EQUIPO · RESERVAS PÚBLICAS
-- ============================================================================
-- Requisitos : migraciones 001 a 006 aplicadas.
-- Idempotente: se puede re-ejecutar.
-- Secciones  : 1 Paquetes · 2 Equipo (varios profesionales) · 3 Guardia anti-cruce
--              4 Servicios de registro · 5 Reservas públicas (anon) · 6 Comprobación
-- NOTA SQL Editor: si aparece "Potential issue detected", elegir "Run without RLS"
--      (es un falso positivo por las variables de las funciones).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. PAQUETES: estado (anulado) y vigencia que empieza en la primera sesión
-- ----------------------------------------------------------------------------
alter table public.client_packages
  add column if not exists status        text not null default 'active',
  add column if not exists cancelled_at  timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists validity_days int;   -- solo se usa si la vigencia cuenta desde la 1ª sesión

do $$ begin
  alter table public.client_packages add constraint pkg_status_valid
    check (status in ('active','cancelled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.client_packages add constraint pkg_cancel_reason_safe
    check (char_length(coalesce(cancel_reason, '')) <= 200 and coalesce(cancel_reason, '') !~ '[<>]');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.client_packages add constraint pkg_validity_days
    check (validity_days is null or validity_days between 1 and 1095);
exception when duplicate_object then null; end $$;

-- 1.1 Vigencia desde la primera sesión: al agendar la primera cita de un paquete
--     que aún no tiene vencimiento, se calcula expires_at = fecha de esa cita + validity_days.
create or replace function public.set_package_expiry()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_days int; v_tz text;
begin
  if new.client_package_id is null then return new; end if;
  select cp.validity_days, t.timezone into v_days, v_tz
  from public.client_packages cp join public.tenants t on t.id = cp.tenant_id
  where cp.id = new.client_package_id and cp.expires_at is null;
  if v_days is not null then
    update public.client_packages
    set expires_at = ((new.starts_at at time zone v_tz)::date + v_days)
    where id = new.client_package_id and expires_at is null;
  end if;
  return new;
end $$;
revoke execute on function public.set_package_expiry() from public, anon, authenticated;

drop trigger if exists trg_appt_package_expiry on public.appointments;
create trigger trg_appt_package_expiry after insert on public.appointments
  for each row execute function public.set_package_expiry();

-- 1.2 Anular un paquete: lo marca y cancela sus citas futuras pendientes/confirmadas.
create or replace function public.cancel_package(p_package_id uuid, p_reason text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_tid uuid; v_status text; v_n int;
begin
  if auth.uid() is null then raise exception 'No autenticado'; end if;
  select tenant_id, status into v_tid, v_status
  from public.client_packages
  where id = p_package_id and public.is_member(tenant_id)
  for update;
  if v_tid is null then raise exception 'Paquete no encontrado o sin permiso'; end if;
  if v_status = 'cancelled' then raise exception 'El paquete ya está anulado'; end if;

  update public.client_packages
  set status = 'cancelled', cancelled_at = now(),
      cancel_reason = left(regexp_replace(btrim(coalesce(p_reason, '')), '[<>]', '', 'g'), 200)
  where id = p_package_id;

  update public.appointments set status = 'cancelled'
  where client_package_id = p_package_id and status in ('pending','confirmed') and starts_at > now();
  get diagnostics v_n = row_count;

  insert into public.logs(tenant_id, user_id, service, level, event, message, entity_type, entity_id, meta)
  values (v_tid, auth.uid(), 'packages', 'warn', 'packages.cancelled', 'Paquete anulado',
          'client_packages', p_package_id, jsonb_build_object('appointments_cancelled', v_n));
  return v_n;
end $$;
revoke execute on function public.cancel_package(uuid, text) from public, anon;
grant  execute on function public.cancel_package(uuid, text) to authenticated;


-- ----------------------------------------------------------------------------
-- 2. EQUIPO: varios profesionales (barbero, esteticista, etc.)
-- ----------------------------------------------------------------------------
create table if not exists public.staff (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants on delete cascade,
  name       text not null check (char_length(name) between 2 and 80 and name !~ '[<>]'),
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;
drop policy if exists tenant_isolation on public.staff;
create policy tenant_isolation on public.staff for all
  using (public.is_member(tenant_id)) with check (public.is_member(tenant_id));
grant select, insert, update, delete on public.staff to authenticated;
create index if not exists idx_staff_tenant on public.staff (tenant_id, active, sort);

-- Cada cita puede asignarse a un profesional (null = sin asignar, como hasta ahora).
alter table public.appointments add column if not exists staff_id uuid references public.staff(id);
create index if not exists idx_appointments_tenant_staff
  on public.appointments (tenant_id, staff_id, starts_at);

-- Anti doble-reserva POR PROFESIONAL (antes era uno por empresa).
-- Se busca el nombre de la restricción vieja porque Postgres la nombró automáticamente.
do $$ declare c text; begin
  select conname into c from pg_constraint
  where conrelid = 'public.appointments'::regclass and contype = 'x';
  if c is not null then execute format('alter table public.appointments drop constraint %I', c); end if;
  alter table public.appointments add constraint appt_no_overlap
    exclude using gist (
      tenant_id with =,
      (coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
      tstzrange(starts_at, ends_at) with &&
    ) where (status in ('pending','confirmed'));
end $$;


-- ----------------------------------------------------------------------------
-- 3. GUARDIA ANTI-CRUCE: ahora también valida staff_id (reemplaza la de 006)
-- ----------------------------------------------------------------------------
create or replace function public.check_tenant_refs()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row        jsonb := to_jsonb(new);
  v_client_id  uuid  := nullif(v_row->>'client_id', '')::uuid;
  v_service_id uuid  := nullif(v_row->>'service_id', '')::uuid;
  v_pkg_id     uuid  := nullif(v_row->>'client_package_id', '')::uuid;
  v_staff_id   uuid  := nullif(v_row->>'staff_id', '')::uuid;
begin
  if v_client_id is not null and not exists (
    select 1 from public.clients c where c.id = v_client_id and c.tenant_id = new.tenant_id) then
    raise exception 'Referencia inválida: la clienta no pertenece a esta empresa' using errcode = '23503';
  end if;
  if v_service_id is not null and not exists (
    select 1 from public.services s where s.id = v_service_id and s.tenant_id = new.tenant_id) then
    raise exception 'Referencia inválida: el servicio no pertenece a esta empresa' using errcode = '23503';
  end if;
  if v_pkg_id is not null and not exists (
    select 1 from public.client_packages p where p.id = v_pkg_id and p.tenant_id = new.tenant_id) then
    raise exception 'Referencia inválida: el paquete no pertenece a esta empresa' using errcode = '23503';
  end if;
  if v_staff_id is not null and not exists (
    select 1 from public.staff st where st.id = v_staff_id and st.tenant_id = new.tenant_id) then
    raise exception 'Referencia inválida: el profesional no pertenece a esta empresa' using errcode = '23503';
  end if;
  return new;
end $$;
revoke execute on function public.check_tenant_refs() from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. SERVICIOS DE REGISTRO NUEVOS (ver docs/REGISTROS.md)
-- ----------------------------------------------------------------------------
insert into public.log_services values
  ('staff',   'Equipo y profesionales'),
  ('booking', 'Reservas en línea')
on conflict (service) do nothing;


-- ----------------------------------------------------------------------------
-- 5. RESERVAS PÚBLICAS (accesibles sin iniciar sesión, solo por estas 2 funciones)
-- ----------------------------------------------------------------------------
-- Seguridad: las tablas siguen cerradas para 'anon'. Estas funciones devuelven solo
-- datos comerciales (servicios, horario, huecos ocupados SIN nombres) y solo si la
-- dueña activó settings.public_booking. Límites anti-abuso dentro de public_book().

-- 5.1 Auxiliar interno: ¿el rango cae dentro del horario de trabajo? (espejo de schedule.js)
create or replace function public._within_hours(p_settings jsonb, p_tz text, p_start timestamptz, p_end timestamptz)
returns boolean language plpgsql stable set search_path = public as $$
declare
  ls timestamp := p_start at time zone p_tz;
  le timestamp := p_end   at time zone p_tz;
  d  text;  h jsonb;  sm int;  em int;
begin
  if ls::date <> le::date then return false; end if;
  d := extract(dow from ls)::int::text;
  h := p_settings->'working_hours'->d;
  if h is null then h := jsonb_build_object('on', d::int > 0, 'f', '08:00', 't', '15:00'); end if;
  if coalesce((h->>'on')::boolean, false) is not true then return false; end if;
  sm := extract(hour from ls)::int * 60 + extract(minute from ls)::int;
  em := extract(hour from le)::int * 60 + extract(minute from le)::int;
  if sm >= split_part(coalesce(h->>'f','08:00'),':',1)::int*60 + split_part(coalesce(h->>'f','08:00'),':',2)::int
     and em <= split_part(coalesce(h->>'t','15:00'),':',1)::int*60 + split_part(coalesce(h->>'t','15:00'),':',2)::int
  then return true; end if;
  if coalesce(h->>'f2','') <> '' and coalesce(h->>'t2','') <> ''
     and sm >= split_part(h->>'f2',':',1)::int*60 + split_part(h->>'f2',':',2)::int
     and em <= split_part(h->>'t2',':',1)::int*60 + split_part(h->>'t2',':',2)::int
  then return true; end if;
  return false;
end $$;
revoke execute on function public._within_hours(jsonb, text, timestamptz, timestamptz) from public, anon, authenticated;

-- 5.2 Información pública de la empresa para armar la página de reservas
create or replace function public.public_booking_info(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t record; v jsonb;
begin
  select id, name, currency, timezone, settings into t
  from public.tenants where slug = lower(coalesce(p_slug, ''));
  if t.id is null or coalesce((t.settings->>'public_booking')::boolean, false) is not true then
    return null;
  end if;
  select jsonb_build_object(
    'name', t.name, 'currency', t.currency, 'timezone', t.timezone,
    'working_hours', coalesce(t.settings->'working_hours', '{}'::jsonb),
    'services', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description,
                 'price', s.price, 'duration_min', s.duration_min, 'category', s.category) order by s.category, s.sort)
        from public.services s where s.tenant_id = t.id and s.active and s.kind = 'service'), '[]'::jsonb),
    'staff', coalesce((
        select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name) order by st.sort, st.name)
        from public.staff st where st.tenant_id = t.id and st.active), '[]'::jsonb),
    'busy', coalesce((
        select jsonb_agg(jsonb_build_object('s', a.starts_at, 'e', a.ends_at, 'staff', a.staff_id))
        from public.appointments a
        where a.tenant_id = t.id and a.status in ('pending','confirmed')
          and a.ends_at > now() and a.starts_at < now() + interval '46 days'), '[]'::jsonb)
      || coalesce((
        select jsonb_agg(jsonb_build_object('s', b.starts_at, 'e', b.ends_at, 'staff', null::uuid))
        from public.blocks b
        where b.tenant_id = t.id and b.ends_at > now() and b.starts_at < now() + interval '46 days'), '[]'::jsonb)
  ) into v;
  return v;
end $$;
revoke execute on function public.public_booking_info(text) from public;
grant  execute on function public.public_booking_info(text) to anon, authenticated;

-- 5.3 Crear una reserva pública (queda 'pending': la dueña la confirma desde el panel)
create or replace function public.public_book(
  p_slug text, p_service_id uuid, p_staff_id uuid, p_starts_at timestamptz,
  p_name text, p_phone text, p_zone text default null, p_consent boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  t record; s record; v_end timestamptz; v_cid uuid; v_n int;
  v_name  text := btrim(coalesce(p_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_zone  text := nullif(btrim(coalesce(p_zone, '')), '');
begin
  select id, name, timezone, settings into t from public.tenants where slug = lower(coalesce(p_slug, ''));
  if t.id is null or coalesce((t.settings->>'public_booking')::boolean, false) is not true then
    raise exception 'Las reservas en línea no están disponibles';
  end if;

  select id, duration_min into s from public.services
  where id = p_service_id and tenant_id = t.id and active and kind = 'service';
  if s.id is null then raise exception 'Servicio no disponible'; end if;

  if p_staff_id is not null and not exists (
      select 1 from public.staff where id = p_staff_id and tenant_id = t.id and active) then
    raise exception 'Profesional no disponible';
  end if;

  -- Validaciones de datos (mismos límites que las restricciones de las tablas)
  if char_length(v_name) < 2 or char_length(v_name) > 80 or v_name ~ '[<>]' then
    raise exception 'Escribe tu nombre (2 a 80 letras, sin < ni >)';
  end if;
  if char_length(v_phone) < 8 or char_length(v_phone) > 15 then
    raise exception 'Escribe un teléfono válido con código de país';
  end if;
  if v_zone is not null and (char_length(v_zone) > 120 or v_zone ~ '[<>]') then
    raise exception 'Zona inválida';
  end if;

  -- Ventana y horario
  if p_starts_at < now() + interval '1 hour' or p_starts_at > now() + interval '45 days' then
    raise exception 'Elige una fecha entre dentro de 1 hora y 45 días';
  end if;
  v_end := p_starts_at + make_interval(mins => s.duration_min);
  if not public._within_hours(t.settings, t.timezone, p_starts_at, v_end) then
    raise exception 'Ese horario está fuera del horario de atención';
  end if;
  if exists (select 1 from public.blocks b where b.tenant_id = t.id and p_starts_at < b.ends_at and v_end > b.starts_at) then
    raise exception 'Ese horario no está disponible';
  end if;

  -- Anti-abuso: tope por hora para la empresa y por teléfono
  select count(*) into v_n from public.appointments
  where tenant_id = t.id and source = 'web' and created_at > now() - interval '1 hour';
  if v_n >= 20 then raise exception 'Hay muchas reservas en este momento. Intenta de nuevo más tarde'; end if;

  select count(*) into v_n from public.appointments a join public.clients c on c.id = a.client_id
  where a.tenant_id = t.id and c.phone = v_phone and a.source = 'web' and a.status = 'pending' and a.starts_at > now();
  if v_n >= 2 then raise exception 'Ya tienes reservas por confirmar. Te contactaremos pronto'; end if;

  -- Cliente: se crea si no existe; si existe NO se modifica (no se filtra ni se pisa información)
  insert into public.clients(tenant_id, name, phone, zone, source, marketing_consent)
  values (t.id, v_name, v_phone, v_zone, 'web', coalesce(p_consent, false))
  on conflict (tenant_id, phone) do nothing;
  select id into v_cid from public.clients where tenant_id = t.id and phone = v_phone;

  begin
    insert into public.appointments(tenant_id, client_id, service_id, staff_id, starts_at, ends_at, status, zone, source)
    values (t.id, v_cid, s.id, p_staff_id, p_starts_at, v_end, 'pending', v_zone, 'web');
  exception when exclusion_violation then
    raise exception 'Ese horario acaba de ser reservado. Elige otro';
  end;

  insert into public.logs(tenant_id, service, level, event, message, meta)
  values (t.id, 'booking', 'info', 'booking.public_created', 'Reserva en línea', jsonb_build_object('duration_min', s.duration_min));

  return jsonb_build_object('ok', true, 'business', t.name, 'starts_at', p_starts_at);
end $$;
revoke execute on function public.public_book(text, uuid, uuid, timestamptz, text, text, text, boolean) from public;
grant  execute on function public.public_book(text, uuid, uuid, timestamptz, text, text, text, boolean) to anon, authenticated;


-- ----------------------------------------------------------------------------
-- 6. COMPROBACIÓN FINAL (debe devolver 0 filas: ninguna tabla pública sin RLS)
-- ----------------------------------------------------------------------------
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
