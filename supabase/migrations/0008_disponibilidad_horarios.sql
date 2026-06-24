-- Agenda de vendedores: pasamos de franjas (mañana/tarde) a RANGOS DE HORA reales.
-- Una fila = un día + un rango horario en que el agente está libre para visitas.
-- Se pueden cargar varios rangos por día. El bot cruza estos rangos con la
-- disponibilidad del cliente (mañana/tarde) para asignar el recorrido.

alter table disponibilidad_agente
  drop constraint if exists disponibilidad_agente_usuario_id_dia_franja_key;

-- Los slots viejos eran por franja (no tienen hora) → los limpiamos para recargar con horarios.
delete from disponibilidad_agente;

alter table disponibilidad_agente drop column if exists franja;
alter table disponibilidad_agente add column if not exists hora_inicio time not null;
alter table disponibilidad_agente add column if not exists hora_fin    time not null;

alter table disponibilidad_agente drop constraint if exists disp_rango_valido;
alter table disponibilidad_agente add constraint disp_rango_valido check (hora_fin > hora_inicio);
