-- ETAPAS 1-3 · Ejecutar UNA SOLA VEZ en SQL Editor (después de schema.sql y security.sql).
-- Si dice "already exists", esa parte ya estaba aplicada.

-- ===== ETAPA 1: servicios editables y validación en el servidor =====
-- La validación del navegador es comodidad; esta es la que protege de verdad.
alter table services add column if not exists duration_min int not null default 60;
alter table services add constraint services_dur check (duration_min between 5 and 480);
alter table services add constraint services_price_max check (price <= 100000);
alter table services add constraint services_sessions_max check (sessions <= 365);
alter table services add constraint services_validity check (validity_days is null or validity_days between 1 and 1095);
alter table services add constraint services_text check (
  char_length(name) between 2 and 120 and char_length(category) between 2 and 60
  and char_length(coalesce(description, '')) <= 300
  and name !~ '[<>]' and category !~ '[<>]' and coalesce(description, '') !~ '[<>]');
alter table appointments add constraint appt_zone check (char_length(coalesce(zone, '')) <= 120 and coalesce(zone, '') !~ '[<>]');
alter table clients add constraint clients_text check (coalesce(name, '') !~ '[<>]' and coalesce(zone, '') !~ '[<>]' and coalesce(notes, '') !~ '[<>]');

-- ===== ETAPA 3: pagos (moneda, método, tasa del día) =====
create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  client_id uuid references clients on delete set null,
  client_package_id uuid references client_packages on delete set null,
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),      -- monto en la moneda pagada
  currency text not null check (currency in ('EUR','USD','VES')),
  rate numeric(14,4) not null default 1 check (rate > 0),                         -- unidades de esa moneda por 1 moneda base
  base_amount numeric(12,2) not null check (base_amount > 0),                     -- equivalente en la moneda base de la empresa
  method text not null check (method in ('efectivo','zelle','pago_movil','transferencia','tarjeta','otro')),
  note text check (char_length(coalesce(note, '')) <= 200 and coalesce(note, '') !~ '[<>]'),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table payments enable row level security;
create policy tenant_isolation on payments for all using (is_member(tenant_id)) with check (is_member(tenant_id));
create index on payments (tenant_id, paid_at);
-- Sin permiso de editar: un pago equivocado se anula y se registra de nuevo (queda trazabilidad).
grant select, insert, delete on payments to authenticated;

-- Comprobación: debe devolver 0 filas (ninguna tabla sin RLS)
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
