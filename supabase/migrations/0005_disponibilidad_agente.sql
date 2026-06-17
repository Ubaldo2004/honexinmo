-- Agenda de vendedores: en qué días/franjas está libre cada uno para hacer visitas.
-- Una fila por slot disponible. Se cruza con leads.disponibilidad para asignar el recorrido.
create table if not exists disponibilidad_agente (
  id              uuid primary key default gen_random_uuid(),
  inmobiliaria_id uuid not null references inmobiliarias(id) on delete cascade,
  usuario_id      uuid not null references usuarios(id) on delete cascade,
  dia             text not null,   -- lunes, martes, ... domingo
  franja          text not null,   -- mañana, tarde
  unique (usuario_id, dia, franja)
);

alter table disponibilidad_agente enable row level security;

-- Misma capa que el resto: aislado por tenant (super admin ve todo).
create policy disp_agente_all on disponibilidad_agente for all
  using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id())
  with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
