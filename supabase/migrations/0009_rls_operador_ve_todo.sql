-- Roles que pueden VER leads/conversaciones:
--   super_admin / administrador / OPERADOR → todo el tenant (el operador monitorea y toma
--     los chats/leads entrantes, aunque no estén asignados a él).
--   AGENTE DE VISITAS → solo lo asignado a él (recién aparece cuando se le asigna).

drop policy if exists leads_select on leads;
create policy leads_select on leads for select using (
  is_super_admin() or (
    inmobiliaria_id = auth_inmobiliaria_id() and (
      auth_rol() in ('administrador','operador') or
      (auth_rol() = 'agente_visitas' and asignado_a = auth.uid())
    )
  )
);

drop policy if exists conv_select on conversaciones;
create policy conv_select on conversaciones for select using (
  is_super_admin() or (
    inmobiliaria_id = auth_inmobiliaria_id() and (
      auth_rol() in ('administrador','operador') or
      (auth_rol() = 'agente_visitas' and asignado_a = auth.uid())
    )
  )
);
