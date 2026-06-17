// Transcribe el audio de una visita: baja el archivo de Storage, lo manda a Gemini
// (que sí transcribe audio) y guarda el texto en visitas.transcripto_texto.
// Corre como route handler (maxDuration 60) → aguanta audios más largos que una server action.
// El motor es enchufable: si después querés Whisper/AssemblyAI, se cambia solo esta llamada.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 60;

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const TRANSCRIBE_MODEL = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-2.5-flash";
const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const MIME: Record<string, string> = {
  mp3: "audio/mp3", wav: "audio/wav", m4a: "audio/aac", aac: "audio/aac",
  ogg: "audio/ogg", oga: "audio/ogg", flac: "audio/flac", webm: "audio/webm", mp4: "audio/mp4",
};

export async function POST(req: Request) {
  if (!GEMINI_KEY) return NextResponse.json({ ok: false, error: "Falta GEMINI_API_KEY" }, { status: 500 });

  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  let body: { visitaId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "body inválido" }, { status: 400 }); }
  if (!body.visitaId) return NextResponse.json({ ok: false, error: "falta visitaId" }, { status: 400 });

  // RLS: el usuario solo ve visitas de su tenant.
  const { data: v } = await db.from("visitas").select("audio_path").eq("id", body.visitaId).maybeSingle();
  if (!v?.audio_path) return NextResponse.json({ ok: false, error: "La visita no tiene audio" }, { status: 400 });
  const path = v.audio_path as string;

  // bajar el audio de Storage (bucket privado → service key)
  const { data: blob, error: dErr } = await admin.storage.from("visitas-audio").download(path);
  if (dErr || !blob) return NextResponse.json({ ok: false, error: "No se pudo bajar el audio" }, { status: 500 });
  const buf = Buffer.from(await blob.arrayBuffer());
  if (buf.length > 19 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: "Audio muy pesado para transcribir acá (>~19MB). Para visitas largas conviene un motor dedicado." }, { status: 400 });
  }
  const ext = (path.split(".").pop() || "webm").toLowerCase();
  const mime = MIME[ext] || "audio/mpeg";

  const prompt = "Transcribí este audio de una visita inmobiliaria, en español rioplatense. Devolvé SOLO el texto de lo que se habló, sin comentarios ni encabezados. Si se distinguen dos personas, poné 'Agente:' y 'Cliente:' antes de cada intervención.";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${TRANSCRIBE_MODEL}:generateContent?key=${GEMINI_KEY}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ inline_data: { mime_type: mime, data: buf.toString("base64") } }, { text: prompt }] }] }),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Error llamando al motor de transcripción" }, { status: 502 });
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("transcribir:", JSON.stringify(j).slice(0, 300));
    return NextResponse.json({ ok: false, error: "El motor no pudo transcribir (¿formato del audio?). Probá un mp3/m4a/wav." }, { status: 502 });
  }
  const texto = (j?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text || "").join("").trim();
  if (!texto) return NextResponse.json({ ok: false, error: "No se obtuvo transcripto" }, { status: 502 });

  await db.from("visitas").update({ transcripto_texto: texto, transcripto: true }).eq("id", body.visitaId);
  return NextResponse.json({ ok: true, texto });
}
