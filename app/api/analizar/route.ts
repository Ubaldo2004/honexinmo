// El "Analista": lee el transcripto de una visita y saca si le gustó/no, objeciones,
// qué busca ahora y el próximo paso del seguimiento. Lo guarda en visitas.analisis.
// Usa Anthropic/Claude si hay ANTHROPIC_API_KEY (ideal para texto); si no, Gemini.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { enviarTelegramTexto } from "@/lib/telegram";
import { sinEmojis } from "@/lib/bot/text";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const PROMPT = `Sos el analista de una inmobiliaria. Te paso el TRANSCRIPTO de una visita de un cliente a una propiedad.
Analizalo y devolvé ÚNICAMENTE un JSON válido (sin texto alrededor, sin markdown) con esta forma EXACTA:
{
  "le_gusto": "si" | "no" | "dudoso",
  "positivos": ["lo que le gustó, frases cortas"],
  "objeciones": ["lo que NO le gustó / objeciones, frases cortas"],
  "busca_ahora": "qué está buscando ahora o qué ajustaría (zona, precio, ambientes, etc.) en una frase",
  "siguiente": "próximo paso concreto para el seguimiento, en una frase",
  "prob": <número 0 a 100 = probabilidad de cierre>
}
Basate SOLO en lo que dice el transcripto. Si algo no se menciona, dejá el campo vacío ([] o "").`;

function parseJson(s: string): Record<string, unknown> | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function analizar(transcripto: string): Promise<Record<string, unknown> | null> {
  const userMsg = `${PROMPT}\n\nTRANSCRIPTO:\n${transcripto}`;
  if (anthropic) {
    const r = await anthropic.messages.create({
      model: ANTHROPIC_MODEL, max_tokens: 1024,
      messages: [{ role: "user", content: userMsg }],
    });
    const txt = r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
    return parseJson(txt);
  }
  if (GEMINI_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: userMsg }] }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    const txt = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text || "").join("");
    return parseJson(txt);
  }
  return null;
}

// Completa texto libre con el mismo motor (para redactar el mensaje de seguimiento, no JSON).
async function completarTexto(userMsg: string): Promise<string | null> {
  if (anthropic) {
    const r = await anthropic.messages.create({
      model: ANTHROPIC_MODEL, max_tokens: 512, messages: [{ role: "user", content: userMsg }],
    });
    return r.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim() || null;
  }
  if (GEMINI_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: userMsg }] }] }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return ((j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text || "").join("").trim()) || null;
  }
  return null;
}

// Seguimiento automático post-visita: con lo que salió del análisis, el bot le manda al cliente
// UN mensaje personalizado (si le gustó → avanzar; si no → ofrecer otras opciones con sus objeciones).
// Por IA, con respaldo de texto fijo si la IA no responde. Lo guarda en el panel y marca seguimiento_at.
async function enviarSeguimiento(
  db: Awaited<ReturnType<typeof createClient>>,
  visitaId: string, leadId: string, prop: string | null, a: Record<string, unknown>
): Promise<boolean> {
  const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
  const { data: lead } = await db.from("leads").select("canal, canal_user_id, inmobiliaria_id, nombre").eq("id", leadId).maybeSingle();
  if (!lead || lead.canal !== "telegram" || !lead.canal_user_id) return false; // sin chat de Telegram → no hay a quién mandarle

  const inmoId = (lead.inmobiliaria_id as string) ?? null;
  const inmoRow = inmoId ? (await db.from("inmobiliarias").select("nombre").eq("id", inmoId).maybeSingle()).data : null;
  const inmo = (inmoRow?.nombre as string) || "la inmobiliaria";
  const nombre = (lead.nombre as string) || "";

  const gusto = String(a.le_gusto ?? "");
  const positivos = Array.isArray(a.positivos) ? (a.positivos as string[]).join("; ") : "";
  const objeciones = Array.isArray(a.objeciones) ? (a.objeciones as string[]).join("; ") : "";
  const busca = String(a.busca_ahora ?? "");

  const prompt = `Escribís el chat de ${inmo}, una inmobiliaria de Rosario, EN NOMBRE de la inmobiliaria (plural, "somos de ${inmo}"), en rioplatense (vos, tenés), cálido y natural, mensajes cortos, SIN emojis, sin sonar a bot ni a formulario.
El cliente ${nombre} fue a ver una propiedad (${prop || "una propiedad"}). Esto sacamos de cómo le fue en la visita:
- ¿Le gustó?: ${gusto || "no sabemos"}
- Le gustó: ${positivos || "—"}
- Objeciones / lo que no le cerró: ${objeciones || "—"}
- Qué busca ahora / ajustaría: ${busca || "—"}
Escribí UN mensaje de seguimiento para mandarle ahora, después de la visita:
- Si le gustó: preguntale qué le pareció y, con calidez y sin presionar, empujalo a avanzar (coordinar los próximos pasos).
- Si no le gustó o quedó dudoso: tomá sus objeciones y lo que busca ahora, y ofrecele buscar otras opciones más afines.
Devolvé SOLO el texto del mensaje, sin comillas ni encabezados.`;

  let texto = await completarTexto(prompt).catch(() => null);
  texto = texto ? sinEmojis(texto) : null;
  if (!texto) {
    texto = gusto === "si"
      ? `Hola${nombre ? " " + nombre : ""}! Somos de ${inmo}. ¿Cómo viste la propiedad? Si te gustó, podemos avanzar con los próximos pasos. ¿Lo coordinamos?`
      : `Hola${nombre ? " " + nombre : ""}! Somos de ${inmo}. ¿Qué te pareció la visita? Si no era del todo lo que buscás, contanos qué ajustarías y te buscamos otras opciones.`;
  }

  const mid = await enviarTelegramTexto(lead.canal_user_id as string, texto, TG_TOKEN);
  if (mid === null) return false; // no se pudo enviar → no marcamos, se reintenta

  const ts = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
  const { data: conv } = await db.from("conversaciones").select("id").eq("lead_id", leadId).maybeSingle();
  if (conv?.id) {
    await db.from("mensajes").insert({ inmobiliaria_id: inmoId, conversacion_id: conv.id, who: "bot", agent: "bottelegram", texto, ts_label: ts });
    await db.from("conversaciones").update({ ultimo_mensaje: texto.slice(0, 80), ultimo_label: ts }).eq("id", conv.id);
  }
  await db.from("visitas").update({ seguimiento_at: new Date().toISOString() }).eq("id", visitaId);
  return true;
}

export async function POST(req: Request) {
  if (!anthropic && !GEMINI_KEY) return NextResponse.json({ ok: false, error: "Sin motor de IA configurado" }, { status: 500 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  let body: { visitaId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "body inválido" }, { status: 400 }); }
  if (!body.visitaId) return NextResponse.json({ ok: false, error: "falta visitaId" }, { status: 400 });

  const { data: v } = await db.from("visitas").select("transcripto_texto, lead_id, prop").eq("id", body.visitaId).maybeSingle();
  const transcripto = (v?.transcripto_texto as string) ?? "";
  if (!transcripto.trim()) return NextResponse.json({ ok: false, error: "No hay transcripto. Transcribí o cargá el texto primero." }, { status: 400 });

  const analisis = await analizar(transcripto);
  if (!analisis) return NextResponse.json({ ok: false, error: "El analista no pudo procesar el transcripto" }, { status: 502 });

  await db.from("visitas").update({ analisis }).eq("id", body.visitaId);
  // la visita quedó analizada → el lead pasa a Seguimiento (por si no estaba).
  if (v?.lead_id) {
    await db.from("leads").update({ etapa: "Seguimiento" }).eq("id", v.lead_id as string);
    // Seguimiento automático: el bot le manda el mensaje al cliente UNA sola vez (guarda por
    // seguimiento_at). Resiliente: si la migración 0012 aún no está, el select falla y se saltea.
    try {
      const { data: vs, error: vsErr } = await db.from("visitas").select("seguimiento_at").eq("id", body.visitaId).maybeSingle();
      if (!vsErr && vs && !vs.seguimiento_at) {
        await enviarSeguimiento(db, body.visitaId, v.lead_id as string, (v.prop as string) ?? null, analisis as Record<string, unknown>);
      }
    } catch (e) {
      console.error("seguimiento post-visita:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, analisis });
}
