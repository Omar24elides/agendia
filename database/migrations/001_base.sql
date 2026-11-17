-- CRM multiempresa para Supabase (Postgres). Ejecutar completo en SQL Editor.
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ========== EMPRESAS Y USUARIOS ==========
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  currency text not null default 'EUR',
  timezone text not null default 'America/Caracas',
  loyalty_target int not null default 6,          -- sesiones para el regalo
  settings jsonb not null default '{}',           -- greeting, telegram_chat_id, reward_options...
  wa_phone_number_id text unique,                 -- ID del número en WhatsApp Cloud API
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table members (
  tenant_id uuid references tenants on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'staff' check (role in ('owner','staff')),
  primary key (tenant_id, user_id)
);

create or replace function is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where tenant_id = t and user_id = auth.uid())
$$;

-- Alta de una empresa nueva: el usuario que la crea queda como dueño.
create or replace function create_tenant(p_name text, p_slug text, p_currency text default 'EUR')
returns uuid language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  insert into tenants(name, slug, currency) values (p_name, p_slug, p_currency) returning id into tid;
  insert into members(tenant_id, user_id, role) values (tid, auth.uid(), 'owner');
  return tid;
end $$;

-- ========== DATOS DEL NEGOCIO ==========
create table clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  name text, phone text not null, zone text, source text,
  tags text[] not null default '{}',
  marketing_consent boolean not null default false,
  loyalty_stamps int not null default 0,
  notes text,
  custom jsonb not null default '{}',             -- campos personalizados por empresa
  created_at timestamptz not null default now(),
  unique (tenant_id, phone)
);

create table custom_fields (                       -- define qué campos extra ve cada empresa
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  entity text not null default 'client',
  key text not null, label text not null,
  type text not null default 'text' check (type in ('text','number','date','bool','select')),
  options text[] default '{}',
  unique (tenant_id, entity, key)
);

create table services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  category text not null,                          -- alimenta el menú del bot
  name text not null, description text,
  price numeric(10,2) not null,
  kind text not null default 'service' check (kind in ('service','package','combo')),
  sessions int not null default 1,                 -- sesiones que incluye
  validity_days int,                               -- vigencia del paquete
  location text not null default 'any' check (location in ('home','studio','any')),
  requires_authorization boolean not null default false,
  sort int not null default 0,
  active boolean not null default true
);

create table client_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  client_id uuid not null references clients on delete cascade,
  service_id uuid references services,
  sessions_total int not null,
  sessions_used int not null default 0,
  price_paid numeric(10,2),
  purchased_at date not null default current_date,
  expires_at date
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  client_id uuid not null references clients on delete cascade,
  service_id uuid references services,
  client_package_id uuid references client_packages,
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','completed','cancelled','no_show')),
  location text default 'home', zone text,
  source text default 'manual', notes text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- evita doble reserva (negocio de una sola profesional; quitar si hay varias)
  exclude using gist (tenant_id with =, tstzrange(starts_at, ends_at) with &&)
    where (status in ('pending','confirmed'))
);

create table blocks (                              -- "Ocupada / No disponible"
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null,
  reason text default 'Ocupada'
);

-- ========== BOT ==========
create table bot_state (
  tenant_id uuid not null references tenants on delete cascade,
  phone text not null,
  step text not null default 'menu',
  human_handoff boolean not null default false,    -- true = el bot se pausa
  updated_at timestamptz not null default now(),
  primary key (tenant_id, phone)
);

create table messages (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references tenants on delete cascade,
  client_id uuid references clients on delete set null,
  direction text not null check (direction in ('in','out')),
  body text, wa_message_id text,
  created_at timestamptz not null default now()
);

-- ========== AUTOMATIZACIÓN: al completar una cita ==========
create or replace function on_appointment_completed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update clients set loyalty_stamps = loyalty_stamps + 1 where id = new.client_id;
    if new.client_package_id is not null then
      update client_packages set sessions_used = sessions_used + 1
      where id = new.client_package_id and sessions_used < sessions_total;
    end if;
  end if;
  return new;
end $$;
create trigger trg_appt_completed after update on appointments
  for each row execute function on_appointment_completed();

-- ========== SEGURIDAD (RLS): cada empresa ve solo lo suyo ==========
alter table tenants enable row level security;
alter table members enable row level security;
create policy tenants_read on tenants for select using (is_member(id));
create policy tenants_update on tenants for update using (
  exists (select 1 from members m where m.tenant_id = id and m.user_id = auth.uid() and m.role = 'owner'));
create policy members_read on members for select using (is_member(tenant_id));

do $$ declare t text; begin
  foreach t in array array['clients','custom_fields','services','client_packages',
                           'appointments','blocks','bot_state','messages'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy tenant_isolation on %I for all
                    using (is_member(tenant_id)) with check (is_member(tenant_id))', t);
    execute format('create index on %I (tenant_id)', t);
  end loop;
end $$;
create index on appointments (tenant_id, starts_at);

-- ========== PLANTILLA INICIAL: YESMIN SPA ==========
-- Uso: select seed_yesmin('<id-de-la-empresa>');
create or replace function seed_yesmin(t uuid) returns void language sql as $$
  update tenants set loyalty_target = 6, currency = 'EUR',
    settings = '{"greeting":"¡Hola! 👋 Bienvenid@ a Yesmin Spa 💛 Esteticista corporal a domicilio en Caracas y Los Valles del Tuy."}'
    where id = t;
  insert into services (tenant_id, category, name, description, price, kind, sessions, validity_days, location, requires_authorization, sort) values
  (t,'Masajes','Masaje deportivo','Descarga tensión muscular y ayuda a recuperarte del ejercicio.',40,'service',1,null,'home',false,1),
  (t,'Drenaje y maderoterapia','Paquete 8 sesiones: masaje reductor, drenaje linfático, maderoterapia y aparatología','Resultados variables según cada persona.',150,'package',8,180,'home',false,2),
  (t,'Drenaje y maderoterapia','Paquete 5 sesiones de drenaje linfático','Ayuda a aliviar la sensación de pesadez e hinchazón.',90,'package',5,180,'home',false,3),
  (t,'Tratamientos faciales','Limpieza facial tensora con esperma de salmón y ácido hialurónico','Hidrata, revitaliza y deja la piel más firme.',35,'service',1,null,'home',false,4),
  (t,'Tratamientos faciales','Paquete 5 sesiones de radiofrecuencia facial con silicio orgánico','Mejora la firmeza de la piel.',45,'package',5,180,'home',false,5),
  (t,'Drenaje post-operatorio','Paquete 10 sesiones de drenaje post-operatorio','Requiere autorización previa de tu cirujano.',250,'package',10,90,'home',true,6),
  (t,'Combos y paquetes','Paquete 5 sesiones de terapia del dolor','Ultrasonido, corriente galvánica y lápiz de acupuntura. No sustituye valoración médica.',100,'package',5,180,'home',false,7),
  (t,'Combos y paquetes','Combo Primera vez (limpieza facial + masaje deportivo)',null,65,'combo',2,180,'home',false,8),
  (t,'Combos y paquetes','Combo Rostro completo (limpieza facial + radiofrecuencia)',null,70,'combo',6,180,'home',false,9),
  (t,'Combos y paquetes','Combo Reductor + facial',null,165,'combo',9,180,'home',false,10),
  (t,'Combos y paquetes','Combo Reductor total',null,215,'combo',13,180,'home',false,11),
  (t,'Combos y paquetes','Combo Cuerpo y rostro',null,205,'combo',14,180,'home',false,12),
  (t,'Combos y paquetes','Combo Alivio muscular (terapia del dolor + masaje deportivo)',null,125,'combo',6,180,'home',false,13),
  (t,'Combos y paquetes','Combo Recuperación completa (post-operatorio + limpieza facial)','Requiere autorización de tu cirujano.',270,'combo',11,90,'home',true,14);
  insert into custom_fields (tenant_id, key, label, type) values
  (t,'autorizacion_medica','Autorización médica','bool'),
  (t,'cirujano','Cirujano / médico','text');
$$;
