-- El seguimiento post-visita NO sale al instante: se manda 24 hs DESPUÉS del análisis
-- (cuando el agente sube y procesa el transcripto). Guardamos cuándo se analizó para que
-- el cron mande el seguimiento recién pasadas las 24 hs.
alter table visitas add column if not exists analizada_at timestamptz;
