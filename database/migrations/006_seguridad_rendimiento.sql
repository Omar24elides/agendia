-- ============================================================================
-- 006 · ENDURECIMIENTO DE SEGURIDAD Y RENDIMIENTO (PRE-FASE 0b / PRODUCCIÓN)
-- ============================================================================
-- Propósito :
--   1. Permisos por columna (principio de mínimo privilegio en tenants).
--   2. Validaciones faltantes en bloques, clientas, paquetes y citas.
--   3. Guardia anti-cruce multiempresa (evita referenciar UUIDs de otra empresa).
--   4. Integridad financiera en pagos multimoneda (EUR / USD / VES) en servidor.
--   5. Canje de fidelidad atómico y auditado (redeem_loyalty_reward).
--   6. Índices compuestos y trigramas (pg_trgm) para red móvil y paginación.
--   7. Funciones RPC ligeras para búsqueda paginada y resumen de caja.
--
-- Requisitos : Tener aplicadas las migraciones 001 a 005.
-- Idempotente: Seguro de re-ejecutar en agendia-dev o producción.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. SEGURIDAD POR COLUMNA Y VALIDACIONES DE ESQUEMA
-- ----------------------------------------------------------------------------

-- 1.1 Restringir UPDATE en tenants solo a campos editables desde el panel.
--     Protege 'plan', 'slug', 'wa_phone_number_id', 'id' y 'created_at' contra
--     manipulación desde la consola del navegador.
revoke update on table public.tenants from authenticated;
grant update (name, currency, timezone, loyalty_target, settings)
  on table public.tenants to authenticated;

-- 1.2 Validaciones faltantes en blocks (rango horario válido y texto seguro)
do $$ begin
  alter table public.blocks
    add constraint blocks_time_valid check (ends_at > starts_at);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.blocks
    add constraint blocks_reason_safe check (
      char_length(coalesce(reason, '')) <= 120
      and coalesce(reason, '') !~ '[<>]'
    );
exception when duplicate_object then null; end $$;

-- 1.3 Límites de seguridad en sellos, paquetes y notas de citas
do $$ begin
  alter table public.clients
    add constraint clients_stamps_nonneg check (loyalty_stamps >= 0 and loyalty_stamps <= 10000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.client_packages
    add constraint pkg_price_nonneg check (price_paid is null or (price_paid >= 0 and price_paid <= 10000000));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.client_packages
    add constraint pkg_sessions_min check (sessions_total >= 1 and sessions_total <= 365);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.appointments
    add constraint appt_notes_safe check (
      char_length(coalesce(notes, '')) <= 1000
      and coalesce(notes, '') !~ '[<>]'
    );
exception when duplicate_object then null; end $$;


-- ----------------------------------------------------------------------------
-- 2. GUARDIA ANTI-CRUCE MULTIEMPRESA (CROSS-TENANT REFERENTIAL INTEGRITY)
-- ----------------------------------------------------------------------------
-- Por qué: RLS garantiza que el usuario escriba con su propio tenant_id, pero
--          no impide que alguien envíe un client_id, service_id o client_package_id
--          perteneciente a otra empresa. Este disparador cierra esa brecha.

create or replace function public.check_tenant_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row        jsonb := to_jsonb(new);
  v_client_id  uuid  := nullif(v_row->>'client_id', '')::uuid;
  v_service_id uuid  := nullif(v_row->>'service_id', '')::uuid;
  v_pkg_id     uuid  := nullif(v_row->>'client_package_id', '')::uuid;
begin
  if v_client_id is not null then
    if not exists (
      select 1 from public.clients c
      where c.id = v_client_id and c.tenant_id = new.tenant_id
    ) then
      raise exception 'Referencia inválida: la clienta no pertenece a esta empresa'
        using errcode = '23503';
    end if;
  end if;

  if v_service_id is not null then
    if not exists (
      select 1 from public.services s
      where s.id = v_service_id and s.tenant_id = new.tenant_id
    ) then
      raise exception 'Referencia inválida: el servicio no pertenece a esta empresa'
        using errcode = '23503';
    end if;
  end if;

  if v_pkg_id is not null then
    if not exists (
      select 1 from public.client_packages p
      where p.id = v_pkg_id and p.tenant_id = new.tenant_id
    ) then
      raise exception 'Referencia inválida: el paquete no pertenece a esta empresa'
        using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.check_tenant_refs() from public, anon, authenticated;

drop trigger if exists trg_appointments_tenant_refs on public.appointments;
create trigger trg_appointments_tenant_refs
  before insert or update on public.appointments
  for each row execute function public.check_tenant_refs();

drop trigger if exists trg_packages_tenant_refs on public.client_packages;
create trigger trg_packages_tenant_refs
  before insert or update on public.client_packages
  for each row execute function public.check_tenant_refs();

drop trigger if exists trg_payments_tenant_refs on public.payments;
create trigger trg_payments_tenant_refs
  before insert or update on public.payments
  for each row execute function public.check_tenant_refs();


-- ----------------------------------------------------------------------------
-- 3. INTEGRIDAD FINANCIERA MULTIMONEDA (EUR / USD / VES) EN EL SERVIDOR
-- ----------------------------------------------------------------------------
-- Por qué: Nunca confiar en cálculos monetarios hechos en el navegador.
--          Si se paga en la moneda base de la empresa, rate=1 y base_amount=amount.
--          Si se paga en otra moneda, el servidor recalcula base_amount = amount / rate.

create or replace function public.enforce_payment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_currency text;
begin
  select currency into v_base_currency
  from public.tenants
  where id = new.tenant_id;

  if v_base_currency is null then
    raise exception 'Empresa no encontrada';
  end if;

  new.amount := round(new.amount::numeric, 2);

  if new.currency = v_base_currency then
    new.rate := 1;
    new.base_amount := new.amount;
  else
    if new.rate is null or new.rate <= 0 then
      raise exception 'Tasa de cambio inválida para convertir a %', v_base_currency;
    end if;
    new.base_amount := round((new.amount / new.rate)::numeric, 2);
    if new.base_amount <= 0 then
      raise exception 'El equivalente en % debe ser mayor a 0', v_base_currency;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_payment_integrity() from public, anon, authenticated;

drop trigger if exists trg_payments_integrity on public.payments;
create trigger trg_payments_integrity
  before insert on public.payments
  for each row execute function public.enforce_payment_integrity();


-- ----------------------------------------------------------------------------
-- 4. CANJE DE FIDELIDAD ATÓMICO Y AUDITADO
-- ----------------------------------------------------------------------------
-- Por qué: Evita doble canje por doble clic (FOR UPDATE), valida que la clienta
--          tenga suficientes sellos y deja registro automático en la tabla logs.

create or replace function public.redeem_loyalty_reward(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tid       uuid;
  v_target    integer;
  v_stamps    integer;
  v_remaining integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  select c.tenant_id, c.loyalty_stamps, t.loyalty_target
    into v_tid, v_stamps, v_target
  from public.clients c
  join public.tenants t on t.id = c.tenant_id
  where c.id = p_client_id
    and public.is_member(c.tenant_id)
  for update of c;

  if v_tid is null then
    raise exception 'Clienta no encontrada o sin permiso';
  end if;

  if v_stamps < v_target then
    raise exception 'Faltan sellos para el regalo (tiene %, requiere %)', v_stamps, v_target;
  end if;

  v_remaining := v_stamps - v_target;

  update public.clients
  set loyalty_stamps = v_remaining
  where id = p_client_id;

  insert into public.logs(
    tenant_id, user_id, service, level, event, message, entity_type, entity_id, meta
  )
  values (
    v_tid,
    auth.uid(),
    'clients',
    'info',
    'clients.reward_redeemed',
    'Regalo de fidelidad entregado',
    'clients',
    p_client_id,
    jsonb_build_object('stamps_before', v_stamps, 'target', v_target, 'stamps_after', v_remaining)
  );

  return v_remaining;
end;
$$;

revoke execute on function public.redeem_loyalty_reward(uuid) from public, anon;
grant  execute on function public.redeem_loyalty_reward(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- 5. ÍNDICES PARA RED MÓVIL, VENTANAS DE TIEMPO Y PAGINACIÓN
-- ----------------------------------------------------------------------------

-- Extensión de trigramas para búsqueda rápida por subcadenas (nombre/teléfono/zona)
create extension if not exists pg_trgm;

-- Clientas: paginación estable y búsqueda rápida por texto
create index if not exists idx_clients_tenant_created
  on public.clients (tenant_id, created_at desc, id desc);

create index if not exists idx_clients_search_trgm
  on public.clients
  using gin (lower(coalesce(name, '') || ' ' || phone || ' ' || coalesce(zone, '')) gin_trgm_ops);

-- Citas: consultas por ventana de tiempo (semana/mes), por paquete y por clienta
create index if not exists idx_appointments_tenant_window
  on public.appointments (tenant_id, starts_at, ends_at);

create index if not exists idx_appointments_tenant_pkg
  on public.appointments (tenant_id, client_package_id)
  where client_package_id is not null;

create index if not exists idx_appointments_tenant_client
  on public.appointments (tenant_id, client_id, starts_at desc);

-- Bloqueos: consultas por rango de fechas
create index if not exists idx_blocks_tenant_window
  on public.blocks (tenant_id, ends_at, starts_at);

-- Paquetes: listado paginado y consulta por clienta
create index if not exists idx_packages_tenant_purchased
  on public.client_packages (tenant_id, purchased_at desc, id desc);

create index if not exists idx_packages_tenant_client
  on public.client_packages (tenant_id, client_id);

-- Pagos: listado paginado por fecha y suma de abonos por paquete
create index if not exists idx_payments_tenant_paid
  on public.payments (tenant_id, paid_at desc, id desc);

create index if not exists idx_payments_tenant_pkg
  on public.payments (tenant_id, client_package_id)
  where client_package_id is not null;

-- Catálogo de servicios: filtrado rápido por activos y orden visual
create index if not exists idx_services_tenant_active_sort
  on public.services (tenant_id, active, sort);


-- ----------------------------------------------------------------------------
-- 6. FUNCIONES RPC DE LECTURA OPTIMIZADA (LISTAS PARA FASE 0b)
-- ----------------------------------------------------------------------------

-- 6.1 Búsqueda paginada de clientas (máximo 100 por página, acelera red móvil)
create or replace function public.search_clients_page(
  p_tenant_id uuid,
  p_query     text default '',
  p_limit     int  default 30,
  p_offset    int  default 0
)
returns table (
  id                uuid,
  name              text,
  phone             text,
  zone              text,
  source            text,
  marketing_consent boolean,
  loyalty_stamps    integer,
  notes             text,
  custom            jsonb,
  created_at        timestamptz,
  total_count       bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q   text := replace(replace(replace(lower(trim(coalesce(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_');
  v_lim int  := greatest(1, least(coalesce(p_limit, 30), 100));
  v_off int  := greatest(0, coalesce(p_offset, 0));
begin
  if auth.uid() is null or not public.is_member(p_tenant_id) then
    raise exception 'Acceso denegado';
  end if;

  return query
  select
    c.id,
    c.name,
    c.phone,
    c.zone,
    c.source,
    c.marketing_consent,
    c.loyalty_stamps,
    c.notes,
    c.custom,
    c.created_at,
    count(*) over() as total_count
  from public.clients c
  where c.tenant_id = p_tenant_id
    and (
      v_q = ''
      or lower(coalesce(c.name, '') || ' ' || c.phone || ' ' || coalesce(c.zone, '')) like '%' || v_q || '%' escape '\'
    )
  order by c.created_at desc, c.id desc
  limit v_lim
  offset v_off;
end;
$$;

revoke execute on function public.search_clients_page(uuid, text, int, int) from public, anon;
grant  execute on function public.search_clients_page(uuid, text, int, int) to authenticated;

-- 6.2 Resumen de Caja en el servidor (evita descargar miles de filas al móvil)
create or replace function public.get_caja_summary(
  p_tenant_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_member(p_tenant_id) then
    raise exception 'Acceso denegado';
  end if;

  with period_payments as (
    select amount, currency, base_amount, method
    from public.payments
    where tenant_id = p_tenant_id
      and paid_at >= p_from
      and paid_at < p_to
  ),
  totals as (
    select
      coalesce(sum(base_amount), 0)::numeric(14,2) as total_base,
      count(*)::int as total_count
    from period_payments
  ),
  by_cur as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'currency', currency,
        'amount', sum_amount,
        'base_amount', sum_base,
        'count', cnt
      ) order by sum_base desc
    ), '[]'::jsonb) as items
    from (
      select
        currency,
        sum(amount)::numeric(14,2) as sum_amount,
        sum(base_amount)::numeric(14,2) as sum_base,
        count(*)::int as cnt
      from period_payments
      group by currency
    ) c
  ),
  by_meth as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'method', method,
        'base_amount', sum_base,
        'count', cnt
      ) order by sum_base desc
    ), '[]'::jsonb) as items
    from (
      select
        method,
        sum(base_amount)::numeric(14,2) as sum_base,
        count(*)::int as cnt
      from period_payments
      group by method
    ) m
  )
  select jsonb_build_object(
    'total_base', totals.total_base,
    'count', totals.total_count,
    'by_currency', by_cur.items,
    'by_method', by_meth.items
  )
  into v_result
  from totals, by_cur, by_meth;

  return v_result;
end;
$$;

revoke execute on function public.get_caja_summary(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.get_caja_summary(uuid, timestamptz, timestamptz) to authenticated;


-- ----------------------------------------------------------------------------
-- 7. COMPROBACIÓN FINAL DE SEGURIDAD
-- ----------------------------------------------------------------------------
-- Debe devolver 0 filas (ninguna tabla pública sin RLS activado):
select tablename
from pg_tables
where schemaname = 'public' and not rowsecurity;
