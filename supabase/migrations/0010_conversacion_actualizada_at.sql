-- Timestamp de última actividad de la conversación → para ordenar los chats por la última que
-- tuvo movimiento (estilo WhatsApp: la que recibió un mensaje recién sube al tope). Se actualiza
-- solo con un trigger en cada mensaje nuevo, sin tocar código.

alter table conversaciones add column if not exists actualizada_at timestamptz not null default now();

create or replace function touch_conversacion_on_msg() returns trigger as $$
begin
  update conversaciones set actualizada_at = now() where id = new.conversacion_id;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_conv on mensajes;
create trigger trg_touch_conv after insert on mensajes
  for each row execute function touch_conversacion_on_msg();
