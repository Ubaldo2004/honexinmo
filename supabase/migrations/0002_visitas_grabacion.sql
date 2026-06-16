-- Visitas: captura de la grabación + transcripto por el agente de visitas (Diego).
-- El audio vive en Storage (bucket privado `visitas-audio`); acá guardamos el path,
-- el texto del transcripto (cuando se procese) y metadatos.
alter table visitas add column if not exists audio_path        text;
alter table visitas add column if not exists transcripto_texto  text;
alter table visitas add column if not exists duracion_seg       integer;
alter table visitas add column if not exists creada_at          timestamptz not null default now();
