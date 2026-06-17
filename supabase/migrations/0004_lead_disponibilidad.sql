-- Disponibilidad del cliente para la visita (día/franja), que captura el bot en el chat.
-- Texto normalizado, ej: "martes tarde, jueves mañana". Alimenta el match con el vendedor.
alter table leads add column if not exists disponibilidad text;
