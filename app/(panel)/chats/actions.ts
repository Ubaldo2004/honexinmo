"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

// Crea un lead + su conversación (vacía) en el tenant del usuario. Para testear el flujo.
export async function crearChat(
  nombre: string
): Promise<{ ok: boolean; conv?: { id: string; nombre: string }; error?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, error: "Sin sesión" };
  if (!ctx.inmobiliariaId)
    return { ok: false, error: "El Super Admin no crea chats. Entrá como admin de una inmobiliaria." };

  const supabase = await createClient();
  const nom = nombre.trim() || "Nuevo lead";

  const { data: lead, error: e1 } = await supabase
    .from("leads")
    .insert({
      inmobiliaria_id: ctx.inmobiliariaId,
      nombre: nom,
      etapa: "Calificación",
      score: 0,
      canal: "panel",
      asignado_label: "bot",
    })
    .select("id")
    .single();
  if (e1 || !lead) return { ok: false, error: e1?.message ?? "no se pudo crear el lead" };

  const { data: conv, error: e2 } = await supabase
    .from("conversaciones")
    .insert({
      inmobiliaria_id: ctx.inmobiliariaId,
      lead_id: lead.id,
      estado: "bot",
      asignado_label: "bot",
      unread: 0,
      ultimo_mensaje: "",
      ultimo_label: "",
    })
    .select("id")
    .single();
  if (e2 || !conv) return { ok: false, error: e2?.message ?? "no se pudo crear la conversación" };

  return { ok: true, conv: { id: conv.id as string, nombre: nom } };
}

// Asigna la conversación (y su lead) a un vendedor. MVP: por label.
// El bot sigue activo (estado queda como está) y leyendo el hilo para mantener
// contexto; sólo marcamos a qué vendedor se le derivó el lead.
export async function asignarVendedor(
  conversacionId: string,
  vendedor: string
): Promise<{ ok: boolean; error?: string }> {
  const v = vendedor.trim();
  if (!v) return { ok: false, error: "vendedor vacío" };

  const supabase = await createClient();

  const { data: conv, error: e1 } = await supabase
    .from("conversaciones")
    .select("id, lead_id, inmobiliaria_id")
    .eq("id", conversacionId)
    .maybeSingle();
  if (e1 || !conv) return { ok: false, error: e1?.message ?? "conversación no encontrada" };

  // Resolver el usuario vendedor por nombre dentro del tenant → su uuid es lo que
  // habilita la RLS del operador (asignado_a = auth.uid()). Sin esto no ve nada.
  const { data: u } = await supabase
    .from("usuarios")
    .select("id")
    .eq("nombre", v)
    .eq("inmobiliaria_id", conv.inmobiliaria_id)
    .maybeSingle();
  const asignadoA = (u?.id as string) ?? null;

  const { error: e2 } = await supabase
    .from("conversaciones")
    .update({ asignado_a: asignadoA, asignado_label: v, estado: "visita", reason: `Derivado a ${v}` })
    .eq("id", conversacionId);
  if (e2) return { ok: false, error: e2.message };

  if (conv.lead_id) {
    await supabase.from("leads").update({ asignado_a: asignadoA, asignado_label: v }).eq("id", conv.lead_id);
  }

  return { ok: true };
}

// Inserta un mensaje saliente (lo escribe el operador) en la conversación.
// RLS: el insert sólo pasa si la conversación es del tenant del usuario (o super admin).
export async function enviarMensaje(
  conversacionId: string,
  texto: string,
  tsLabel: string
): Promise<{ ok: boolean; error?: string }> {
  const t = texto.trim();
  if (!t) return { ok: false, error: "vacío" };

  const supabase = await createClient();

  // necesitamos el inmobiliaria_id de la conversación para el insert (NOT NULL + RLS check)
  const { data: conv, error: e1 } = await supabase
    .from("conversaciones")
    .select("inmobiliaria_id")
    .eq("id", conversacionId)
    .maybeSingle();
  if (e1 || !conv) return { ok: false, error: e1?.message ?? "conversación no encontrada" };

  const { error } = await supabase.from("mensajes").insert({
    inmobiliaria_id: conv.inmobiliaria_id,
    conversacion_id: conversacionId,
    who: "bot",
    agent: "Operador",
    texto: t,
    ts_label: tsLabel,
  });
  if (error) return { ok: false, error: error.message };

  // también dejamos la conversación con el último mensaje visible
  await supabase
    .from("conversaciones")
    .update({ ultimo_mensaje: t, ultimo_label: tsLabel })
    .eq("id", conversacionId);

  return { ok: true };
}
