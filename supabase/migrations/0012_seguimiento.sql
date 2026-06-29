-- Seguimiento: fecha real de la visita + flags de qué aviso ya se mandó + marca de "basura".
-- Habilita: recordatorios (1 día / 2 horas antes), seguimiento post-visita automático, y el
-- descarte de leads que no avanzaron (los cerrados nunca se tocan).

-- Fecha/hora concreta de la visita (la que acuerda el bot con el cliente). Nullable: si el
-- cliente dio algo vago ("martes a la tarde") puede quedar sin hora fina → se ajusta en el panel.
alter table visitas add column if not exists fecha_visita timestamptz;

-- Cuándo se mandó cada aviso (null = todavía no). Evita repetir el mismo recordatorio.
-- Dos avisos: uno el día ANTES, y otro el MISMO DÍA a la mañana (8hs).
alter table visitas add column if not exists recordatorio_1d_at  timestamptz;
alter table visitas add column if not exists recordatorio_dia_at timestamptz;

-- Cuándo se mandó el seguimiento post-visita (análisis → mensaje al cliente). Null = pendiente.
alter table visitas add column if not exists seguimiento_at timestamptz;

-- Marca de "basura": lead que no avanzó y se puede descartar. La pone el sistema por reglas
-- (lead en Seguimiento, sin respuesta hace N días, prob baja, no en Operación, sin visita futura).
-- El operador decide borrarlo (hard delete). Los cerrados (Operación) NUNCA se marcan basura.
alter table leads add column if not exists basura boolean not null default false;
alter table leads add column if not exists basura_at timestamptz;

-- Para el cron: encontrar rápido las visitas próximas que faltan avisar.
create index if not exists visitas_fecha_visita_idx on visitas (fecha_visita)
  where fecha_visita is not null;
