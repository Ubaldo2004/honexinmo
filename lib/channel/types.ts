// Adapter de canal de mensajería. Una sola firma; dos implementaciones detrás.
// Hoy se implementará TelegramChannel; mañana WhatsAppChannel (360dialog) SIN
// tocar la lógica del bot. La implementación es fase 2 — acá queda solo la interfaz.
//
// Tres reglas que ya se respetan en el modelo para que WhatsApp entre sin rework:
//  1. Identidad: el PK del lead es un UUID interno, NUNCA el teléfono.
//     Se guarda `canal` + `canal_user_id` + `telefono` (puede ser null en Telegram).
//     WhatsApp identifica por E.164.
//  2. Reply vs proactive: cada saliente se marca. En WhatsApp los `proactive`
//     necesitan template aprobado.
//  3. Botones degradables: toda respuesta con botones cae a texto plano si el canal
//     no los soporta (WhatsApp: máx 3 botones / listas con límites).

export type ChannelKind = "telegram" | "whatsapp";

/** Referencia estable a un lead, independiente del teléfono. */
export interface LeadRef {
  leadId: string; // UUID interno
  canal: ChannelKind;
  canalUserId: string; // chat_id de Telegram / wa_id de WhatsApp
}

export interface IncomingMessage {
  leadRef: LeadRef;
  text: string;
  media?: { kind: "image" | "audio" | "document"; url: string }[];
  channel: ChannelKind;
}

export interface OutgoingButton {
  id: string;
  label: string;
}

export interface OutgoingMessage {
  leadRef: LeadRef;
  text: string;
  buttons?: OutgoingButton[];
  type: "reply" | "proactive";
}

export interface Channel {
  readonly kind: ChannelKind;
  /** Envía un saliente. Implementación degrada botones a texto si el canal no los soporta. */
  send(msg: OutgoingMessage): Promise<void>;
}
