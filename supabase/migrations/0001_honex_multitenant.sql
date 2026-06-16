-- =====================================================================
-- HONEX — Esquema multi-tenant (MVP)
-- Correr UNA vez, en un proyecto LIMPIO: Supabase → SQL Editor → pegar → Run.
-- No contiene secretos. Crea tablas + helpers + RLS de doble capa (tenant + rol).
-- =====================================================================

-- ---------- Reset (re-ejecutable: limpia restos de corridas previas) ----------
drop table if exists operaciones, visitas, anclas, matches, busquedas,
  propiedades, mensajes, conversaciones, leads, usuarios, inmobiliarias cascade;
drop function if exists auth_rol(), auth_inmobiliaria_id(), is_super_admin() cascade;
drop type if exists rol_usuario, estado_conversacion, prioridad, estado_propiedad cascade;

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type rol_usuario        as enum ('super_admin','administrador','operador','agente_visitas');
create type estado_conversacion as enum ('bot','visita','handoff','seguimiento','operacion');
create type prioridad          as enum ('critical','high','medium','low');
create type estado_propiedad    as enum ('disponible','reservado','vendido');

-- ---------- Tenant ----------
create table inmobiliarias (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  slug      text unique not null,
  creada_at timestamptz not null default now()
);

-- ---------- Usuarios (perfil; 1:1 con auth.users) ----------
create table usuarios (
  id              uuid primary key references auth.users(id) on delete cascade,
  inmobiliaria_id uuid references inmobiliarias(id) on delete cascade,
  nombre          text not null,
  rol             rol_usuario not null,
  creado_at       timestamptz not null default now(),
  -- super_admin no pertenece a ninguna inmobiliaria; el resto sí.
  constraint chk_tenant_por_rol check (
    (rol = 'super_admin' and inmobiliaria_id is null) or
    (rol <> 'super_admin' and inmobiliaria_id is not null)
  )
);

-- ---------- Helpers de contexto (SECURITY DEFINER) ----------
-- Resuelven el rol / tenant del usuario logueado leyendo `usuarios`.
-- SECURITY DEFINER => bypassean RLS (evita recursión); search_path fijo por seguridad.
create or replace function auth_rol() returns rol_usuario
  language sql stable security definer set search_path = public as $$
  select rol from usuarios where id = auth.uid()
$$;

create or replace function auth_inmobiliaria_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select inmobiliaria_id from usuarios where id = auth.uid()
$$;

create or replace function is_super_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select rol = 'super_admin' from usuarios where id = auth.uid()), false)
$$;

-- ---------- Tablas de negocio (todas con inmobiliaria_id) ----------
create table leads (
  id               uuid primary key default gen_random_uuid(),
  inmobiliaria_id  uuid not null references inmobiliarias(id) on delete cascade,
  nombre           text not null,
  telefono         text,
  canal            text not null default 'telegram',
  canal_user_id    text,
  etapa            text not null default 'Calificación',
  score            int  not null default 0,
  ancla            text,
  origen           text,
  asignado_a       uuid references usuarios(id),   -- null = bot
  asignado_label   text,                           -- etiqueta visible ('bot', 'Calandria'...)
  mood             text,
  creado_at        timestamptz not null default now(),
  ultima_actividad text
);

create table conversaciones (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  lead_id         uuid not null references leads(id) on delete cascade,
  estado          estado_conversacion not null default 'bot',
  reason          text,
  priority        prioridad,
  asignado_a      uuid references usuarios(id),
  asignado_label  text,
  unread          int  not null default 0,
  ultimo_mensaje  text,
  ultimo_label    text   -- hora visible ('14:32')
);

create table mensajes (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  who             text not null,        -- 'in' | 'bot'
  agent           text,                 -- 'Orquestador' | 'Motor de búsqueda' | null
  texto           text not null,
  card            text,                 -- 'ficha' | 'resultados' | null
  system          boolean not null default false,
  ts_label        text,                 -- hora visible
  enviado_at      timestamptz not null default now()
);

create table propiedades (
  id               uuid primary key default gen_random_uuid(),
  inmobiliaria_id  uuid not null references inmobiliarias(id) on delete cascade,
  tokko_property_id text not null,
  estado           estado_propiedad not null default 'disponible',
  operacion        text,
  tipo             text,
  titulo           text,
  descripcion      text,
  precio           numeric,
  moneda           text default 'USD',
  zona             text,
  direccion_aprox  text,
  m2               int,
  ambientes        int,
  dormitorios      int,
  amenities        jsonb,
  fotos            text[],
  tokko_url        text,
  last_synced_at   timestamptz default now(),
  unique (inmobiliaria_id, tokko_property_id)
);

create table busquedas (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  lead_id         uuid references leads(id) on delete set null,
  lead_label      text,
  criterios       text,
  ancla           text,
  fuentes         text,
  resultados      int not null default 0,
  hora_label      text,
  creada_at       timestamptz not null default now()
);

create table matches (
  id               uuid primary key default gen_random_uuid(),
  inmobiliaria_id  uuid not null references inmobiliarias(id) on delete cascade,
  lead_id          uuid references leads(id) on delete set null,
  busqueda_id      uuid references busquedas(id) on delete set null,
  tokko_property_id text not null,    -- snapshot: qué se mostró (INMUTABLE)
  match_score      int,
  posicion_ranking int,
  precio_mostrado  numeric,
  moneda           text default 'USD',
  mostrado_at      timestamptz not null default now()
);

create table anclas (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  tipo            text not null,
  prop            text not null,
  precio          text,
  variante        text,                 -- variante de ADS (trazabilidad)
  leads           int  not null default 0,
  visitas         int  not null default 0,
  web             boolean not null default false,
  tokko           boolean not null default false,
  estado          text not null default 'testeando'
);

create table visitas (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  lead_id         uuid references leads(id) on delete set null,
  lead_label      text,
  prop            text,
  agente          text,
  fecha           text,
  transcripto     boolean not null default false,
  analisis        jsonb
);

create table operaciones (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  prop            text,
  cliente         text,
  colega          text,
  monto           text,
  comision        text,
  split           text,
  estado          text
);

-- =====================================================================
-- RLS — doble capa: (a) aislamiento por tenant  (b) rol dentro del tenant
-- =====================================================================
alter table inmobiliarias  enable row level security;
alter table usuarios       enable row level security;
alter table leads          enable row level security;
alter table conversaciones enable row level security;
alter table mensajes       enable row level security;
alter table propiedades    enable row level security;
alter table busquedas      enable row level security;
alter table matches        enable row level security;
alter table anclas         enable row level security;
alter table visitas        enable row level security;
alter table operaciones    enable row level security;

-- inmobiliarias: ve la suya (o todas si super admin); escribe solo super admin.
create policy inmob_select on inmobiliarias for select
  using (is_super_admin() or id = auth_inmobiliaria_id());
create policy inmob_write on inmobiliarias for all
  using (is_super_admin()) with check (is_super_admin());

-- usuarios: cada uno se ve a sí mismo; admin ve los de su tenant; super admin todos.
create policy usuarios_select on usuarios for select
  using (id = auth.uid() or is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy usuarios_write on usuarios for all
  using (is_super_admin() or (auth_rol() = 'administrador' and inmobiliaria_id = auth_inmobiliaria_id()))
  with check (is_super_admin() or (auth_rol() = 'administrador' and inmobiliaria_id = auth_inmobiliaria_id()));

-- leads: tenant + (operador solo los suyos asignados).
create policy leads_select on leads for select using (
  is_super_admin() or (
    inmobiliaria_id = auth_inmobiliaria_id() and (
      auth_rol() in ('administrador','agente_visitas') or
      (auth_rol() = 'operador' and asignado_a = auth.uid())
    )
  )
);
-- Escritura separada por comando (NO `for all`: eso habilitaría SELECT y pisaría
-- la restricción del operador de arriba).
create policy leads_insert on leads for insert with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy leads_update on leads for update using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id()) with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy leads_delete on leads for delete using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());

-- conversaciones: igual que leads (operador solo las asignadas a él).
create policy conv_select on conversaciones for select using (
  is_super_admin() or (
    inmobiliaria_id = auth_inmobiliaria_id() and (
      auth_rol() in ('administrador','agente_visitas') or
      (auth_rol() = 'operador' and asignado_a = auth.uid())
    )
  )
);
create policy conv_insert on conversaciones for insert with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy conv_update on conversaciones for update using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id()) with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy conv_delete on conversaciones for delete using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());

-- resto de tablas de negocio: aislamiento por tenant (lectura/escritura dentro del tenant).
create policy mensajes_all on mensajes for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy propiedades_all on propiedades for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy busquedas_all on busquedas for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy matches_all on matches for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy anclas_all on anclas for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy visitas_all on visitas for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy operaciones_all on operaciones for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());

-- ---------- Grants (RLS sigue filtrando fila por fila) ----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
