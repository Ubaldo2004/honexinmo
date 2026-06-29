"use server";

import { createClient } from "@/lib/supabase/server";

// Piso de score por etapa (mismo embudo que el bot, ver bumpScore en api/telegram/route.ts).
// Mover la etapa a mano desde el panel sube el score al piso de esa etapa. El 100 = Operación
// (venta cerrada / seña). Sólo SUBE: no baja un score ya alcanzado ni pisa un ajuste manual.
const SCORE_POR_ETAPA: Record<string, number> = {
  Calificación: 15,
  Búsqueda: 35,
  Visita: 85,
  Seguimiento: 90,
  Operación: 100,
};

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

  // Si cambia la etapa y NO se mandó un score explícito, llevamos el score al piso de
  // esa etapa (sólo si sube). Así marcar "Operación" pone 100 sin tener que tocar el score.
  if (patch.etapa !== undefined && patch.score === undefined) {
    const piso = SCORE_POR_ETAPA[patch.etapa];
    if (piso !== undefined) {
      const { data: cur } = await supabase.from("leads").select("score").eq("id", id).maybeSingle();
      const actual = typeof cur?.score === "number" ? (cur.score as number) : 0;
      if (piso > actual) upd.score = piso;
    }
  }

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
