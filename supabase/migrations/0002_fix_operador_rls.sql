-- Fix: las policies `for all` de leads/conversaciones también habilitaban SELECT,
-- lo que pisaba la restricción del operador (debe ver solo lo asignado a él).
-- Se reemplazan por policies de escritura por comando (insert/update/delete),
-- dejando el SELECT gobernado únicamente por *_select.

drop policy if exists leads_write on leads;
create policy leads_insert on leads for insert with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy leads_update on leads for update using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id()) with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy leads_delete on leads for delete using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());

drop policy if exists conv_write on conversaciones;
create policy conv_insert on conversaciones for insert with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy conv_update on conversaciones for update using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id()) with check (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
create policy conv_delete on conversaciones for delete using (is_super_admin() or inmobiliaria_id = auth_inmobiliaria_id());
