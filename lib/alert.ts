// Reporte de errores: SIEMPRE loguea (queda en los logs de Vercel), y si está configurado
// ALERT_WEBHOOK_URL (Discord/Slack/etc.) también manda una alerta → te enterás cuando algo falla
// en producción (el motor cae, el bot rompe, etc.). Sin la env, es solo log: no rompe nada.

const ALERT_URL = process.env.ALERT_WEBHOOK_URL || "";

export async function reportarError(contexto: string, error: unknown): Promise<void> {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[${contexto}]`, msg);
  if (!ALERT_URL) return;
  try {
    await fetch(ALERT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Formato Discord (`content`). Para Slack sería `text`.
      body: JSON.stringify({ content: `🔴 Honex · ${contexto}: ${msg}`.slice(0, 1900) }),
    });
  } catch {
    /* si la alerta falla, no rompemos el flujo */
  }
}
