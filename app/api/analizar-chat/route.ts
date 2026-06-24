// El "Analista de chat": lee la conversación con el cliente y le tira TIPS al operador
// para que pueda seguir la charla (sobre todo cuando el bot está desconectado / lo tomó
// un humano). No escribe nada: devuelve el análisis en vivo.
// Usa Anthropic/Claude si hay ANTHROPIC_API_KEY; si no, Gemini.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const PROMPT = `Sos el analista de una inmobiliaria. Te paso la CONVERSACIÓN entre un comprador (cliente) y la inmobiliaria (bot/operador).
Tu trabajo es AYUDAR AL OPERADOR HUMANO a seguir la charla: el bot quizás ya no está respondiendo y un humano tiene que continuar.
Devolvé ÚNICAMENTE un JSON válido (sin texto alrededor, sin markdown) con esta forma EXACTA:
{
  "resumen": "en 1 o 2 frases, en qué punto está la conversación",
  "temperatura": "frio" | "tibio" | "caliente",
  "busca": "qué está buscando el cliente (operación, tipo, zona, presupuesto, ambientes) en una frase; lo que se sepa",
  "objeciones": ["dudas o trabas que mostró el cliente, frases cortas"],
  "sugerencia": "qué le conviene CONTESTAR ahora al operador, redactado para copiar y pegar, en tuteo rioplatense, cálido y corto",
  "siguiente": "próximo paso concreto (coordinar visita, pedir un dato, etc.) en una frase"
}
Basate SOLO en lo que dice la conversación. Si algo no se menciona, dejá el campo vacío ([] o "").`;

function parseJson(s: string): Record<string, unknown> | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function analizar(conversacion: string): Promise<Record<string, unknown> | null> {
  const userMsg = `${PROMPT}\n\nCONVERSACIÓN:\n${conversacion}`;
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

export async function POST(req: Request) {
  if (!anthropic && !GEMINI_KEY) return NextResponse.json({ ok: false, error: "Sin motor de IA configurado" }, { status: 500 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  let body: { conversacionId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "body inválido" }, { status: 400 }); }
  if (!body.conversacionId) return NextResponse.json({ ok: false, error: "falta conversacionId" }, { status: 400 });

  // El hilo real de la conversación (RLS scopea por tenant). Saltamos mensajes internos de datos.
  const { data: msgs } = await db
    .from("mensajes").select("who, texto, card")
    .eq("conversacion_id", body.conversacionId).order("enviado_at", { ascending: true });

  const transcripto = (msgs ?? [])
    .filter((m) => m.texto && m.card !== "resultados_data")
    .map((m) => `${m.who === "in" ? "Cliente" : "Inmobiliaria"}: ${m.texto}`)
    .join("\n");
  if (!transcripto.trim()) return NextResponse.json({ ok: false, error: "La conversación está vacía." }, { status: 400 });

  const analisis = await analizar(transcripto);
  if (!analisis) return NextResponse.json({ ok: false, error: "El analista no pudo procesar la conversación" }, { status: 502 });

  return NextResponse.json({ ok: true, analisis });
}
