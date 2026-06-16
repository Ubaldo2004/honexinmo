"use server";

import { createClient } from "@/lib/supabase/server";

// Edita campos del lead. RLS: sólo pasa si el lead es del tenant del usuario.
export async function actualizarLead(
  id: string,
  patch: {
    nombre?: string;
    telefono?: string;
    etapa?: string;
    score?: number;
    ancla?: string;
    asignado_label?: string;
  }
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "sin id" };

  const upd: Record<string, unknown> = {};
  if (patch.nombre !== undefined) upd.nombre = patch.nombre;
  if (patch.telefono !== undefined) upd.telefono = patch.telefono;
  if (patch.etapa !== undefined) upd.etapa = patch.etapa;
  if (patch.score !== undefined) upd.score = patch.score;
  if (patch.ancla !== undefined) upd.ancla = patch.ancla;
  if (patch.asignado_label !== undefined) upd.asignado_label = patch.asignado_label;
  if (Object.keys(upd).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("leads").update(upd).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Elimina el lead y lo que cuelga de él (conversación + mensajes). Las búsquedas/
// matches/visitas que lo referencian quedan con lead_id = null (trazabilidad).
export async function eliminarLead(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "sin id" };
  const supabase = await createClient();

  const { data: convs } = await supabase.from("conversaciones").select("id").eq("lead_id", id);
  const convIds = (convs ?? []).map((c) => c.id as string);
  if (convIds.length) {
    await supabase.from("mensajes").delete().in("conversacion_id", convIds);
    await supabase.from("conversaciones").delete().eq("lead_id", id);
  }

  // desligar referencias opcionales (no romper trazabilidad histórica)
  await supabase.from("busquedas").update({ lead_id: null }).eq("lead_id", id);
  await supabase.from("matches").update({ lead_id: null }).eq("lead_id", id);
  await supabase.from("visitas").update({ lead_id: null }).eq("lead_id", id);

  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
