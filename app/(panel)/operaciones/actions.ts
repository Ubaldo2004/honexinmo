"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

type NuevaOperacion = {
  prop: string; cliente: string; colega: string;
  monto: string; comision: string; split: string; estado: string;
};

export async function crearOperacion(o: NuevaOperacion): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx?.inmobiliariaId) return { ok: false, error: "El usuario no pertenece a una inmobiliaria" };
  if (!o.prop.trim() || !o.cliente.trim()) return { ok: false, error: "Propiedad y cliente son obligatorios" };

  const supabase = await createClient();
  const { error } = await supabase.from("operaciones").insert({
    inmobiliaria_id: ctx.inmobiliariaId,
    prop: o.prop.trim(), cliente: o.cliente.trim(), colega: o.colega.trim(),
    monto: o.monto.trim(), comision: o.comision.trim(), split: o.split.trim(),
    estado: o.estado || "Seña",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function cambiarEstadoOperacion(id: string, estado: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("operaciones").update({ estado }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function eliminarOperacion(id: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("operaciones").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
