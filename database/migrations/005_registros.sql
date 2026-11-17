-- 005 · Registros por servicio (logs). APLICAR EN SQL EDITOR (las migraciones 001-004 ya están aplicadas).
-- Tres fuentes: disparadores de esta base (transacciones, no se pueden saltar), el panel (errores) y las funciones del servidor.

-- 1) Registro de servicios: agregar un servicio nuevo = insertar una fila aquí (ver docs/REGISTROS.md)
create table log_services (service text primary key, description text not null);
insert into log_services values
  ('auth','Ingreso y sesiones'),('clients','Clientas'),('appointments','Citas y calendario'),('packages','Paquetes y sesiones'),
  ('payments','Pagos y caja'),('catalog','Servicios y precios'),('schedule','Horario y bloqueos'),('whatsapp','Bot de WhatsApp'),
  ('backup','Copias y exportación'),('system','Errores generales');
alter table log_services enable row level security;
create policy ls_read on log_services for select to authenticated using (true);

-- 2) Tabla de registros
create table logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  tenant_id uuid references tenants on delete cascade,
  user_id uuid,
  service text not null references log_services,
  level text not null check (level in ('debug','info','warn','error')),
  event text not null check (char_length(event) <= 80),                 -- formato: servicio.accion
  message text check (char_length(coalesce(message, '')) <= 500),
  entity_type text, entity_id uuid,
  request_id uuid,                                                      -- une los pasos de una misma acción
  duration_ms int,
  meta jsonb not null default '{}' check (octet_length(meta::text) <= 4000)   -- NUNCA datos personales ni de salud
);
create index on logs (tenant_id, created_at desc);
create index on logs (tenant_id, service, created_at desc);
create index on logs (request_id);
alter table logs enable row level security;
create policy logs_owner_read on logs for select using (
  exists (select 1 from members m where m.tenant_id = logs.tenant_id and m.user_id = auth.uid() and m.role = 'owner'));
grant select on logs, log_services to authenticated;     -- escribir solo por log_event() y los disparadores

-- 3) log_event(): único camino de escritura desde el panel. La empresa se deduce del usuario (no se puede suplantar).
create or replace function log_event(p_service text, p_level text, p_event text, p_message text default null, p_meta jsonb default '{}',
  p_entity_type text default null, p_entity_id uuid default null, p_request_id uuid default null, p_duration_ms int default null)
returns void language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if auth.uid() is null then return; end if;
  select tenant_id into tid from members where user_id = auth.uid() limit 1;
  if tid is null then return; end if;
  if (select count(*) from logs where tenant_id = tid and user_id = auth.uid() and created_at > now() - interval '1 minute') > 120 then return; end if;  -- anti-inundación
  insert into logs(tenant_id, user_id, service, level, event, message, entity_type, entity_id, request_id, duration_ms, meta)
  values (tid, auth.uid(), coalesce((select service from log_services where service = p_service), 'system'),
          case when p_level in ('debug','info','warn','error') then p_level else 'info' end,
          left(p_event, 80), left(p_message, 500), left(p_entity_type, 40), p_entity_id, p_request_id, p_duration_ms, coalesce(p_meta, '{}'::jsonb));
end $$;
revoke execute on function log_event(text,text,text,text,jsonb,text,uuid,uuid,int) from public, anon;
grant execute on function log_event(text,text,text,text,jsonb,text,uuid,uuid,int) to authenticated;

-- 4) Auditoría automática de transacciones (disparadores): solo cifras y estados, sin notas ni datos de salud.
create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; svc text := tg_argv[0]; m jsonb := '{}';
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if tg_table_name = 'payments' then m := jsonb_build_object('amount', r.amount, 'currency', r.currency, 'method', r.method, 'base_amount', r.base_amount);
  elsif tg_table_name = 'client_packages' then m := jsonb_build_object('sessions_total', r.sessions_total, 'price', r.price_paid, 'sessions_used', r.sessions_used);
  elsif tg_table_name = 'appointments' then m := jsonb_build_object('status', r.status);
    if tg_op = 'UPDATE' then m := m || jsonb_build_object('was', old.status); end if;
  elsif tg_table_name = 'services' then m := jsonb_build_object('name', r.name, 'price', r.price, 'active', r.active);
    if tg_op = 'UPDATE' then m := m || jsonb_build_object('was_price', old.price, 'was_active', old.active); end if;
  end if;
  insert into logs(tenant_id, user_id, service, level, event, entity_type, entity_id, meta)
  values (r.tenant_id, auth.uid(), svc, case when tg_op = 'DELETE' then 'warn' else 'info' end, 'db.' || svc || '.' || lower(tg_op), tg_table_name, r.id, m);
  return r;
end $$;
revoke execute on function audit_row() from public, anon, authenticated;
create trigger audit_payments after insert or delete on payments for each row execute function audit_row('payments');
create trigger audit_packages after insert or update or delete on client_packages for each row execute function audit_row('packages');
create trigger audit_appts after insert or update of status or delete on appointments for each row execute function audit_row('appointments');
create trigger audit_services after insert or update of price, active, name or delete on services for each row execute function audit_row('catalog');

-- 5) Retención: informativos de servicios no financieros, 90 días; el resto (errores, pagos, paquetes), 1 año.
--    Programar su ejecución diaria (pg_cron o una función de servidor) está en docs/REGISTROS.md.
create or replace function purge_logs() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from logs where created_at < now() - interval '365 days'
     or (level in ('debug','info') and service not in ('payments','packages') and created_at < now() - interval '90 days');
  get diagnostics n = row_count; return n;
end $$;
revoke execute on function purge_logs() from public, anon, authenticated;

-- Comprobación: debe devolver 0 filas (ninguna tabla sin RLS)
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
