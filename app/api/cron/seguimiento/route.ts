// Cron de seguimiento. Lo llama un pinger externo (cron-job.org) cada ~15 min con un secreto.
// Hace tres cosas en cada pasada:
//   1. Recordatorio 1 DÍA ANTES de la visita (a cualquier hora).
//   2. Recordatorio el MISMO DÍA a partir de las 8hs (hora Argentina).
//   3. Marca "basura" los leads que no avanzaron (para que el operador los pueda descartar).
// (El mensaje de seguimiento post-visita se suma en el próximo paso.)
//
// Usa la service key → bypassa RLS (es un job de sistema). Idempotente: cada recordatorio
// se marca con su timestamp, así no se repite aunque el cron corra muchas veces.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarTelegramTexto } from "@/lib/telegram";
import { completarTexto } from "@/lib/ia";
import { sinEmojis } from "@/lib/bot/text";

export const runtime = "nodejs";
export const maxDuration = 60;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const CRON_SECRET = process.env.CRON_SECRET || "";

const db = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

const DIA_MS = 24 * 3600 * 1000;
const AR_MS = 3 * 3600 * 1000; // Argentina = UTC-3 (sin horario de verano)

// Ventana UTC que cubre un día calendario argentino (offset 0 = hoy, 1 = mañana).
function arWindowUTC(offsetDays: number) {
  const ar = new Date(Date.now() - AR_MS);
  const medianoche = Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate() + offsetDays, 0, 0, 0);
  const start = medianoche + AR_MS; // instante UTC real de la medianoche argentina
  return { start: new Date(start).toISOString(), end: new Date(start + DIA_MS).toISOString() };
}
function arHora(): number {
  return new Date(Date.now() - AR_MS).getUTCHours();
}

function autorizado(req: Request): boolean {
  if (!CRON_SECRET) return true; // sin secreto seteado no bloqueamos (conviene setearlo igual)
  const key = new URL(req.url).searchParams.get("key");
  return key === CRON_SECRET || req.headers.get("authorization") === `Bearer ${CRON_SECRET}`;
}

type LeadMini = { canal_user_id: string | null; canal: string | null; inmobiliaria_id: string | null; nombre?: string | null };
type VisitaRow = { id: string; prop: string | null; leads: LeadMini | LeadMini[] | null };
type SeguiRow = { id: string; prop: string | null; lead_id: string | null; analisis: unknown; leads: LeadMini | LeadMini[] | null };

function leadDe(row: { leads: LeadMini | LeadMini[] | null }): LeadMini | null {
  const l = row.leads;
  return Array.isArray(l) ? (l[0] ?? null) : l;
}

function tsLabel(): string {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
}

async function inmoNombres(): Promise<Record<string, string>> {
  const { data } = await db.from("inmobiliarias").select("id, nombre");
  const m: Record<string, string> = {};
  for (const i of data ?? []) m[i.id as string] = (i.nombre as string) || "la inmobiliaria";
  return m;
}

// Manda el recordatorio a las visitas del día (offset) que todavía no lo recibieron.
async function recordar(
  offsetDays: number,
  flag: "recordatorio_1d_at" | "recordatorio_dia_at",
  inmos: Record<string, string>
): Promise<number> {
  const { start, end } = arWindowUTC(offsetDays);
  const { data } = await db
    .from("visitas")
    .select("id, prop, leads!inner(canal_user_id, canal, inmobiliaria_id)")
    .gte("fecha_visita", start)
    .lt("fecha_visita", end)
    .is(flag, null);

  let n = 0;
  for (const row of (data ?? []) as unknown as VisitaRow[]) {
    const lead = leadDe(row);
    if (!lead || lead.canal !== "telegram" || !lead.canal_user_id) continue;
    const inmo = inmos[lead.inmobiliaria_id ?? ""] || "la inmobiliaria";
    const prop = row.prop || "la propiedad";
    const texto =
      offsetDays === 1
        ? `Hola! Te escribimos de ${inmo}. Te recordamos que MAÑANA tenés la visita a ${prop}. ¿La confirmás? Cualquier cosa, acá estamos.`
        : `Hola! Te escribimos de ${inmo}. Hoy es la visita a ${prop}. Te esperamos, y si surge algo avisanos.`;
    const mid = await enviarTelegramTexto(lead.canal_user_id, texto, TG_TOKEN);
    if (mid !== null) {
      await db.from("visitas").update({ [flag]: new Date().toISOString() }).eq("id", row.id);
      n++;
    }
  }
  return n;
}

// Arma el mensaje de seguimiento con lo que salió del análisis (IA con respaldo de texto fijo).
async function armarSeguimiento(a: Record<string, unknown>, inmo: string, nombre: string, prop: string | null): Promise<string> {
  const gusto = String(a.le_gusto ?? "");
  const positivos = Array.isArray(a.positivos) ? (a.positivos as string[]).join("; ") : "";
  const objeciones = Array.isArray(a.objeciones) ? (a.objeciones as string[]).join("; ") : "";
  const busca = String(a.busca_ahora ?? "");

  const prompt = `Escribís el chat de ${inmo}, una inmobiliaria de Rosario, EN NOMBRE de la inmobiliaria (plural, "somos de ${inmo}"), en rioplatense (vos, tenés), cálido y natural, mensajes cortos, SIN emojis, sin sonar a bot ni a formulario.
El cliente ${nombre} fue a ver una propiedad (${prop || "una propiedad"}) y ya pasó un día. Esto sacamos de cómo le fue en la visita:
- ¿Le gustó?: ${gusto || "no sabemos"}
- Le gustó: ${positivos || "—"}
- Objeciones / lo que no le cerró: ${objeciones || "—"}
- Qué busca ahora / ajustaría: ${busca || "—"}
Escribí UN mensaje de seguimiento para mandarle ahora (al día siguiente de la visita):
- Si le gustó: preguntale qué le pareció y, con calidez y sin presionar, empujalo a avanzar (coordinar los próximos pasos).
- Si no le gustó o quedó dudoso: tomá sus objeciones y lo que busca ahora, y ofrecele buscar otras opciones más afines.
Devolvé SOLO el texto del mensaje, sin comillas ni encabezados.`;

  const ia = await completarTexto(prompt);
  if (ia) return sinEmojis(ia);
  return gusto === "si"
    ? `Hola${nombre ? " " + nombre : ""}! Somos de ${inmo}. ¿Cómo viste la propiedad que visitaste? Si te gustó, podemos avanzar con los próximos pasos. ¿Lo coordinamos?`
    : `Hola${nombre ? " " + nombre : ""}! Somos de ${inmo}. ¿Qué te pareció la visita? Si no era del todo lo que buscás, contanos qué ajustarías y te buscamos otras opciones.`;
}

// Seguimiento post-visita: 24 hs después del análisis, el bot le manda al cliente el mensaje
// personalizado (una sola vez, guarda por seguimiento_at). Lo guarda también en el chat del panel.
async function enviarSeguimientos(inmos: Record<string, string>): Promise<number> {
  const corte = new Date(Date.now() - DIA_MS).toISOString(); // analizada hace 24 hs o más
  const { data } = await db
    .from("visitas")
    .select("id, prop, lead_id, analisis, leads!inner(canal, canal_user_id, inmobiliaria_id, nombre)")
    .lte("analizada_at", corte)
    .not("analisis", "is", null)
    .is("seguimiento_at", null);

  let n = 0;
  for (const row of (data ?? []) as unknown as SeguiRow[]) {
    const lead = leadDe(row);
    if (!lead || lead.canal !== "telegram" || !lead.canal_user_id) continue;
    const inmo = inmos[lead.inmobiliaria_id ?? ""] || "la inmobiliaria";
    const a = (row.analisis && typeof row.analisis === "object" ? row.analisis : {}) as Record<string, unknown>;
    const texto = await armarSeguimiento(a, inmo, lead.nombre || "", row.prop);

    const mid = await enviarTelegramTexto(lead.canal_user_id, texto, TG_TOKEN);
    if (mid === null) continue; // no se pudo enviar → no marcamos, se reintenta en la próxima pasada

    const ts = tsLabel();
    if (row.lead_id) {
      const { data: conv } = await db.from("conversaciones").select("id").eq("lead_id", row.lead_id).maybeSingle();
      if (conv?.id) {
        await db.from("mensajes").insert({ inmobiliaria_id: lead.inmobiliaria_id, conversacion_id: conv.id, who: "bot", agent: "bottelegram", texto, ts_label: ts });
        await db.from("conversaciones").update({ ultimo_mensaje: texto.slice(0, 80), ultimo_label: ts }).eq("id", conv.id);
      }
    }
    await db.from("visitas").update({ seguimiento_at: new Date().toISOString() }).eq("id", row.id);
    n++;
  }
  return n;
}

// Marca basura: lead en Seguimiento, sin respuesta hace 7+ días, con baja prob de cierre (<30),
// sin visita futura agendada. NO toca los cerrados (Operación quedó fuera por etapa). La marca
// sólo lo deja como candidato; el operador decide si lo borra (hard delete).
async function marcarBasura(): Promise<number> {
  const corte7d = Date.now() - 7 * DIA_MS;
  const ahoraISO = new Date().toISOString();
  const { data: leads } = await db.from("leads").select("id").eq("etapa", "Seguimiento").eq("basura", false);

  let n = 0;
  for (const l of leads ?? []) {
    const leadId = l.id as string;

    // ¿respondió en los últimos 7 días? (última actividad de su conversación)
    const { data: conv } = await db.from("conversaciones").select("actualizada_at").eq("lead_id", leadId).maybeSingle();
    const act = conv?.actualizada_at ? new Date(conv.actualizada_at as string).getTime() : 0;
    if (act >= corte7d) continue;

    // ¿tiene una visita futura agendada? entonces no es basura
    const { data: fut } = await db.from("visitas").select("id").eq("lead_id", leadId).gt("fecha_visita", ahoraISO).limit(1);
    if (fut && fut.length) continue;

    // última visita analizada → prob de cierre
    const { data: vs } = await db.from("visitas").select("analisis").eq("lead_id", leadId).order("creada_at", { ascending: false }).limit(1);
    const analisis = vs && vs.length ? vs[0].analisis : null;
    const prob = analisis && typeof analisis === "object" ? Number((analisis as Record<string, unknown>).prob) : NaN;
    if (!Number.isFinite(prob) || prob >= 30) continue; // sin análisis o con buena prob → no es basura

    await db.from("leads").update({ basura: true, basura_at: ahoraISO }).eq("id", leadId);
    n++;
  }
  return n;
}

async function correr(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  if (!SB_URL || !SECRET) return NextResponse.json({ ok: false, error: "sin config de supabase" }, { status: 500 });

  const inmos = await inmoNombres();
  const recordatorio_1d = await recordar(1, "recordatorio_1d_at", inmos);
  const recordatorio_dia = arHora() >= 8 ? await recordar(0, "recordatorio_dia_at", inmos) : 0;
  const seguimiento = await enviarSeguimientos(inmos);
  const basura = await marcarBasura();

  return NextResponse.json({ ok: true, recordatorio_1d, recordatorio_dia, seguimiento, basura, hora_ar: arHora() });
}

export async function GET(req: Request) {
  return correr(req);
}
export async function POST(req: Request) {
  return correr(req);
}
