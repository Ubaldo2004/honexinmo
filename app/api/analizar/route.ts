// El "Analista": lee el transcripto de una visita y saca si le gustó/no, objeciones,
// qué busca ahora y el próximo paso del seguimiento. Lo guarda en visitas.analisis.
// Usa Anthropic/Claude si hay ANTHROPIC_API_KEY (ideal para texto); si no, Gemini.

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

  // Guardamos el análisis y marcamos cuándo se analizó: el cron mandará el seguimiento al
  // cliente recién 24 hs después (no al instante). Resiliente si 0013 aún no está aplicada.
  const { error: upErr } = await db.from("visitas").update({ analisis, analizada_at: new Date().toISOString() }).eq("id", body.visitaId);
  if (upErr) await db.from("visitas").update({ analisis }).eq("id", body.visitaId); // sin la columna todavía → guarda al menos el análisis
  // la visita quedó analizada → el lead pasa a Seguimiento (por si no estaba).
  if (v?.lead_id) await db.from("leads").update({ etapa: "Seguimiento" }).eq("id", v.lead_id as string);

  return NextResponse.json({ ok: true, analisis });
}
