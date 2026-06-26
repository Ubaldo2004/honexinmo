// Cliente del WhatsApp Gateway (Evolution API v2.3.7 → WhatsApp Cloud API oficial de Meta).
// Doc de referencia: gachetponzellini/whatsapp-gateway-brain · docs/api.md
//
// Está TODO listo pero PARQUEADO: si faltan las env (número aún no aprobado en Meta),
// `waConfigured()` da false y nada se activa. Cuando esté aprobado, se setean las env y listo.
//
// Variables de entorno (en Vercel, cuando esté el número):
//   WA_GATEWAY_URL   base del gateway (default https://wa.gachetponzellini.com)
//   WA_API_KEY       apikey de Evolution (Bitwarden: whatsapp-gateway · evolution · api-key)
//   WA_INSTANCE      nombre de la instancia del número de la inmobiliaria

const WA_URL = (process.env.WA_GATEWAY_URL || "https://wa.gachetponzellini.com").replace(/\/$/, "");
const WA_KEY = process.env.WA_API_KEY || "";
const WA_INSTANCE = process.env.WA_INSTANCE || "";

/** true solo si están la API key y la instancia → el canal WhatsApp está activo. */
export function waConfigured(): boolean {
  return !!(WA_KEY && WA_INSTANCE);
}

/** Destino en E.164 SIN "+" (ej: 5491122334455). Limpia el "+", espacios y el sufijo @s.whatsapp.net. */
export function waNumero(jidOrNumber: string): string {
  return String(jidOrNumber).split("@")[0].replace(/\D/g, "");
}

/**
 * Envía texto. OJO: WhatsApp solo permite texto libre DENTRO de la ventana de 24h
 * (contada desde el último mensaje del usuario). Fuera de eso hay que usar un template aprobado.
 * Devuelve el id del mensaje (.key.id) o null.
 */
export async function waEnviarTexto(number: string, text: string): Promise<string | null> {
  if (!waConfigured()) return null;
  try {
    const r = await fetch(`${WA_URL}/message/sendText/${WA_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: WA_KEY },
      body: JSON.stringify({ number: waNumero(number), text }),
    });
    const j = await r.json().catch(() => ({}));
    return (j?.key?.id as string) ?? null;
  } catch {
    return null;
  }
}

/** Envía una foto por URL, con caption opcional. (Evolution: POST /message/sendMedia/{instance}). */
export async function waEnviarFoto(number: string, url: string, caption?: string): Promise<void> {
  if (!waConfigured()) return;
  try {
    await fetch(`${WA_URL}/message/sendMedia/${WA_INSTANCE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: WA_KEY },
      body: JSON.stringify({ number: waNumero(number), mediatype: "image", media: url, caption: caption || undefined }),
    });
  } catch {
    /* si falla, seguimos */
  }
}

export type WAInbound = { from: string; text: string; nombre?: string };

/**
 * Parsea un evento entrante de Evolution (messages.upsert) → { from, text, nombre } o null.
 * Ignora: lo que mandamos nosotros (fromMe), grupos (@g.us) y los que no son texto.
 */
export function parseEvolutionInbound(body: unknown): WAInbound | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const event = b.event as string | undefined;
  if (event && !/messages[._]upsert/i.test(event)) return null;

  const dataRaw = b.data;
  const data = (Array.isArray(dataRaw) ? dataRaw[0] : dataRaw) as Record<string, unknown> | undefined;
  if (!data) return null;

  const key = (data.key ?? {}) as Record<string, unknown>;
  if (key.fromMe) return null; // lo enviamos nosotros → ignorar
  const jid = key.remoteJid as string | undefined;
  if (!jid || /@g\.us$/.test(jid)) return null; // sin remitente o grupo → ignorar

  const msg = (data.message ?? {}) as Record<string, unknown>;
  const ext = (msg.extendedTextMessage ?? {}) as Record<string, unknown>;
  const img = (msg.imageMessage ?? {}) as Record<string, unknown>;
  const text =
    (msg.conversation as string) ||
    (ext.text as string) ||
    (img.caption as string) ||
    "";
  if (!text.trim()) return null;

  return { from: waNumero(jid), text: text.trim(), nombre: (data.pushName as string) || undefined };
}
