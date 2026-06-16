// Webhook de Telegram (serverless, 24/7 en Vercel). Reemplaza al poller local
// scripts/telegram-poll.mjs: Telegram pega acá en cada mensaje. Ingiere el lead +
// conversación + mensaje, y el bot responde con Gemini (califica, busca, asigna).
//
// Responde 200 al instante y procesa en background con after() para no cortar por
// timeout (Telegram reintenta si tardás). Usa la service key → bypassa RLS.

import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const SLUG = process.env.HONEX_TENANT_SLUG || "norte";
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const SEARCH_URL = process.env.N8N_SEARCH_WEBHOOK_URL || "https://n8n.tokko-finder.gachetponzellini.com/webhook/honex/search";
const SEARCH_VENDEDOR = process.env.HONEX_SEARCH_VENDEDOR_ID || "25e94c02-03ee-4272-8003-57f6dcebd36c"; // Ubaldo
const API = `https://api.telegram.org/bot${TOKEN}`;

const db = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

// Tenant resuelto una vez por instancia (las funciones "calientes" lo reutilizan).
let INMO_ID: string | null = null;
let INMO_NOMBRE = "la inmobiliaria";
async function getInmo() {
  if (INMO_ID) return INMO_ID;
  const { data } = await db.from("inmobiliarias").select("id, nombre").eq("slug", SLUG).maybeSingle();
  if (data) { INMO_ID = data.id as string; INMO_NOMBRE = data.nombre as string; }
  return INMO_ID;
}

function horaLabel() {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
}

// ── IA del bot ───────────────────────────────────────────────
function systemPrompt() {
  return `Sos el asistente virtual de ${INMO_NOMBRE}, una inmobiliaria de Rosario. Atendés por chat a compradores que vienen de una campaña.

Tu objetivo es conversar natural y cálido (tuteo rioplatense, mensajes cortos, algún emoji) y CALIFICAR bien al comprador ANTES de buscar. Datos que necesitás juntar:
1) operación (venta o alquiler)
2) tipo (casa, departamento, PH, terreno, local…)
3) zona o ciudad
4) presupuesto (o rango)
5) ambientes o dormitorios

Cómo manejarte:
- Hacé UNA sola pregunta por mensaje. No abrumes.
- Si el comprador da MUY pocos datos (ej: solo "una casa", o solo una zona), NO busques todavía: pedile lo que falta, priorizando presupuesto y ambientes/dormitorios, que son los que más afinan la búsqueda.
- Cuando tengas los 5 datos base, antes de buscar preguntá UNA vez si hay alguna preferencia importante (cochera, a estrenar, baños, balcón, patio, etc.). Si dice que no, o "mostrame lo que haya", buscá igual.
- Cuando ya tengas un panorama razonable, respondé ÚNICAMENTE con una línea con este formato EXACTO, sin nada más:
[BUSCAR: <frase con TODOS los datos: operación, tipo, zona, presupuesto, ambientes/dormitorios y preferencias>]
Ejemplo: [BUSCAR: Casa en venta en Funes, 3 dormitorios, 2 baños, con cochera, hasta 200000 USD]
- Si después de ver resultados el comprador quiere agregar o cambiar detalles, incorporá lo nuevo y volvé a emitir un [BUSCAR: ...] actualizado.

Asignación de vendedor:
- Cuando el comprador quiera AVANZAR con una propiedad (le interesa una, quiere visitarla, o pide hablar con alguien), ofrecele un vendedor que lo atienda: "Te asigno un vendedor para que coordine con vos 🙌 ¿Conocés a alguien de nuestro equipo? Decime el nombre. Si no, te asigno uno yo."
- Cuando el comprador te diga el nombre de un vendedor, o te pida que le asignes uno (o diga que no conoce a ninguno), respondé ÚNICAMENTE con una línea con este formato EXACTO:
[ASIGNAR: <nombre del vendedor; dejalo VACÍO si no sabe y querés que asignemos nosotros>]
Ejemplos: [ASIGNAR: Ubaldo]  ·  si no sabe: [ASIGNAR: ]`;
}

type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

async function llamarGemini(contents: GeminiContent[]) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt() }] }, contents }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("gemini:", JSON.stringify(json).slice(0, 300));
    return "Disculpá, tuve un problemita. ¿Me lo repetís?";
  }
  const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text: string }) => p.text).join("").trim();
  return text || "¿Me contás un poco más qué estás buscando?";
}

type Prop = Record<string, unknown> & { precio?: number | null; moneda?: string; tipo?: string; ubicacion?: string; dormitorios?: number | null; banos?: number | null; sup_cubierta?: number | null };

async function buscarPropiedades(query: string): Promise<Prop[]> {
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendedor_id: SEARCH_VENDEDOR, filtros: query, limit: 5 }),
    });
    const data = await res.json();
    const api = Array.isArray(data?.api?.propiedades) ? data.api.propiedades : [];
    const red = Array.isArray(data?.red?.propiedades) ? data.red.propiedades : [];
    return [...api, ...red].slice(0, 5);
  } catch (e) {
    console.error("buscar:", (e as Error).message);
    return [];
  }
}

function formatearResultados(query: string, props: Prop[]) {
  if (!props.length) {
    return `Busqué "${query}" pero no encontré nada con esos criterios. ¿Ampliamos un poco la zona o el presupuesto?`;
  }
  const lineas = props.map((p, i) => {
    const precio = p.precio != null ? `${p.moneda || "USD"} ${Number(p.precio).toLocaleString("es-AR")}` : "Consultar";
    const det = [
      p.dormitorios ? `${p.dormitorios} dorm` : null,
      p.banos ? `${p.banos} baños` : null,
      p.sup_cubierta ? `${p.sup_cubierta} m²` : null,
    ].filter(Boolean).join(" · ");
    return `${i + 1}. ${p.tipo || "Propiedad"} en ${p.ubicacion || "?"} — ${precio}${det ? ` (${det})` : ""}`;
  });
  return `🔎 Tu búsqueda: ${query}\n\nEncontré estas opciones 👇\n\n${lineas.join("\n")}\n\n¿Te sirve alguna? Si querés afinar (más ambientes, cochera, otra zona u otro presupuesto) decime y busco de nuevo. También puedo coordinar una visita 🙂`;
}

async function enviarTelegram(chatId: number | string, text: string) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function asignarConv(convId: string, leadId: string | null, vendedor: string) {
  // Resolver el uuid del vendedor (tabla usuarios) → habilita la RLS del operador.
  const { data: u } = await db.from("usuarios").select("id").eq("nombre", vendedor).eq("inmobiliaria_id", INMO_ID).maybeSingle();
  const asignadoA = (u?.id as string) ?? null;
  await db.from("conversaciones").update({
    asignado_a: asignadoA, asignado_label: vendedor, estado: "visita", reason: `Derivado a ${vendedor}`,
  }).eq("id", convId);
  if (leadId) {
    await db.from("leads").update({ asignado_a: asignadoA, asignado_label: vendedor, etapa: "Visita" }).eq("id", leadId);
  }
}

async function registrarBusqueda(leadId: string | null, criterios: string, resultados: number) {
  if (!leadId) return;
  const { data: lead } = await db.from("leads").select("nombre, etapa").eq("id", leadId).maybeSingle();
  await db.from("busquedas").insert({
    inmobiliaria_id: INMO_ID, lead_id: leadId, lead_label: lead?.nombre ?? null,
    criterios, fuentes: "Red Tokko", resultados, hora_label: horaLabel(),
  });
  if (lead && lead.etapa === "Calificación") {
    await db.from("leads").update({ etapa: "Búsqueda" }).eq("id", leadId);
  }
}

async function responderBot(convId: string, chatId: number | string) {
  if (!GEMINI_KEY) return;
  const { data: conv } = await db.from("conversaciones").select("estado, lead_id").eq("id", convId).maybeSingle();
  if (!conv || conv.estado !== "bot") return;

  const { data: msgs } = await db
    .from("mensajes").select("who, texto")
    .eq("conversacion_id", convId).order("enviado_at", { ascending: true });

  let contents: GeminiContent[] = (msgs ?? [])
    .filter((m) => m.texto)
    .map((m) => ({ role: (m.who === "in" ? "user" : "model") as "user" | "model", parts: [{ text: m.texto as string }] }));
  const primerUser = contents.findIndex((c) => c.role === "user");
  if (primerUser < 0) return;
  contents = contents.slice(primerUser);

  let reply = await llamarGemini(contents);

  const ma = reply.match(/\[ASIGNAR:\s*([\s\S]*?)\]/i);
  if (ma) {
    let nombre = ma[1].trim();
    if (!nombre || /^(no|vos|uno|cualquiera|el que sea)/i.test(nombre)) nombre = "Ubaldo";
    await asignarConv(convId, (conv.lead_id as string) ?? null, nombre);
    reply = `¡Listo! Te asigné a ${nombre} 🙌 En breve se contacta con vos para coordinar la visita. ¡Gracias por escribirnos!`;
  } else {
    const m = reply.match(/\[BUSCAR:\s*([\s\S]+?)\]/i);
    if (m) {
      const query = m[1].trim();
      const props = await buscarPropiedades(query);
      reply = formatearResultados(query, props);
      await registrarBusqueda((conv.lead_id as string) ?? null, query, props.length);
    }
  }

  await enviarTelegram(chatId, reply);
  const ts = horaLabel();
  await db.from("mensajes").insert({
    inmobiliaria_id: INMO_ID, conversacion_id: convId,
    who: "bot", agent: "bottelegram", texto: reply, ts_label: ts,
  });
  await db.from("conversaciones").update({ ultimo_mensaje: reply.slice(0, 80), ultimo_label: ts }).eq("id", convId);
}

type TgChat = { id: number; title?: string };
type TgFrom = { first_name?: string; last_name?: string; username?: string };
type TgMessage = { chat: TgChat; from?: TgFrom; text?: string; caption?: string };

async function findOrCreateLead(chat: TgChat, from?: TgFrom) {
  const chatId = String(chat.id);
  const { data: ex } = await db.from("leads").select("id")
    .eq("inmobiliaria_id", INMO_ID).eq("canal_user_id", chatId).maybeSingle();
  if (ex) return ex.id as string;
  const nombre = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || chat?.title || "Lead Telegram";
  const { data, error } = await db.from("leads").insert({
    inmobiliaria_id: INMO_ID, nombre, canal: "telegram", canal_user_id: chatId,
    etapa: "Calificación", score: 0, asignado_label: "bottelegram", origen: "Telegram",
  }).select("id").single();
  if (error) throw new Error("crear lead: " + error.message);
  return data.id as string;
}

async function findOrCreateConv(leadId: string) {
  const { data: ex } = await db.from("conversaciones").select("id").eq("lead_id", leadId).maybeSingle();
  if (ex) return ex.id as string;
  const { data, error } = await db.from("conversaciones").insert({
    inmobiliaria_id: INMO_ID, lead_id: leadId, estado: "bot",
    asignado_label: "bottelegram", unread: 0, ultimo_mensaje: "", ultimo_label: "",
  }).select("id").single();
  if (error) throw new Error("crear conv: " + error.message);
  return data.id as string;
}

async function handleMessage(msg: TgMessage) {
  if (!(await getInmo())) { console.error("sin tenant para slug", SLUG); return; }
  const texto = msg.text ?? msg.caption ?? "[mensaje sin texto]";
  const leadId = await findOrCreateLead(msg.chat, msg.from);
  const convId = await findOrCreateConv(leadId);
  const ts = horaLabel();
  await db.from("mensajes").insert({
    inmobiliaria_id: INMO_ID, conversacion_id: convId, who: "in", texto, ts_label: ts,
  });
  const { data: c } = await db.from("conversaciones").select("unread").eq("id", convId).maybeSingle();
  await db.from("conversaciones").update({
    ultimo_mensaje: texto, ultimo_label: ts, unread: ((c?.unread as number) ?? 0) + 1,
  }).eq("id", convId);

  await responderBot(convId, msg.chat.id);
}

export async function POST(req: Request) {
  if (WEBHOOK_SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) return new NextResponse("forbidden", { status: 403 });
  }
  let update: { message?: TgMessage; edited_message?: TgMessage };
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const msg = update?.message ?? update?.edited_message;
  if (msg && msg.chat) {
    after(async () => {
      try { await handleMessage(msg); } catch (e) { console.error("tg handle:", (e as Error).message); }
    });
  }
  return NextResponse.json({ ok: true });
}
