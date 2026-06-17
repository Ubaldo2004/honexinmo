-- Cuentas de Tokko por inmobiliaria (varias posibles; el bot usa la marcada `activa`).
-- vendedor_id = el id que el motor de búsqueda (n8n/Tokko) usa para esa cuenta.
create table if not exists cuentas_tokko (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  nombre          text not null,
  vendedor_id     text not null,
  activa          boolean not null default false,
  creada_at       timestamptz not null default now()
);

alter table cuentas_tokko enable row level security;

-- Lectura: el tenant ve las suyas; el super admin, todas (y el bot usa la service key).
create policy cuentas_tokko_select on cuentas_tokko for select
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
-- Escritura: SOLO el super admin (administra las cuentas de todas las inmobiliarias).
create policy cuentas_tokko_modify on cuentas_tokko for all
  using (is_super_admin()) with check (is_super_admin());
