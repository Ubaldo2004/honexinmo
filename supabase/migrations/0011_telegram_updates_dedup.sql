-- Idempotencia del webhook de Telegram. Telegram REENVÍA el mismo update si nuestro 200
-- no le llega (hipo de red) o por reintentos propios. Sin dedupe, el mismo mensaje se
-- procesa dos veces → lead duplicado, doble respuesta del bot, doble costo de LLM.
--
-- Cada update de Telegram trae un `update_id` único e incremental. Lo registramos ANTES
-- de procesar: si ya está, es un duplicado y lo salteamos. La PK hace el dedupe atómico
-- (dos updates simultáneos: uno inserta, el otro choca con la PK y se descarta).
--
-- Tabla global (NO scopeada por tenant): el update_id es único a nivel del bot, y llega
-- antes de resolver la inmobiliaria. Sólo la escribe el bot con la service key.
create table if not exists telegram_updates (
  update_id   bigint primary key,
  recibido_at timestamptz not null default now()
);

-- RLS sin políticas → ningún usuario del panel la toca; la service key (bot) la bypassa.
alter table telegram_updates enable row level security;

-- Para el cleanup futuro (no acumular para siempre): borrar registros viejos por fecha.
create index if not exists telegram_updates_recibido_idx on telegram_updates (recibido_at);
