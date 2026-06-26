"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getRepository } from "@/lib/data";
import type { MensajeHilo, Conversacion } from "@/lib/data/types";

// Lista las conversaciones del tenant (para refrescar la lista del chat en vivo).
export async function listarConversaciones(): Promise<Conversacion[]> {
  const repo = await getRepository();
  return repo.getConversaciones();
}

// Trae el hilo de una conversación (para refrescar el chat en vivo, sin recargar la página).
export async function getHilo(conversacionId: string): Promise<MensajeHilo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mensajes")
    .select("who, agent, texto, card, system, ts_label")
    .eq("conversacion_id", conversacionId)
    .order("enviado_at", { ascending: true });

  const out: MensajeHilo[] = [];
  for (const m of data ?? []) {
    if (m.card === "resultados_data") continue; // estado interno del bot
    const card = (m.card as string) ?? undefined;
    let fotos: string[] | undefined;
    if (card === "fotos") {
      try {
        const arr = JSON.parse(m.texto as string);
        if (Array.isArray(arr)) fotos = arr.filter((u): u is string => typeof u === "string");
      } catch { /* ignora */ }
    }
    out.push({
      who: m.who as "bot" | "in",
      agent: (m.agent as string) ?? undefined,
      t: card === "fotos" ? "" : (m.texto as string),
      ts: (m.ts_label as string) ?? "",
      card: (card as MensajeHilo["card"]) ?? undefined,
      fotos,
      system: !!m.system,
    });
  }
  return out;
}

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

// Pasa la conversación a un OPERADOR para que la maneje (bot falla o un humano la toma).
// Deja la conversación en estado "handoff" → el bot deja de auto-responder.
export async function asignarOperador(
  conversacionId: string,
  operador: string
): Promise<{ ok: boolean; error?: string }> {
  const v = operador.trim();
  if (!v) return { ok: false, error: "operador vacío" };

  const supabase = await createClient();

  const { data: conv, error: e1 } = await supabase
    .from("conversaciones")
    .select("id, lead_id, inmobiliaria_id")
    .eq("id", conversacionId)
    .maybeSingle();
  if (e1 || !conv) return { ok: false, error: e1?.message ?? "conversación no encontrada" };

  // Resolver el uuid del operador dentro del tenant → habilita su RLS (asignado_a = auth.uid()).
  const { data: u } = await supabase
    .from("usuarios")
    .select("id")
    .eq("nombre", v)
    .eq("inmobiliaria_id", conv.inmobiliaria_id)
    .maybeSingle();
  const asignadoA = (u?.id as string) ?? null;

  const { error: e2 } = await supabase
    .from("conversaciones")
    .update({ asignado_a: asignadoA, asignado_label: v, estado: "handoff", reason: `Tomado por ${v}` })
    .eq("id", conversacionId);
  if (e2) return { ok: false, error: e2.message };

  if (conv.lead_id) {
    await supabase.from("leads").update({ asignado_a: asignadoA, asignado_label: v }).eq("id", conv.lead_id);
  }

  return { ok: true };
}

// Reactiva el bot en una conversación: vuelve a estado "bot" → el bot retoma el
// auto-respondido por Telegram. Limpia el motivo del handoff.
export async function reactivarBot(conversacionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("conversaciones")
    .update({ estado: "bot", reason: null, asignado_a: null, asignado_label: "bot" })
    .eq("id", conversacionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Marca la conversación como leída (unread = 0). Se llama al abrir el chat en el panel.
export async function marcarLeido(conversacionId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("conversaciones").update({ unread: 0 }).eq("id", conversacionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Corrige el último mensaje del bot: lo EDITA en Telegram (editMessageText, así el
// cliente ve el texto corregido en el mismo mensaje) y actualiza el registro del panel.
export async function corregirUltimoMensaje(
  conversacionId: string,
  nuevoTexto: string
): Promise<{ ok: boolean; texto?: string; error?: string }> {
  const t = nuevoTexto.trim();
  if (!t) return { ok: false, error: "vacío" };

  const supabase = await createClient();

  const { data: conv, error: e1 } = await supabase
    .from("conversaciones")
    .select("ultimo_mensaje, leads(canal, canal_user_id)")
    .eq("id", conversacionId)
    .maybeSingle();
  if (e1 || !conv) return { ok: false, error: e1?.message ?? "conversación no encontrada" };

  // último mensaje del bot que se mandó a Telegram (tiene canal_msg_id).
  const { data: msgs } = await supabase
    .from("mensajes")
    .select("id, canal_msg_id, ts_label")
    .eq("conversacion_id", conversacionId)
    .eq("who", "bot")
    .not("canal_msg_id", "is", null)
    .order("enviado_at", { ascending: false })
    .limit(1);
  const last = (msgs ?? [])[0];
  if (!last) return { ok: false, error: "No hay un mensaje del bot para corregir todavía." };

  // editar en Telegram (mismo mensaje que ya vio el cliente).
  const lead = (Array.isArray(conv.leads) ? conv.leads[0] : conv.leads) as
    | { canal?: string; canal_user_id?: string } | null | undefined;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (lead?.canal === "telegram" && lead.canal_user_id && last.canal_msg_id && token) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: lead.canal_user_id, message_id: last.canal_msg_id, text: t }),
      });
    } catch {
      // si Telegram falla, igual dejamos el texto corregido en el panel
    }
  }

  const { error: e2 } = await supabase.from("mensajes").update({ texto: t }).eq("id", last.id);
  if (e2) return { ok: false, error: e2.message };
  await supabase.from("conversaciones").update({ ultimo_mensaje: t.slice(0, 80) }).eq("id", conversacionId);

  return { ok: true, texto: t };
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

  // inmobiliaria_id para el insert + el canal del lead para entregar el mensaje
  const { data: conv, error: e1 } = await supabase
    .from("conversaciones")
    .select("inmobiliaria_id, estado, leads(canal, canal_user_id)")
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

  // dejamos el último mensaje visible y, si la manejaba el bot, marcamos que un
  // humano tomó la conversación → el bot deja de auto-responder por Telegram.
  const convUpd: Record<string, unknown> = { ultimo_mensaje: t, ultimo_label: tsLabel };
  if (conv.estado === "bot") {
    convUpd.estado = "handoff";
    convUpd.reason = "Un humano tomó la conversación";
  }
  await supabase.from("conversaciones").update(convUpd).eq("id", conversacionId);

  // Entregar el mensaje al cliente por su canal (Telegram). Sin esto, lo que
  // escribe el operador queda solo en el panel y el cliente nunca lo recibe.
  const lead = (Array.isArray(conv.leads) ? conv.leads[0] : conv.leads) as
    | { canal?: string; canal_user_id?: string }
    | null
    | undefined;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (lead?.canal === "telegram" && lead.canal_user_id && token) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: lead.canal_user_id, text: t }),
      });
    } catch {
      // si Telegram falla, el mensaje igual quedó guardado en el panel
    }
  }

  return { ok: true };
}
