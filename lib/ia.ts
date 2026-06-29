// Completado de texto libre con el motor de IA del proyecto (Claude si hay ANTHROPIC_API_KEY,
// si no Gemini). Reutilizable fuera de los route handlers — ej: el cron arma el mensaje de
// seguimiento post-visita. Devuelve null si no hay motor o si falla (el llamador decide el respaldo).

import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

export function iaDisponible(): boolean {
  return !!anthropic || !!GEMINI_KEY;
}

export async function completarTexto(userMsg: string, maxTokens = 512): Promise<string | null> {
  try {
    if (anthropic) {
      const r = await anthropic.messages.create({
        model: ANTHROPIC_MODEL, max_tokens: maxTokens, messages: [{ role: "user", content: userMsg }],
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
  } catch {
    return null;
  }
  return null;
}
