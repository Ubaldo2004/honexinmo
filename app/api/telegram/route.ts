// Webhook de Telegram (serverless, 24/7 en Vercel). Reemplaza al poller local
// scripts/telegram-poll.mjs: Telegram pega acá en cada mensaje. Ingiere el lead +
// conversación + mensaje, y el bot responde con Gemini (califica, busca, asigna).
//
// Responde 200 al instante y procesa en background con after() para no cortar por
// timeout (Telegram reintenta si tardás). Usa la service key → bypassa RLS.

import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";
const SLUG = process.env.HONEX_TENANT_SLUG || "norte";
// IA del bot: usa Anthropic (Claude) si hay ANTHROPIC_API_KEY; si no, cae a Gemini.
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const anthropic = ANTHROPIC_KEY ? new Anthropic({ apiKey: ANTHROPIC_KEY }) : null;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
// flash-lite tiene una cuota diaria free mucho más alta que flash (que quedó en 20/día).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const SEARCH_URL = process.env.N8N_SEARCH_WEBHOOK_URL || "https://n8n.tokko-finder.gachetponzellini.com/webhook/honex/search-v2";
const SEARCH_VENDEDOR = process.env.HONEX_SEARCH_VENDEDOR_ID || ""; // fallback: telegram_id del vendedor (n8n resuelve el UUID)
const API = `https://api.telegram.org/bot${TOKEN}`;

const db = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

// Tenant resuelto una vez por instancia (las funciones "calientes" lo reutilizan).
let INMO_ID: string | null = null;
let INMO_NOMBRE = "la inmobiliaria";
let INMO_VENDEDORES: string[] = []; // telegram_id de los vendedores del tenant, para rotar (n8n resuelve el UUID)
let VENDEDOR_IDX = 0;
let INMO_AT = 0;
const INMO_TTL = 5 * 60 * 1000; // refresca nombre + vendedores cada 5 min (no esperar redeploy)
async function getInmo() {
  if (INMO_ID && Date.now() - INMO_AT < INMO_TTL) return INMO_ID;
  const { data } = await db.from("inmobiliarias").select("id, nombre").eq("slug", SLUG).maybeSingle();
  if (data) { INMO_ID = data.id as string; INMO_NOMBRE = data.nombre as string; INMO_AT = Date.now(); }
  if (INMO_ID) {
    const { data: us } = await db.from("usuarios").select("tokko_vendedor_id")
      .eq("inmobiliaria_id", INMO_ID).not("tokko_vendedor_id", "is", null);
    INMO_VENDEDORES = (us ?? []).map((u) => u.tokko_vendedor_id as string).filter(Boolean);
  }
  return INMO_ID;
}

// Rota entre los telegram_id de los vendedores (uno por búsqueda) → no pega siempre a la misma cuenta.
function siguienteVendedor(): string {
  if (!INMO_VENDEDORES.length) return SEARCH_VENDEDOR;
  const v = INMO_VENDEDORES[VENDEDOR_IDX % INMO_VENDEDORES.length];
  VENDEDOR_IDX++;
  return v;
}

function horaLabel() {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
}

// Tipo de cambio USD→ARS (dólar oficial, venta), cacheado por instancia.
let DOLAR_CACHE: { value: number; at: number } | null = null;
async function getDolar(): Promise<number> {
  const now = Date.now();
  if (DOLAR_CACHE && now - DOLAR_CACHE.at < 30 * 60 * 1000) return DOLAR_CACHE.value;
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/oficial");
    const j = await r.json();
    const v = Number(j?.venta);
    if (v > 0) { DOLAR_CACHE = { value: v, at: now }; return v; }
  } catch { /* usa fallback */ }
  return DOLAR_CACHE?.value ?? 1000;
}

// ── IA del bot ───────────────────────────────────────────────
function systemPrompt(dolar: number, ancla: string | null, mostradas: string) {
  return `Escribís el chat de ${INMO_NOMBRE}, una inmobiliaria de Rosario. Te escriben compradores que llegaron desde una campaña. Hablás EN NOMBRE de la inmobiliaria, en plural ("somos de ${INMO_NOMBRE}", "te escribimos de…"), natural y humano, NUNCA como un asistente automático ni un bot, y SIN inventar un nombre propio. La charla tiene UN objetivo concreto: ayudarlo a encontrar una propiedad y coordinar la visita.
${ancla ? `\nCONTEXTO IMPORTANTE: este comprador llegó desde un aviso interesado en esta propiedad (ancla): "${ancla}". Tenela presente en toda la charla, referite a ella cuando sume, y si no aclara otra cosa asumí que busca algo parecido. Si pide algo distinto, seguilo igual.\n` : ""}

CÓMO HABLÁS (clave para no sonar a bot):
- Rioplatense natural (vos, tenés, buscás, dale, mirá), mensajes cortos, cálido y relajado, como en un chat real.
- Presentate como la INMOBILIARIA: "Hola, somos de ${INMO_NOMBRE}". NUNCA digas "asistente"/"bot", NUNCA uses un nombre de persona, y JAMÁS escribas un placeholder tipo "[tu nombre]" o "[nombre]". Hablá en plural (somos, te escribimos).
- Si el comprador solo saluda o tira un mensaje suelto ("hola", "buenas"), arrancá simple y natural: saludá y preguntale cómo anda, y enseguida preguntale qué anda buscando o en qué lo podés ayudar. NADA de presentaciones acartonadas tipo "te escribimos de…", y NO preguntes "¿estás bien?".
- GUIÁ la charla, sutil y tranqui: si lo que dice no va hacia una búsqueda o una visita, llevalo de a poco para ese lado (qué está buscando, para después coordinar la visita), sin que se note forzado ni vendedor. Nunca insistas de forma robótica.
- Podés mandar MÁS DE UN mensaje corto seguido (como alguien que escribe rápido por chat). Separá cada mensaje con una línea que diga solo [[NEXT]]. Máximo 3. Ej: "¡Hola! ¿Cómo andás?[[NEXT]]¿Qué andás buscando? ¿En qué te damos una mano?"
- NADA de emojis, NUNCA. Ni caritas, ni manos, ni símbolos. Escribí siempre sin emojis, como un mensaje de texto normal.
- NO repitas ni recapitules lo que te dijo como confirmación. Tomá el dato y seguí. Variá las frases (no siempre "Genial", "Buenísimo", "Perfecto"). Que no parezca un formulario.

Tu objetivo es charlar natural y CALIFICAR bien al comprador ANTES de buscar. Datos que necesitás juntar:
1) operación (venta o alquiler)
2) tipo (casa, departamento, PH, terreno, local…)
3) zona o ciudad
4) presupuesto (o rango)
5) ambientes o dormitorios

Cómo manejarte:
- Una cosa a la vez: no amontones varias preguntas juntas (un saludo + UNA pregunta está perfecto).
- Si el comprador da MUY pocos datos (ej: solo "una casa", o solo una zona), NO busques todavía: pedile lo que falta, priorizando presupuesto y ambientes/dormitorios, que son los que más afinan la búsqueda.
- Cuando tengas los 5 datos base, antes de buscar preguntá UNA vez si hay alguna preferencia importante (cochera, a estrenar, baños, balcón, patio, etc.). Si dice que no, o "mostrame lo que haya", buscá igual.
- IMPORTANTE — el buscador trabaja en DÓLARES (USD). Si el comprador da el presupuesto en PESOS argentinos, convertilo a USD dividiendo por ${dolar} (dólar oficial de hoy) y poné el monto YA EN USD en el [BUSCAR:...]. Ejemplo: "hasta 200 millones de pesos" → hasta ${Math.round(200000000 / dolar)} USD. Si ya te lo da en dólares, usá ese número tal cual.
- Cuando ya tengas un panorama razonable, respondé ÚNICAMENTE con una línea con este formato EXACTO, sin nada más:
[BUSCAR: <frase con TODOS los datos: operación, tipo, zona, presupuesto (en USD), ambientes/dormitorios y preferencias>]
Ejemplo: [BUSCAR: Casa en venta en Funes, 3 dormitorios, 2 baños, con cochera, hasta 200000 USD]
- Si después de ver resultados el comprador quiere agregar o cambiar detalles, incorporá lo nuevo y volvé a emitir un [BUSCAR: ...] actualizado.

Coordinar la visita (cuando el comprador muestra INTERÉS REAL en una propiedad: quiere ir a verla, visitarla o avanzar):
- PRIMERO preguntale, con tus palabras (sin frase armada), qué días le quedan bien para ir a verla y si prefiere a la mañana o a la tarde.
- Cuando te dé su disponibilidad, respondé ÚNICAMENTE con estas DOS líneas (el cliente NO las ve; las usa el sistema para registrar cuándo puede y asignarle solo un vendedor libre para ese horario):
[[DISPO: <días y franjas normalizados, ej: martes tarde, jueves mañana>]]
[ASIGNAR: ]
- El sistema elige automáticamente un vendedor disponible para ese horario; vos no tenés que preguntar por nombres. SOLO si el comprador pide un vendedor puntual por su nombre, poné ese nombre en el ASIGNAR (ej: [ASIGNAR: Ubaldo]); si no, dejalo VACÍO.
${mostradas ? `
PROPIEDADES QUE YA LE MOSTRASTE (numeradas tal cual las ve el cliente):
${mostradas}

Manejo de estas propiedades:
- Si el cliente elige o pregunta por una ("la 1", "la primera", "la de Funes"…), dale MÁS detalles de ESA usando SOLO los datos de arriba (no inventes nada que no esté), y preguntale si es la que quiere ir a ver.
- Cuando el cliente DECIDE ir a ver una opción puntual ("vamos a ver la 2", "quiero ir a ver la 1", "esa la quiero visitar"), respondé normal (arrancá a coordinar la visita) Y AGREGÁ al final, en una línea aparte, la etiqueta OCULTA [[INTERES: <NÚMERO de ESA opción>]] — el cliente NO la ve; el sistema registra esa propiedad como la que va a visitar (queda anclada al lead). Tiene que ser el número de la lista. OJO: pedir FOTOS no es decidir la visita; el [[INTERES]] va RECIÉN cuando dice que la quiere ir a ver.
- FOTOS: cuando el cliente elige o pregunta por UNA opción ("la 1", "la primera", "mostrame fotos de la 2"): AGREGÁ la etiqueta OCULTA [[FOTOS: <NÚMERO de la opción>]] — el sistema le manda la foto con las características de esa propiedad en el pie. NO repitas vos las características (ya van en la foto). Tu texto tiene que ser SOLO una pregunta, en un mensaje aparte (poné [[NEXT]] antes): si quiere que coordinen la visita a esa, o si prefiere que le muestres OTRAS de las opciones. Ej de tu salida exacta: "[[FOTOS: 1]][[NEXT]]¿Querés que coordinemos una visita a esta, o preferís que te muestre otras opciones?"
- Si quiere cambiar a otra de la lista, mostrale los detalles de esa otra (y actualizá la etiqueta [[INTERES: <número>]] a la nueva opción).
- Si NINGUNA le gustó, o pide ver MÁS / OTRAS / NUEVAS, no repreguntes de más: emití directamente un [BUSCAR: ...] (podés ampliar o variar zona/precio) — el sistema le va a traer propiedades DISTINTAS a las ya mostradas.` : ""}`;
}

type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };

// Mensaje que mandamos cuando la IA falla. OJO: NO se guarda en el historial ni
// se usa como contexto — si no, la IA lo ve repetido y lo empieza a copiar (loop).
const FALLBACK = "Uy, estamos con mucha demanda en este momento. Dame unos segundos y escribime de nuevo.";

async function llamarGemini(contents: GeminiContent[], dolar: number, ancla: string | null, mostradas: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const payload = JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt(dolar, ancla, mostradas) }] }, contents });

  // Reintenta ante 429 (rate limit) o 5xx. En el 429, Google manda en RetryInfo.retryDelay
  // cuánto esperar ("46s") → lo respetamos, pero acotado al presupuesto de la función.
  const inicio = Date.now();
  const PRESUPUESTO_MS = 50_000; // margen contra maxDuration=60
  for (let intento = 0; intento < 4; intento++) {
    let res: Response;
    try {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
    } catch (e) {
      console.error("gemini fetch:", (e as Error).message);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p: { text: string }) => p.text).join("").trim();
      return text || "¿Me contás un poco más qué estás buscando?";
    }
    if (res.status === 429 || res.status >= 500) {
      let waitMs = 2500 * (intento + 1);
      const details = json?.error?.details;
      if (Array.isArray(details)) {
        const ri = details.find((d: Record<string, unknown>) => String(d["@type"] ?? "").includes("RetryInfo"));
        const secs = ri?.retryDelay ? parseFloat(String(ri.retryDelay)) : 0; // "46s" → 46
        if (secs > 0) waitMs = Math.ceil(secs * 1000) + 500;
      }
      // Cap del wait: si Google pide esperar mucho (cuota diaria/minuto agotada),
      // NO colgamos la función — mejor fallar rápido y que el cliente reintente.
      waitMs = Math.min(waitMs, 8000);
      if (waitMs > PRESUPUESTO_MS - (Date.now() - inicio)) {
        console.error(`gemini ${res.status}: sin presupuesto para reintentar, corto`);
        break;
      }
      console.error(`gemini ${res.status}, espero ${Math.round(waitMs / 1000)}s (intento ${intento + 1}/4)`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    // error no recuperable (400/403/etc.)
    console.error("gemini:", JSON.stringify(json).slice(0, 300));
    break;
  }
  return FALLBACK;
}

// Claude (Anthropic). El system prompt va aparte; el hilo se mapea a user/assistant.
// El SDK reintenta solo ante 429/5xx (max_retries por defecto).
async function llamarAnthropic(contents: GeminiContent[], dolar: number, ancla: string | null, mostradas: string) {
  const messages = contents.map((c) => ({
    role: (c.role === "user" ? "user" : "assistant") as "user" | "assistant",
    content: c.parts.map((p) => p.text).join(""),
  }));
  try {
    const msg = await anthropic!.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt(dolar, ancla, mostradas),
      messages,
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text || "¿Me contás un poco más qué estás buscando?";
  } catch (e) {
    console.error("anthropic:", (e as Error).message);
    return FALLBACK;
  }
}

// Elige el proveedor: Claude si está configurado, si no Gemini.
async function llamarLLM(contents: GeminiContent[], dolar: number, ancla: string | null, mostradas: string) {
  if (anthropic) return llamarAnthropic(contents, dolar, ancla, mostradas);
  if (GEMINI_KEY) return llamarGemini(contents, dolar, ancla, mostradas);
  return FALLBACK;
}

type Prop = {
  precio?: number | null; moneda?: string; tipo?: string; ubicacion?: string; direccion?: string;
  dormitorios?: number | null; ambientes?: number | null; banos?: number | null; toilettes?: number | null;
  cocheras?: number | null; sup_cubierta?: number | null; sup_total?: number | null; sup_terreno?: number | null;
  antiguedad?: number | null; expensas?: number | null; condicion?: string | null; orientacion?: string | null;
  disposicion?: string | null; match?: number; [k: string]: unknown;
};

async function buscarPropiedades(query: string): Promise<Prop[]> {
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id: siguienteVendedor(), filtros: query, limit: 15 }),
    });
    const data = await res.json();
    // El motor ahora devuelve una lista plana `propiedades`. Fallback al api/red viejo.
    const lista: Prop[] = Array.isArray(data?.propiedades)
      ? data.propiedades
      : [
          ...(Array.isArray(data?.api?.propiedades) ? data.api.propiedades : []),
          ...(Array.isArray(data?.red?.propiedades) ? data.red.propiedades : []),
        ];
    return lista.slice(0, 15);
  } catch (e) {
    console.error("buscar:", (e as Error).message);
    return [];
  }
}

// Clave para detectar propiedades repetidas entre búsquedas (traer "nuevas").
function propKey(p: Prop): string {
  return `${String(p.tipo ?? "").toLowerCase()}|${String(p.ubicacion ?? "").toLowerCase()}|${p.precio ?? ""}`;
}

// Resumen con TODOS los datos de una propiedad, para que el bot dé más detalle.
function fichaPrompt(p: Prop, i: number): string {
  const campos = [
    p.direccion ? `dirección ${p.direccion}` : null,
    p.precio != null ? `precio USD ${p.precio}` : null,
    p.dormitorios ? `${p.dormitorios} dorm` : null,
    p.banos ? `${p.banos} baños` : null,
    p.toilettes ? `${p.toilettes} toilette` : null,
    p.cocheras ? `${p.cocheras} cochera(s)` : null,
    p.sup_cubierta ? `${p.sup_cubierta} m² cubiertos` : null,
    p.sup_total ? `${p.sup_total} m² totales` : null,
    p.sup_terreno ? `${p.sup_terreno} m² de terreno` : null,
    p.antiguedad != null ? `${p.antiguedad} años de antigüedad` : null,
    p.expensas ? `expensas ${p.expensas}` : null,
    p.condicion ? `estado ${p.condicion}` : null,
    p.orientacion ? `orientación ${p.orientacion}` : null,
    p.disposicion ? `disposición ${p.disposicion}` : null,
  ].filter(Boolean).join(", ");
  return `${i + 1}. ${p.tipo || "Propiedad"} en ${p.ubicacion || "?"} — ${campos || "sin más datos"}`;
}

// Zona legible: "Argentina | Santa Fe | Rosario | Centro" → "Centro".
function zonaCorta(u?: string): string {
  if (!u) return "?";
  const parts = String(u).split("|").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] || String(u);
}

// Preferencias que el cliente puede pedir → cómo detectarlas en el texto y en la propiedad.
// pred(p) mira amenities (objeto que manda el motor) + tags + campos sueltos.
const PREFERENCIAS: { keys: string[]; pred: (p: Prop, am: Record<string, unknown>) => boolean }[] = [
  { keys: ["cochera", "garage", "garaje", "auto"], pred: (p, am) => !!(am.covered_parking || am.uncovered_parking) || (p.cocheras != null && Number(p.cocheras) > 0) },
  { keys: ["balcón", "balcon"], pred: (_p, am) => !!am.balcony },
  { keys: ["patio"], pred: (_p, am) => !!am.patio },
  { keys: ["terraza"], pred: (_p, am) => !!am.terrace },
  { keys: ["pileta", "piscina"], pred: (_p, am) => !!am.pool },
  { keys: ["parrilla", "asador", "bbq"], pred: (_p, am) => !!am.BBQ },
  { keys: ["a estrenar", "estrenar", "nuevo", "nueva"], pred: (p, am) => (p.antiguedad != null && Number(p.antiguedad) <= 1) || !!am.under_construction },
  { keys: ["amoblado", "amueblado"], pred: (_p, am) => !!am.furnished },
  { keys: ["gimnasio", "gym"], pred: (_p, am) => !!am.gym },
  { keys: ["seguridad", "vigilancia"], pred: (_p, am) => !!(am.security || am.security_24h) },
  { keys: ["sum"], pred: (_p, am) => !!am.sum },
  { keys: ["luminoso", "luz natural"], pred: (_p, am) => !!am.bright },
];

// Criterios que pidió el cliente, extraídos del texto del [BUSCAR: ...].
type Criterios = { presupuesto: number | null; ambientes: number | null; dormitorios: number | null; tipo: string | null; prefs: number[]; raw: string };
function criteriosDeQuery(query: string): Criterios {
  const q = query.toLowerCase();
  // presupuesto = el número más grande (los precios son los números grandes del texto)
  const nums = (q.match(/\d[\d.]*/g) || []).map((n) => parseInt(n.replace(/\./g, ""), 10)).filter((n) => n > 0);
  const presupuesto = nums.length ? Math.max(...nums) : null;
  const amb = q.match(/(\d+)\s*amb/);
  const dorm = q.match(/(\d+)\s*(dorm|dormitorio)/);
  let tipo: string | null = null;
  for (const t of ["monoambiente", "departamento", "depto", "casa", "ph", "terreno", "local", "oficina", "galpón", "galpon", "cochera"]) {
    if (q.includes(t)) { tipo = t === "depto" ? "departamento" : t; break; }
  }
  const prefs = PREFERENCIAS.map((pr, i) => (pr.keys.some((k) => q.includes(k)) ? i : -1)).filter((i) => i >= 0);
  return { presupuesto, ambientes: amb ? parseInt(amb[1], 10) : null, dormitorios: dorm ? parseInt(dorm[1], 10) : null, tipo, prefs, raw: q };
}

// % de coincidencia 0–100 de una propiedad con lo que pidió el cliente.
// El motor no devuelve match_score, así que lo calculamos acá (precio 33, ambientes 22, tipo 17, zona 13, prefs 15).
function scoreMatch(c: Criterios, p: Prop): number {
  let s = 0;
  // precio (33)
  if (c.presupuesto && p.precio != null) {
    const pr = Number(p.precio);
    if (pr <= c.presupuesto) s += 33;
    else if (pr <= c.presupuesto * 1.15) s += 21;
    else if (pr <= c.presupuesto * 1.35) s += 10;
  } else s += 23;
  // ambientes / dormitorios (22)
  const objAmb = c.ambientes ?? (c.dormitorios != null ? c.dormitorios + 1 : null);
  const propAmb = p.ambientes ?? (p.dormitorios != null ? Number(p.dormitorios) + 1 : null);
  if (objAmb && propAmb) {
    const d = Math.abs(objAmb - Number(propAmb));
    s += d === 0 ? 22 : d === 1 ? 13 : d === 2 ? 5 : 0;
  } else s += 15;
  // tipo (17)
  if (c.tipo && p.tipo) {
    const pt = String(p.tipo).toLowerCase();
    if (pt.includes(c.tipo) || c.tipo.includes(pt)) s += 17;
  } else s += 11;
  // zona (13): el barrio de la propiedad aparece en lo que pidió
  const barrio = zonaCorta(p.ubicacion).toLowerCase();
  if (barrio && barrio !== "?" && c.raw.includes(barrio)) s += 13;
  else if (!barrio || barrio === "?") s += 8;
  // preferencias (15): si pidió alguna, cuántas cumple. Si no pidió ninguna, neutro.
  if (c.prefs.length) {
    const am = (p.amenities && typeof p.amenities === "object" ? p.amenities : {}) as Record<string, unknown>;
    const cumple = c.prefs.filter((i) => PREFERENCIAS[i].pred(p, am)).length;
    s += Math.round((cumple / c.prefs.length) * 15);
  } else s += 15;
  return Math.max(0, Math.min(100, Math.round(s)));
}

// Devuelve VARIOS mensajes: uno por propiedad (con detalle, sin emojis) + un cierre.
function formatearResultados(query: string, props: Prop[], dolar: number): string[] {
  if (!props.length) {
    return [`Mirá, busqué con esos datos pero ahora mismo no me aparece nada que encaje. ¿Ampliamos un poco la zona o el presupuesto y vuelvo a fijarme?`];
  }
  const fichas = props.map((p, i) => {
    let precio = "Precio a consultar";
    if (p.precio != null) {
      const usd = Number(p.precio);
      const ars = Math.round(usd * dolar);
      precio = `USD ${usd.toLocaleString("es-AR")} (aprox. $${ars.toLocaleString("es-AR")})`;
    }
    const det: string[] = [];
    if (p.dormitorios) det.push(`${p.dormitorios} dormitorio${Number(p.dormitorios) > 1 ? "s" : ""}`);
    if (p.ambientes) det.push(`${p.ambientes} ambientes`);
    if (p.banos) det.push(`${p.banos} baño${Number(p.banos) > 1 ? "s" : ""}`);
    if (p.cocheras) det.push(`${p.cocheras} cochera${Number(p.cocheras) > 1 ? "s" : ""}`);
    if (p.sup_cubierta) det.push(`${p.sup_cubierta} m² cubiertos`);
    if (p.sup_total) det.push(`${p.sup_total} m² totales`);
    if (p.antiguedad != null) det.push(Number(p.antiguedad) <= 0 ? "a estrenar" : `${p.antiguedad} años de antigüedad`);
    const detTxt = det.length ? `\n${det.join(" · ")}` : "";
    const dir = p.direccion ? `\nEstá en ${p.direccion}` : "";
    return `Opción ${i + 1} — ${p.tipo || "Propiedad"} en ${zonaCorta(p.ubicacion)}\n${precio}${detTxt}${dir}`;
  });
  const cierre = `Esas son las que más se acercan a lo que buscás. ¿Alguna te copa para ir a verla? Si no, decime qué ajustar (zona, presupuesto, ambientes) y busco de nuevo.`;
  return [...fichas, cierre];
}

// Pie de foto con las características de la propiedad (va como caption de la foto que se manda).
function fichaCaption(p: Prop, n: number, dolar: number): string {
  let precio = "";
  if (typeof p.precio === "number") {
    const usd = Number(p.precio);
    const ars = Math.round(usd * dolar);
    precio = `\nUSD ${usd.toLocaleString("es-AR")} (aprox. $${ars.toLocaleString("es-AR")})`;
  }
  const det: string[] = [];
  if (p.dormitorios) det.push(`${p.dormitorios} dorm`);
  if (p.ambientes) det.push(`${p.ambientes} amb`);
  if (p.banos) det.push(`${p.banos} baños`);
  if (p.cocheras) det.push(`${p.cocheras} cochera${Number(p.cocheras) > 1 ? "s" : ""}`);
  if (p.sup_cubierta) det.push(`${p.sup_cubierta} m² cub`);
  if (p.sup_total) det.push(`${p.sup_total} m² tot`);
  const detTxt = det.length ? `\n${det.join(" · ")}` : "";
  const dir = p.direccion ? `\nEn ${p.direccion}` : "";
  return sinEmojis(`Opción ${n} — ${p.tipo || "Propiedad"} en ${zonaCorta(p.ubicacion)}${precio}${detTxt}${dir}`);
}

// Devuelve el message_id de Telegram (para poder editar ese mensaje luego), o null.
async function enviarTelegram(chatId: number | string, text: string): Promise<number | null> {
  try {
    const r = await fetch(`${API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const j = await r.json().catch(() => ({}));
    return (j?.result?.message_id as number) ?? null;
  } catch (e) {
    console.error("enviarTelegram:", (e as Error).message);
    return null;
  }
}

// Manda una foto (por URL) al chat. Si falla, seguimos sin romper.
async function enviarFoto(chatId: number | string, fotoUrl: string, caption?: string) {
  try {
    // Bajamos la imagen y la SUBIMOS como archivo (multipart). Más robusto que pasarle la URL a
    // Telegram, que a veces no puede bajarla del CDN de Tokko ("failed to get HTTP URL content").
    const img = await fetch(fotoUrl);
    if (!img.ok) { console.error("enviarFoto: no se pudo bajar la imagen:", img.status, fotoUrl); return; }
    const blob = await img.blob();
    const form = new FormData();
    form.append("chat_id", String(chatId));
    if (caption) form.append("caption", caption);
    form.append("photo", blob, "foto.jpg");
    const r = await fetch(`${API}/sendPhoto`, { method: "POST", body: form });
    const j = await r.json().catch(() => ({}));
    if (!j?.ok) console.error("enviarFoto: Telegram rechazó:", j?.description ?? r.status, fotoUrl);
  } catch (e) {
    console.error("enviarFoto:", (e as Error).message);
  }
}

// Saca cualquier emoji del texto. Garantía dura: el bot NUNCA manda emojis,
// aunque el modelo igual los meta.
function sinEmojis(t: string): string {
  return t
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\u{2190}-\u{21FF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    .replace(/ {2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

// Manda una lista de mensajes (uno por uno) y guarda cada uno como mensaje del bot.
async function enviarMensajes(convId: string, chatId: number | string, mensajes: string[]) {
  for (const m of mensajes) {
    const t = sinEmojis(m);
    if (!t) continue;
    const ts = horaLabel();
    const msgId = await enviarTelegram(chatId, t);
    await db.from("mensajes").insert({
      inmobiliaria_id: INMO_ID, conversacion_id: convId,
      who: "bot", agent: "bottelegram", texto: t, ts_label: ts, canal_msg_id: msgId,
    });
    await db.from("conversaciones").update({ ultimo_mensaje: t.slice(0, 80), ultimo_label: ts }).eq("id", convId);
  }
}

async function asignarConv(convId: string, leadId: string | null, vendedor: string, reason?: string) {
  // Resolver el uuid del vendedor (tabla usuarios) → habilita la RLS del operador.
  const { data: u } = await db.from("usuarios").select("id").eq("nombre", vendedor).eq("inmobiliaria_id", INMO_ID).maybeSingle();
  const asignadoA = (u?.id as string) ?? null;
  await db.from("conversaciones").update({
    asignado_a: asignadoA, asignado_label: vendedor, estado: "visita", reason: reason ?? `Derivado a ${vendedor}`,
  }).eq("id", convId);
  if (leadId) {
    await db.from("leads").update({ asignado_a: asignadoA, asignado_label: vendedor, etapa: "Visita" }).eq("id", leadId);
  }
}

// ── Match cliente ↔ vendedor por agenda (Fase 3) ──────────────
const DIAS_SEM = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
function sinAcento(s: string) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

// "martes tarde, jueves mañana" → [{dia:"martes", franja:"tarde"}, ...] (días canónicos).
function parseDispo(s: string): { dia: string; franja: string }[] {
  const out: { dia: string; franja: string }[] = [];
  for (const chunk of s.toLowerCase().split(/[,;]|\sy\s/)) {
    const c = sinAcento(chunk);
    const dia = DIAS_SEM.find((d) => c.includes(sinAcento(d)));
    const franja = /man|maty/.test(c) ? "mañana" : /tard|noch|vesper/.test(c) ? "tarde" : null;
    if (dia && franja && !out.some((o) => o.dia === dia && o.franja === franja)) out.push({ dia, franja });
  }
  return out;
}

// Busca un vendedor del tenant libre en alguno de los slots pedidos → {nombre, slot} o null.
// La agenda del vendedor son RANGOS DE HORA (hora_inicio..hora_fin). El cliente pide
// "mañana" o "tarde": mapeamos un rango a mañana si empieza antes de las 13:00, y a
// tarde si termina después de las 13:00. El slot que devolvemos muestra la hora real.
async function matchVendedor(slots: { dia: string; franja: string }[]): Promise<{ nombre: string; slot: string } | null> {
  if (!slots.length) return null;
  const { data } = await db.from("disponibilidad_agente")
    .select("dia, hora_inicio, hora_fin, usuarios(nombre)").eq("inmobiliaria_id", INMO_ID);
  for (const s of slots) {
    const hit = (data ?? []).find((r) => {
      if (r.dia !== s.dia) return false;
      const ini = (r.hora_inicio as string) ?? "";
      const fin = (r.hora_fin as string) ?? "";
      return s.franja === "mañana" ? ini < "13:00:00" : fin > "13:00:00";
    });
    if (hit) {
      const u = (Array.isArray(hit.usuarios) ? hit.usuarios[0] : hit.usuarios) as { nombre?: string } | null;
      if (u?.nombre) {
        const ini = ((hit.hora_inicio as string) ?? "").slice(0, 5);
        const fin = ((hit.hora_fin as string) ?? "").slice(0, 5);
        const horas = ini && fin ? ` ${ini}–${fin}` : "";
        return { nombre: u.nombre, slot: `${s.dia}${horas}` };
      }
    }
  }
  return null;
}

// Fallback cuando no hay match por agenda: primer agente de visitas del tenant.
async function primerVendedor(): Promise<string | null> {
  const { data } = await db.from("usuarios").select("nombre")
    .eq("inmobiliaria_id", INMO_ID).eq("rol", "agente_visitas").limit(1).maybeSingle();
  return (data?.nombre as string) ?? null;
}

async function registrarBusqueda(leadId: string | null, criterios: string, resultados: number): Promise<string | null> {
  if (!leadId) return null;
  const { data: lead } = await db.from("leads").select("nombre, etapa").eq("id", leadId).maybeSingle();
  const { data: bq, error } = await db.from("busquedas").insert({
    inmobiliaria_id: INMO_ID, lead_id: leadId, lead_label: lead?.nombre ?? null,
    criterios, fuentes: "Red Tokko", resultados, hora_label: horaLabel(),
  }).select("id").single();
  if (error) console.error("registrarBusqueda:", error.message);
  if (lead && lead.etapa === "Calificación") {
    await db.from("leads").update({ etapa: "Búsqueda" }).eq("id", leadId);
  }
  return (bq?.id as string) ?? null;
}

// Trazabilidad (regla del spec): por cada propiedad mostrada → upsert snapshot en `propiedades`
// + insert en `matches` (INMUTABLE, con el precio mostrado). Es la base del reparto de comisiones.
async function registrarMatches(leadId: string | null, busquedaId: string | null, props: Prop[]) {
  if (!INMO_ID) return;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    const tokkoId = p.id != null ? String(p.id) : null;
    if (!tokkoId) continue;
    const precio = typeof p.precio === "number" ? p.precio : null;
    const moneda = (typeof p.moneda === "string" && p.moneda) ? p.moneda : "USD";
    const fotos = Array.isArray(p.fotos)
      ? (p.fotos as unknown[]).filter((u): u is string => typeof u === "string")
      : (typeof p.foto === "string" && p.foto ? [p.foto as string] : []);
    const m2 = typeof p.sup_total === "number" ? Math.round(p.sup_total as number)
      : (typeof p.sup_cubierta === "number" ? Math.round(p.sup_cubierta as number) : null);

    const { error: ep } = await db.from("propiedades").upsert({
      inmobiliaria_id: INMO_ID, tokko_property_id: tokkoId,
      tipo: (p.tipo as string) ?? null,
      titulo: (p.direccion as string) ?? null,
      precio, moneda,
      zona: zonaCorta(p.ubicacion as string),
      direccion_aprox: (p.direccion as string) ?? null,
      m2,
      ambientes: typeof p.ambientes === "number" ? (p.ambientes as number) : null,
      dormitorios: typeof p.dormitorios === "number" ? (p.dormitorios as number) : null,
      amenities: (p.amenities && typeof p.amenities === "object") ? p.amenities : null,
      fotos: fotos.length ? fotos : null,
      tokko_url: (p.url as string) ?? null,
    }, { onConflict: "inmobiliaria_id,tokko_property_id" });
    if (ep) console.error("upsert propiedad:", ep.message);

    const { error: em } = await db.from("matches").insert({
      inmobiliaria_id: INMO_ID, lead_id: leadId, busqueda_id: busquedaId,
      tokko_property_id: tokkoId,
      match_score: typeof p.match === "number" ? (p.match as number) : null,
      posicion_ranking: i + 1,
      precio_mostrado: precio, moneda,
    });
    if (em) console.error("insert match:", em.message);
  }
}

async function responderBot(convId: string, chatId: number | string) {
  if (!anthropic && !GEMINI_KEY) return;
  const { data: conv } = await db.from("conversaciones").select("estado, lead_id, leads(ancla, disponibilidad)").eq("id", convId).maybeSingle();
  if (!conv || conv.estado !== "bot") return;
  const leadRow = (Array.isArray(conv.leads) ? conv.leads[0] : conv.leads) as { ancla?: string; disponibilidad?: string } | null | undefined;
  const ancla = leadRow?.ancla ?? null;

  const { data: msgs } = await db
    .from("mensajes").select("who, texto, card")
    .eq("conversacion_id", convId).order("enviado_at", { ascending: true });

  // Propiedades ya mostradas (guardadas en mensajes internos card='resultados_data').
  const shownKeys = new Set<string>();
  let ultimasMostradas: Prop[] = [];
  for (const m of msgs ?? []) {
    if (m.card === "resultados_data" && m.texto) {
      try {
        const arr = JSON.parse(m.texto as string) as Prop[];
        if (Array.isArray(arr)) {
          arr.forEach((p) => shownKeys.add(propKey(p)));
          ultimasMostradas = arr; // la última tanda = "las que ve ahora"
        }
      } catch { /* ignora */ }
    }
  }

  // Contexto para la IA: el hilo real, sin los mensajes internos de datos y sin
  // los mensajes de error/fallback (si no, la IA los ve repetidos y los copia → loop).
  let contents: GeminiContent[] = (msgs ?? [])
    .filter((m) => m.texto && m.card !== "resultados_data" && m.texto !== FALLBACK)
    .map((m) => ({ role: (m.who === "in" ? "user" : "model") as "user" | "model", parts: [{ text: m.texto as string }] }));
  const primerUser = contents.findIndex((c) => c.role === "user");
  if (primerUser < 0) return;
  contents = contents.slice(primerUser);

  const dolar = await getDolar();
  const mostradasTxt = ultimasMostradas.length ? ultimasMostradas.map((p, i) => fichaPrompt(p, i)).join("\n") : "";
  let reply = await llamarLLM(contents, dolar, ancla, mostradasTxt);

  // Etiqueta oculta de interés → guardamos la propiedad elegida como ancla del lead.
  const mi = reply.match(/\[\[INTERES:\s*([\s\S]*?)\]\]/i);
  if (mi) {
    const raw = mi[1].trim();
    reply = reply.replace(/\[\[INTERES:[\s\S]*?\]\]/i, "").trim();
    if (conv.lead_id) {
      // si es un número de opción, guardamos la FICHA completa (JSON) de esa propiedad;
      // si no, guardamos el texto tal cual (fallback).
      const idx = parseInt(raw, 10);
      const elegida = Number.isFinite(idx) ? ultimasMostradas[idx - 1] : undefined;
      const anclaValue = elegida ? JSON.stringify(elegida) : raw;
      if (anclaValue) await db.from("leads").update({ ancla: anclaValue }).eq("id", conv.lead_id as string);
    }
  }

  // Etiqueta oculta de fotos → juntamos VARIAS fotos de la(s) propiedad(es) pedida(s).
  // Se mandan al final (cada foto un mensaje) y se guardan en el panel (card='fotos').
  const fotosAEnviar: { url: string; caption?: string }[] = [];
  const fotosPanel: string[][] = []; // por propiedad: lista de urls (para mostrar en el panel)
  const mf = reply.match(/\[\[FOTOS:\s*([\s\S]*?)\]\]/i);
  if (mf) {
    const raw = mf[1].trim();
    reply = reply.replace(/\[\[FOTOS:[\s\S]*?\]\]/i, "").trim();
    const nums = /toda/i.test(raw)
      ? ultimasMostradas.map((_, i) => i + 1)
      : (raw.match(/\d+/g) ?? []).map((n: string) => parseInt(n, 10));
    for (const n of nums) {
      const p = ultimasMostradas[n - 1];
      if (!p) continue;
      // Varias fotos si el motor manda `fotos` (array); si no, la única `foto`.
      const urls = (Array.isArray(p.fotos) ? (p.fotos as unknown[]) : [])
        .filter((u): u is string => typeof u === "string" && !!u);
      if (!urls.length && typeof p.foto === "string" && p.foto) urls.push(p.foto as string);
      const top = urls.slice(0, 6);
      if (!top.length) continue;
      const caption = fichaCaption(p, n, dolar);
      top.forEach((url, i) => fotosAEnviar.push({ url, caption: i === 0 ? caption : undefined }));
      fotosPanel.push(top);
    }
  }

  // Etiqueta oculta de disponibilidad → la guardamos en el lead (para coordinar la visita).
  const md = reply.match(/\[\[DISPO:\s*([\s\S]*?)\]\]/i);
  if (md) {
    const dispo = md[1].trim();
    reply = reply.replace(/\[\[DISPO:[\s\S]*?\]\]/i, "").trim();
    if (conv.lead_id && dispo) await db.from("leads").update({ disponibilidad: dispo }).eq("id", conv.lead_id as string);
  }

  const ma = reply.match(/\[ASIGNAR:\s*([\s\S]*?)\]/i);
  if (ma) {
    let nombre = ma[1].trim();
    const auto = !nombre || /^(no|vos|uno|cualquiera|el que sea|cualq|alguno|el que pued|da igual)/i.test(nombre);
    let slotLabel: string | null = null;
    if (auto) {
      // Disponibilidad del cliente: la recién capturada (este turno) o la ya guardada.
      const dispoCliente = (md ? md[1].trim() : null) ?? leadRow?.disponibilidad ?? null;
      const m = dispoCliente ? await matchVendedor(parseDispo(dispoCliente)) : null;
      if (m) { nombre = m.nombre; slotLabel = m.slot; }
      else nombre = (await primerVendedor()) ?? "el equipo";
    }
    const reason = slotLabel ? `Visita ${slotLabel} · ${nombre}` : `Derivado a ${nombre}`;
    await asignarConv(convId, (conv.lead_id as string) ?? null, nombre, reason);
    reply = slotLabel
      ? `¡Listo! Lo coordinamos con ${nombre}, que tiene libre el ${slotLabel}. En un rato se contacta con vos para cerrar la visita. Cualquier cosa, acá estamos.`
      : `¡Listo! Lo coordinamos con ${nombre}. En un rato se contacta con vos para arreglar el día y horario de la visita. Cualquier cosa, acá estamos.`;
  } else {
    const m = reply.match(/\[BUSCAR:\s*([\s\S]+?)\]/i);
    if (m) {
      const query = m[1].trim();
      const encontradas = await buscarPropiedades(query);
      // Priorizar las que NO se mostraron antes → traer "nuevas".
      const nuevas = encontradas.filter((p) => !shownKeys.has(propKey(p)));
      const pool = nuevas.length ? nuevas : encontradas;
      // Respetamos el orden del motor (ya viene rankeado). Calculamos `match` solo como dato
      // (para matches.match_score), sin re-ordenar → consistente con el panel.
      const crit = criteriosDeQuery(query);
      const aMostrar = pool.slice(0, 5).map((p) => ({ ...p, match: scoreMatch(crit, p) }));
      const leadId = (conv.lead_id as string) ?? null;
      const busquedaId = await registrarBusqueda(leadId, query, aMostrar.length);
      // Trazabilidad para comisiones: snapshot en `propiedades` + `matches` inmutable.
      await registrarMatches(leadId, busquedaId, aMostrar);
      // Guardar las mostradas como estado interno (no va a Telegram ni al panel).
      if (aMostrar.length) {
        await db.from("mensajes").insert({
          inmobiliaria_id: INMO_ID, conversacion_id: convId,
          who: "bot", system: true, card: "resultados_data", texto: JSON.stringify(aMostrar), ts_label: horaLabel(),
        });
      }
      // Cada propiedad va como un mensaje aparte + el cierre. Cortamos acá (ya enviamos).
      await enviarMensajes(convId, chatId, formatearResultados(query, aMostrar, dolar));
      return;
    }
  }

  // Si fue el mensaje de error, lo mandamos pero NO lo guardamos: así no envenena
  // el contexto de la próxima respuesta (la IA lo veía repetido y lo copiaba).
  if (reply === FALLBACK) {
    await enviarTelegram(chatId, reply);
    return;
  }

  // PRIMERO las fotos (con las características en el caption), si pidió ver una propiedad.
  for (const f of fotosAEnviar) {
    await enviarFoto(chatId, f.url, f.caption ? sinEmojis(f.caption) : undefined);
  }
  // Guardarlas en el panel (card='fotos') para que el operador también las vea.
  for (const urls of fotosPanel) {
    await db.from("mensajes").insert({
      inmobiliaria_id: INMO_ID, conversacion_id: convId,
      who: "bot", agent: "bottelegram", card: "fotos", texto: JSON.stringify(urls), ts_label: horaLabel(),
    });
    await db.from("conversaciones").update({ ultimo_mensaje: "Te paso unas fotos", ultimo_label: horaLabel() }).eq("id", convId);
  }

  // DESPUÉS el texto (ej: la pregunta de si quiere ir a verla o prefiere ver otras opciones).
  // El bot puede mandar más de un mensaje corto seguido: los separa con [[NEXT]] (máx 3).
  const partes = reply.split(/\s*\[\[NEXT\]\]\s*/i).map((s: string) => s.trim()).filter(Boolean);
  await enviarMensajes(convId, chatId, partes.length ? partes.slice(0, 3) : [reply]);
}

type TgChat = { id: number; title?: string };
type TgFrom = { first_name?: string; last_name?: string; username?: string };
type TgMessage = { chat: TgChat; from?: TgFrom; text?: string; caption?: string };

async function findOrCreateLead(chat: TgChat, from?: TgFrom, ancla?: string) {
  const chatId = String(chat.id);
  const { data: ex } = await db.from("leads").select("id, ancla")
    .eq("inmobiliaria_id", INMO_ID).eq("canal_user_id", chatId).maybeSingle();
  if (ex) {
    // si vuelve a entrar por otro aviso, actualizamos la propiedad-ancla
    if (ancla && ancla !== ex.ancla) {
      await db.from("leads").update({ ancla, origen: "Campaña" }).eq("id", ex.id as string);
    }
    return ex.id as string;
  }
  const nombre = [from?.first_name, from?.last_name].filter(Boolean).join(" ") || from?.username || chat?.title || "Lead Telegram";
  const { data, error } = await db.from("leads").insert({
    inmobiliaria_id: INMO_ID, nombre, canal: "telegram", canal_user_id: chatId,
    etapa: "Calificación", score: 0, asignado_label: "bottelegram",
    origen: ancla ? "Campaña" : "Telegram", ancla: ancla ?? null,
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

// Convierte el payload del deep link en una etiqueta legible para la ancla.
// "casa-funes-2d" → "Casa funes 2d" · "8011577" → "la propiedad #8011577"
function prettifyAncla(payload: string): string {
  const raw = payload.trim();
  if (/^\d+$/.test(raw)) return `la propiedad #${raw}`;
  let s = raw;
  try { s = decodeURIComponent(raw); } catch { /* usa raw */ }
  s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "esa propiedad";
}

// Saludo inicial (al hacer /start). Si vino con ancla, lo ancla en esa propiedad.
async function saludoInicial(convId: string, chatId: number | string, ancla: string | null) {
  const saludo = ancla
    ? `¡Hola! Somos de ${INMO_NOMBRE}. Vi que te interesó ${ancla}. ¿La estás buscando para vos? Contanos qué necesitás y te damos una mano.`
    : `¡Hola! Somos de ${INMO_NOMBRE}. ¿Qué estás buscando? Contanos operación, zona y presupuesto y te ayudamos a encontrarlo.`;
  const msgId = await enviarTelegram(chatId, saludo);
  const ts = horaLabel();
  await db.from("mensajes").insert({
    inmobiliaria_id: INMO_ID, conversacion_id: convId, who: "bot", agent: "bottelegram", texto: saludo, ts_label: ts, canal_msg_id: msgId,
  });
  await db.from("conversaciones").update({ ultimo_mensaje: saludo.slice(0, 80), ultimo_label: ts }).eq("id", convId);
}

async function handleMessage(msg: TgMessage) {
  if (!(await getInmo())) { console.error("sin tenant para slug", SLUG); return; }
  const rawText = (msg.text ?? msg.caption ?? "").trim();

  // Deep link de campaña: /start <payload> → la propiedad-ancla del aviso.
  const startMatch = rawText.match(/^\/start(?:\s+(.+))?$/i);
  const ancla = startMatch && startMatch[1] ? prettifyAncla(startMatch[1].trim()) : undefined;

  const leadId = await findOrCreateLead(msg.chat, msg.from, ancla);
  const convId = await findOrCreateConv(leadId);

  if (startMatch) {
    // el /start no se guarda como mensaje del cliente: respondemos un saludo anclado
    await saludoInicial(convId, msg.chat.id, ancla ?? null);
    return;
  }

  const texto = rawText || "[mensaje sin texto]";
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
