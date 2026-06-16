// Conector Telegram → Honex (polling, sin webhook/túnel).
// Pregunta a Telegram por mensajes nuevos y los mete en la bandeja de Chats del
// tenant configurado (HONEX_TENANT_SLUG). Corré:  node scripts/telegram-poll.mjs
//
// El comprador escribe a @honexinmo_bot → acá aparece como mensaje entrante ('in')
// en una conversación. Si es la primera vez de ese usuario, se crea el lead + la conv.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- env ---
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
const TOKEN = env.TELEGRAM_BOT_TOKEN;
const SLUG = env.HONEX_TENANT_SLUG || "norte";
if (!TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN en .env.local");

// --- IA del bot (Gemini gratis ahora; Anthropic después con cambiar este bloque) ---
const GEMINI_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = env.GEMINI_MODEL || "gemini-2.5-flash";
const SEARCH_URL = env.N8N_SEARCH_WEBHOOK_URL || "https://n8n.tokko-finder.gachetponzellini.com/webhook/honex/search";
// Vendedor cuya cuenta de Tokko se usa para buscar (MVP). Después: mapeo por tenant.
const SEARCH_VENDEDOR = env.HONEX_SEARCH_VENDEDOR_ID || "25e94c02-03ee-4272-8003-57f6dcebd36c"; // Ubaldo

const db = createClient(SB_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
const API = `https://api.telegram.org/bot${TOKEN}`;
const OFFSET_FILE = new URL("./.tg-offset", import.meta.url);

// --- resolver tenant ---
const { data: inmo, error: eInmo } = await db
  .from("inmobiliarias").select("id, nombre").eq("slug", SLUG).maybeSingle();
if (eInmo || !inmo) throw new Error(`No encontré la inmobiliaria slug='${SLUG}'`);
const INMO_ID = inmo.id;
console.log(`Conector Telegram listo. Bot → ${inmo.nombre} (${SLUG}). Esperando mensajes…`);
console.log(GEMINI_KEY ? "  IA: Gemini ON (el bot responde)" : "  IA: OFF (falta GEMINI_API_KEY) — solo ingiere");

function horaLabel() {
  return new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

// ─────────────────────────────────────────────────────────────
// IA del bot
// ─────────────────────────────────────────────────────────────
const SYSTEM = `Sos el asistente virtual de ${inmo.nombre}, una inmobiliaria de Rosario. Atendés por chat a compradores que vienen de una campaña.

Tu objetivo es conversar natural y cálido (tuteo rioplatense, mensajes cortos, algún emoji) y CALIFICAR bien al comprador ANTES de buscar. Datos que necesitás juntar:
1) operación (venta o alquiler)
2) tipo (casa, departamento, PH, terreno, local…)
3) zona o ciudad
4) presupuesto (o rango)
5) ambientes o dormitorios

Cómo manejarte:
- Hacé UNA sola pregunta por mensaje. No abrumes.
- Si el comprador da MUY pocos datos (ej: solo "una casa", o solo una zona), NO busques todavía: pedile lo que falta, priorizando presupuesto y ambientes/dormitorios, que son los que más afinan la búsqueda. Mejor juntar buenos datos que buscar con poco y traer cualquier cosa.
- Cuando tengas los 5 datos base, antes de buscar preguntá UNA vez si hay alguna preferencia importante (cochera, a estrenar, cantidad de baños, balcón, patio, etc.). Si dice que no, o "mostrame lo que haya", buscá igual.
- Cuando ya tengas un panorama razonable, respondé ÚNICAMENTE con una línea con este formato EXACTO, sin nada más:
[BUSCAR: <frase con TODOS los datos: operación, tipo, zona, presupuesto, ambientes/dormitorios y las preferencias que haya dado>]
Ejemplo: [BUSCAR: Casa en venta en Funes, 3 dormitorios, 2 baños, con cochera, hasta 200000 USD]
- Si después de ver resultados el comprador quiere agregar o cambiar detalles, incorporá lo nuevo y volvé a emitir un [BUSCAR: ...] actualizado.

Asignación de vendedor:
- Cuando el comprador quiera AVANZAR con una propiedad (le interesa una, quiere visitarla, o pide hablar con alguien), ofrecele un vendedor que lo atienda. Decile algo como: "Te asigno un vendedor para que coordine con vos 🙌 ¿Conocés a alguien de nuestro equipo? Decime el nombre. Si no, te asigno uno yo."
- Cuando el comprador te diga el nombre de un vendedor, o te pida que le asignes uno vos (o diga que no conoce a ninguno), respondé ÚNICAMENTE con una línea con este formato EXACTO, sin nada más:
[ASIGNAR: <nombre del vendedor; dejalo VACÍO si el comprador no sabe y querés que asignemos nosotros>]
Ejemplos: [ASIGNAR: Ubaldo]  ·  si no sabe: [ASIGNAR: ]`;

async function llamarGemini(contents) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_instruction: { parts: [{ text: SYSTEM }] }, contents }),
  });
  const json = await res.json();
  if (!res.ok) {
    console.error("  ! gemini:", JSON.stringify(json).slice(0, 300));
    return "Disculpá, tuve un problemita. ¿Me lo repetís?";
  }
  const text = (json?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text).join("").trim();
  return text || "¿Me contás un poco más qué estás buscando?";
}

async function buscarPropiedades(query) {
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
    console.error("  ! buscar:", e.message);
    return [];
  }
}

function formatearResultados(query, props) {
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

// El bot asigna la conversación a un vendedor: marca el label, pasa a estado
// 'visita' (aparece en Acciones) y mueve la etapa del lead a Visita. A partir de
// ahí el bot deja de auto-responder (el vendedor toma la conversación).
async function asignarConv(convId, leadId, vendedor) {
  try {
    await db.from("conversaciones").update({
      asignado_label: vendedor, estado: "visita", reason: `Derivado a ${vendedor}`,
    }).eq("id", convId);
    if (leadId) {
      await db.from("leads").update({ asignado_label: vendedor, etapa: "Visita" }).eq("id", leadId);
    }
    console.log(`  → asignado a ${vendedor} (estado visita)`);
  } catch (e) {
    console.error("  ! asignarConv:", e.message);
  }
}

// Registra la búsqueda en `busquedas` (queda visible en el panel) y, si el lead
// estaba en Calificación, el bot lo MUEVE solo a Búsqueda (detecta la etapa).
async function registrarBusqueda(leadId, criterios, resultados) {
  if (!leadId) return;
  try {
    const { data: lead } = await db.from("leads").select("nombre, etapa").eq("id", leadId).maybeSingle();
    await db.from("busquedas").insert({
      inmobiliaria_id: INMO_ID, lead_id: leadId, lead_label: lead?.nombre ?? null,
      criterios, fuentes: "Red Tokko", resultados, hora_label: horaLabel(),
    });
    if (lead && lead.etapa === "Calificación") {
      await db.from("leads").update({ etapa: "Búsqueda" }).eq("id", leadId);
      console.log(`  ↑ etapa: ${lead.nombre} → Búsqueda`);
    }
  } catch (e) {
    console.error("  ! registrarBusqueda:", e.message);
  }
}

async function enviarTelegram(chatId, text) {
  await fetch(`${API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

// Genera y manda la respuesta del bot, si el chat lo maneja el bot.
async function responderBot(convId, chatId) {
  if (!GEMINI_KEY) return; // sin IA configurada, solo ingiere

  const { data: conv } = await db.from("conversaciones").select("estado, lead_id").eq("id", convId).maybeSingle();
  if (!conv || conv.estado !== "bot") return; // si lo tomó un humano, el bot no pisa

  const { data: msgs } = await db
    .from("mensajes").select("who, texto")
    .eq("conversacion_id", convId).order("enviado_at", { ascending: true });

  let contents = (msgs ?? [])
    .filter((m) => m.texto)
    .map((m) => ({ role: m.who === "in" ? "user" : "model", parts: [{ text: m.texto }] }));
  const primerUser = contents.findIndex((c) => c.role === "user");
  if (primerUser < 0) return;
  contents = contents.slice(primerUser);

  let reply = await llamarGemini(contents);

  // ¿el bot decidió asignar un vendedor?
  const ma = reply.match(/\[ASIGNAR:\s*([\s\S]*?)\]/i);
  if (ma) {
    let nombre = ma[1].trim();
    if (!nombre || /^(no|vos|uno|cualquiera|el que sea)/i.test(nombre)) nombre = "Ubaldo";
    await asignarConv(convId, conv.lead_id, nombre);
    reply = `¡Listo! Te asigné a ${nombre} 🙌 En breve se contacta con vos para coordinar la visita. ¡Gracias por escribirnos!`;
  } else {
    // ¿el bot decidió buscar?
    const m = reply.match(/\[BUSCAR:\s*([\s\S]+?)\]/i);
    if (m) {
      const query = m[1].trim();
      console.log(`  ⌕ bot busca: "${query}"`);
      const props = await buscarPropiedades(query);
      reply = formatearResultados(query, props);
      await registrarBusqueda(conv.lead_id, query, props.length);
    }
  }

  await enviarTelegram(chatId, reply);
  const ts = horaLabel();
  await db.from("mensajes").insert({
    inmobiliaria_id: INMO_ID, conversacion_id: convId,
    who: "bot", agent: "bottelegram", texto: reply, ts_label: ts,
  });
  await db.from("conversaciones").update({
    ultimo_mensaje: reply.slice(0, 80), ultimo_label: ts,
  }).eq("id", convId);
  console.log(`  ← bot: "${reply.slice(0, 60).replace(/\n/g, " ")}…"`);
}

async function findOrCreateLead(chat, from) {
  const chatId = String(chat.id);
  const { data: ex } = await db
    .from("leads").select("id")
    .eq("inmobiliaria_id", INMO_ID).eq("canal_user_id", chatId).maybeSingle();
  if (ex) return ex.id;
  const nombre = [from?.first_name, from?.last_name].filter(Boolean).join(" ")
    || from?.username || chat?.title || "Lead Telegram";
  const { data, error } = await db.from("leads").insert({
    inmobiliaria_id: INMO_ID, nombre, canal: "telegram", canal_user_id: chatId,
    etapa: "Calificación", score: 0, asignado_label: "bottelegram", origen: "Telegram",
  }).select("id").single();
  if (error) throw new Error("crear lead: " + error.message);
  console.log(`  + nuevo lead: ${nombre} (${chatId})`);
  return data.id;
}

async function findOrCreateConv(leadId) {
  const { data: ex } = await db
    .from("conversaciones").select("id").eq("lead_id", leadId).maybeSingle();
  if (ex) return ex.id;
  const { data, error } = await db.from("conversaciones").insert({
    inmobiliaria_id: INMO_ID, lead_id: leadId, estado: "bot",
    asignado_label: "bottelegram", unread: 0, ultimo_mensaje: "", ultimo_label: "",
  }).select("id").single();
  if (error) throw new Error("crear conv: " + error.message);
  return data.id;
}

async function handleMessage(msg) {
  const texto = msg.text ?? (msg.caption ?? "[mensaje sin texto]");
  const leadId = await findOrCreateLead(msg.chat, msg.from);
  const convId = await findOrCreateConv(leadId);
  const ts = horaLabel();
  await db.from("mensajes").insert({
    inmobiliaria_id: INMO_ID, conversacion_id: convId,
    who: "in", texto, ts_label: ts,
  });
  // bump del preview + no leídos
  const { data: c } = await db.from("conversaciones").select("unread").eq("id", convId).maybeSingle();
  await db.from("conversaciones").update({
    ultimo_mensaje: texto, ultimo_label: ts, unread: (c?.unread ?? 0) + 1,
  }).eq("id", convId);
  console.log(`  → mensaje de ${msg.from?.first_name ?? "?"}: "${texto}"`);

  // el bot responde (si hay IA configurada y el chat lo maneja el bot)
  try { await responderBot(convId, msg.chat.id); } catch (e) { console.error("  ! responder:", e.message); }
}

let offset = existsSync(OFFSET_FILE) ? Number(readFileSync(OFFSET_FILE, "utf8")) || 0 : 0;

async function loop() {
  while (true) {
    try {
      const url = `${API}/getUpdates?timeout=30${offset ? "&offset=" + offset : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json.ok) { console.error("getUpdates error:", json.description); await sleep(2000); continue; }
      for (const u of json.result) {
        offset = u.update_id + 1;
        writeFileSync(OFFSET_FILE, String(offset));
        const msg = u.message ?? u.edited_message;
        if (msg) { try { await handleMessage(msg); } catch (e) { console.error("  ! error:", e.message); } }
      }
    } catch (e) {
      console.error("loop error:", e.message);
      await sleep(2000);
    }
  }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
await loop();
