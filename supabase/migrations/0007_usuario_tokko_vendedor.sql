-- ID de Tokko (vendedor_id) por usuario: cada vendedor tiene su cuenta/API key de Tokko.
-- El bot ROTA entre todos los vendedor_id del tenant en cada búsqueda, para no pegarle
-- siempre a la misma cuenta (Tokko se cae) y aguantar varias búsquedas concurrentes.
alter table usuarios add column if not exists tokko_vendedor_id text;
