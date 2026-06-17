"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

// Activa/desactiva un slot (día + franja) de la agenda de un vendedor.
// Un no-admin solo puede tocar su propia agenda; el admin, la de cualquiera del tenant.
export async function toggleDisponibilidad(
  usuarioId: string,
  dia: string,
  franja: string,
  activar: boolean
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx?.inmobiliariaId) return { ok: false, error: "Sin sesión / inmobiliaria" };
  const esAdmin = ctx.rol === "administrador" || ctx.rol === "super_admin";
  if (!esAdmin && usuarioId !== ctx.userId) return { ok: false, error: "Solo podés editar tu propia agenda" };

  const supabase = await createClient();
  if (activar) {
    const { error } = await supabase
      .from("disponibilidad_agente")
      .upsert(
        { inmobiliaria_id: ctx.inmobiliariaId, usuario_id: usuarioId, dia, franja },
        { onConflict: "usuario_id,dia,franja" }
      );
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("disponibilidad_agente")
      .delete()
      .eq("usuario_id", usuarioId)
      .eq("dia", dia)
      .eq("franja", franja);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
