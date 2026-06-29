// Envío de mensajes de Telegram, reutilizable fuera del webhook del bot (ej: el cron de
// seguimiento manda recordatorios proactivos). Mantiene la firma simple: chat + texto + token.
// Cuando entre WhatsApp, el cron usará el adapter de canal en vez de esto (ver lib/channel).

const API = (token: string) => `https://api.telegram.org/bot${token}`;

// Manda un texto a un chat. Devuelve el message_id o null si falló (no lanza: el llamador
// decide qué hacer; en un cron no queremos que un envío fallido corte el resto del barrido).
export async function enviarTelegramTexto(
  chatId: string | number,
  texto: string,
  token: string
): Promise<number | null> {
  if (!token || !chatId || !texto) return null;
  try {
    const r = await fetch(`${API(token)}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: texto }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return null;
    return (j?.result?.message_id as number) ?? null;
  } catch {
    return null;
  }
}
