// Webhook de WhatsApp: downstream de Evolution → Honex. FASE 2, PARQUEADO.
//
// Flujo: Usuario WhatsApp → Meta Cloud API → Evolution → (POST /webhook/set/{instance})
//        → este endpoint (https://<honex>/api/whatsapp).
//
// Estado: INERTE hasta que estén las env (WA_API_KEY + WA_INSTANCE) — o sea, hasta que el
// número esté aprobado en Meta. Telegram sigue andando aparte sin tocar nada.
//
// Cuando se active, este webhook ya: identifica el lead (canal=whatsapp, PK UUID interno,
// nunca el teléfono), crea su conversación y guarda el mensaje entrante → el chat aparece
// en el panel y un humano puede responder.
//
// LO QUE FALTA WIREAR (cuando me digas, lo hacemos juntos):
//   1) Respuesta automática del bot: el núcleo del bot vive hoy en /api/telegram acoplado a
//      Telegram. Hay que extraerlo a un módulo compartido y pasarle el canal (waEnviarTexto/
//      waEnviarFoto en vez de los de Telegram). Ver lib/channel/types.ts (interfaz Channel).
//   2) Respuesta MANUAL desde el panel: hoy chats/actions.ts → enviarMensaje sale por Telegram.
//      Hay que rutear por canal del lead (si es whatsapp → waEnviarTexto).
//   3) Ventana de 24h: los salientes proactivos (seguimientos > 24h) necesitan template aprobado.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseEvolutionInbound, waConfigured } from "@/lib/channel/whatsapp";

export const runtime = "nodejs";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SLUG = process.env.HONEX_INMO_SLUG || "norte";

function horaLabel(): string {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
}

export async function GET() {
  // Evolution maneja el verify de Meta; este endpoint solo recibe el downstream por POST.
  return NextResponse.json({ ok: true, canal: "whatsapp", activo: waConfigured() });
}

export async function POST(req: Request) {
  // Parqueado: si no está configurado, no hacemos nada (200 para que Evolution no reintente).
  if (!waConfigured()) return NextResponse.json({ ok: true, parked: true });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  const msg = parseEvolutionInbound(body);
  if (!msg) return NextResponse.json({ ok: true }); // no es un texto entrante de un usuario

  try {
    // Inmobiliaria por slug (igual que el bot de Telegram).
    const { data: inmo } = await db.from("inmobiliarias").select("id").eq("slug", SLUG).maybeSingle();
    const inmoId = inmo?.id as string | undefined;
    if (!inmoId) return NextResponse.json({ ok: true });

    // Lead por canal + canal_user_id (PK interno UUID; el teléfono va aparte, en E.164).
    const { data: ex } = await db.from("leads").select("id")
      .eq("inmobiliaria_id", inmoId).eq("canal", "whatsapp").eq("canal_user_id", msg.from).maybeSingle();
    let leadId = ex?.id as string | undefined;
    if (!leadId) {
      const { data: nuevo } = await db.from("leads").insert({
        inmobiliaria_id: inmoId, nombre: msg.nombre || `WhatsApp ${msg.from}`,
        canal: "whatsapp", canal_user_id: msg.from, telefono: msg.from,
        etapa: "Calificación", score: 0, asignado_label: "bottelegram", origen: "WhatsApp",
      }).select("id").single();
      leadId = nuevo?.id as string | undefined;
    }
    if (!leadId) return NextResponse.json({ ok: true });

    // Conversación del lead.
    const { data: exc } = await db.from("conversaciones").select("id, unread").eq("lead_id", leadId).maybeSingle();
    let convId = exc?.id as string | undefined;
    if (!convId) {
      const { data: nc } = await db.from("conversaciones").insert({
        inmobiliaria_id: inmoId, lead_id: leadId, estado: "bot",
        asignado_label: "bottelegram", unread: 0, ultimo_mensaje: "", ultimo_label: "",
      }).select("id").single();
      convId = nc?.id as string | undefined;
    }
    if (!convId) return NextResponse.json({ ok: true });

    // Guardar el mensaje entrante → aparece en el panel.
    const ts = horaLabel();
    await db.from("mensajes").insert({
      inmobiliaria_id: inmoId, conversacion_id: convId, who: "in", texto: msg.text, ts_label: ts,
    });
    await db.from("conversaciones").update({
      ultimo_mensaje: msg.text.slice(0, 80), ultimo_label: ts, unread: ((exc?.unread as number) ?? 0) + 1,
    }).eq("id", convId);

    // TODO (wiring pendiente): acá iría la respuesta del bot por WhatsApp.
    // Ver el bloque "LO QUE FALTA WIREAR" arriba.

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("whatsapp webhook:", (e as Error).message);
    return NextResponse.json({ ok: true }); // 200 igual: no queremos que Evolution reintente en loop
  }
}
