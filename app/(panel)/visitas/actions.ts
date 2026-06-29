"use server";

// Captura de visitas (graba/sube el agente). El audio va directo del browser a
// Storage con signed URLs (esquiva el límite de body de Vercel para audios largos).
// Las visitas se escriben con la sesión del usuario (RLS visitas_all por tenant).

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdmin } from "@supabase/supabase-js";

const BUCKET = "visitas-audio";
const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function ctx() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("no auth");
  const { data: u } = await db
    .from("usuarios").select("inmobiliaria_id, nombre").eq("id", user.id).maybeSingle();
  return { db, userId: user.id, inmoId: (u?.inmobiliaria_id as string) ?? null, nombre: (u?.nombre as string) ?? "—" };
}

export async function crearVisita(leadId: string | null, prop: string) {
  try {
    const { db, inmoId, nombre } = await ctx();
    if (!inmoId) return { ok: false as const, error: "Usuario sin inmobiliaria" };
    const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    const { data, error } = await db.from("visitas")
      .insert({ inmobiliaria_id: inmoId, lead_id: leadId || null, prop: prop || null, agente: nombre, fecha })
      .select("id").single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, id: data.id as string };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

export async function urlSubida(visitaId: string, ext: string) {
  try {
    const { inmoId } = await ctx();
    const path = `${inmoId}/${visitaId}.${(ext || "webm").replace(/[^a-z0-9]/gi, "")}`;
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false as const, error: error?.message ?? "no se pudo crear la URL" };
    return { ok: true as const, path, token: data.token };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

export async function confirmarAudio(visitaId: string, leadId: string | null, path: string, duracionSeg: number) {
  try {
    const { db } = await ctx();
    const { error } = await db.from("visitas")
      .update({ audio_path: path, duracion_seg: Math.max(0, Math.round(duracionSeg)) })
      .eq("id", visitaId);
    if (error) return { ok: false as const, error: error.message };
    // la visita ocurrió y quedó documentada → el lead pasa a Seguimiento.
    if (leadId) await db.from("leads").update({ etapa: "Seguimiento" }).eq("id", leadId);
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

export async function urlReproduccion(path: string) {
  try {
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data) return { ok: false as const, error: error?.message ?? "no se pudo crear la URL" };
    return { ok: true as const, url: data.signedUrl };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

export async function guardarTranscripto(visitaId: string, texto: string) {
  try {
    const { db } = await ctx();
    const t = texto.trim();
    const { error } = await db.from("visitas")
      .update({ transcripto_texto: t || null, transcripto: !!t }).eq("id", visitaId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

// Fija/corrige la fecha y hora real de la visita (ISO o null). Es la que usan los recordatorios.
export async function actualizarFechaVisita(visitaId: string, iso: string | null) {
  try {
    const { db } = await ctx();
    const { error } = await db.from("visitas").update({ fecha_visita: iso }).eq("id", visitaId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}

export async function eliminarVisita(visitaId: string, audioPath: string | null) {
  try {
    const { db } = await ctx();
    if (audioPath) await admin.storage.from(BUCKET).remove([audioPath]);
    const { error } = await db.from("visitas").delete().eq("id", visitaId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  } catch (e) { return { ok: false as const, error: (e as Error).message }; }
}
