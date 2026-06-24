"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

// Agrega un rango de hora libre (día + desde/hasta) a la agenda de un vendedor.
// Un no-admin solo puede tocar su propia agenda; el admin, la de cualquiera del tenant.
export async function agregarRango(
  usuarioId: string,
  dia: string,
  horaInicio: string,
  horaFin: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx?.inmobiliariaId) return { ok: false, error: "Sin sesión / inmobiliaria" };
  const esAdmin = ctx.rol === "administrador" || ctx.rol === "super_admin";
  if (!esAdmin && usuarioId !== ctx.userId) return { ok: false, error: "Solo podés editar tu propia agenda" };
  if (!dia || !horaInicio || !horaFin) return { ok: false, error: "Faltan datos" };
  if (horaFin <= horaInicio) return { ok: false, error: "El 'hasta' tiene que ser mayor que el 'desde'" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("disponibilidad_agente")
    .insert({ inmobiliaria_id: ctx.inmobiliariaId, usuario_id: usuarioId, dia, hora_inicio: horaInicio, hora_fin: horaFin })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo agregar" };
  return { ok: true, id: data.id as string };
}

// Quita un rango por id. Un no-admin solo puede borrar rangos propios.
export async function quitarRango(id: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx?.inmobiliariaId) return { ok: false, error: "Sin sesión / inmobiliaria" };
  const esAdmin = ctx.rol === "administrador" || ctx.rol === "super_admin";

  const supabase = await createClient();
  let q = supabase.from("disponibilidad_agente").delete().eq("id", id);
  if (!esAdmin) q = q.eq("usuario_id", ctx.userId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
