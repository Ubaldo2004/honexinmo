-- Guardamos el message_id que devuelve Telegram al enviar un mensaje del bot.
-- Permite EDITAR ese mismo mensaje después (editMessageText) cuando el bot erra.
alter table mensajes add column if not exists canal_msg_id bigint;
