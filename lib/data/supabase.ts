// Implementación Supabase del repositorio. Misma interfaz que el mock.
// Lee con un cliente scopeado por la sesión del usuario → RLS filtra por tenant + rol.
// Los datos de negocio salen de la DB; piezas/roles/kpis/embudo/demanda quedan como
// config/presentación estática por ahora (no son data de tenant todavía).

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  HonexRepository,
  Pieza,
  Kpi,
  FunnelStep,
  Conversacion,
  MensajeHilo,
  Resultado,
  Accion,
  Lead,
  Busqueda,
  Ancla,
  Operacion,
  Visita,
  VisitaItem,
  Rol,
  Prioridad,
  EstadoConversacion,
} from "./types";
import { PIEZAS, ROLES } from "./seed-data";

function precioStr(n: number | null, moneda: string | null): string {
  if (n == null) return "";
  return `${moneda ?? "USD"} ${Math.round(n).toLocaleString("es-AR")}`;
}

const TIPO_ACCION: Record<string, string> = {
  visita: "Coordinar visita",
  handoff: "Handoff",
  operacion: "Operación",
};

// Mood = situación del lead, derivada del estado real de la conversación.
const MOOD_POR_ESTADO: Record<string, string> = {
  bot: "En conversación",
  visita: "Espera visita",
  handoff: "Necesita atención",
  seguimiento: "En seguimiento",
  operacion: "Avanzando operación",
};

export class SupabaseRepository implements HonexRepository {
  constructor(private db: SupabaseClient) {}

  async getRoles(): Promise<Rol[]> { return ROLES; }

  // ---- Piezas: la identidad es estática, pero la métrica sale de la data real del tenant ----
  async getPiezas(): Promise<Pieza[]> {
    const [convs, msgs, busq, vis] = await Promise.all([
      this.db.from("conversaciones").select("*", { count: "exact", head: true }),
      this.db.from("mensajes").select("*", { count: "exact", head: true }),
      this.db.from("busquedas").select("*", { count: "exact", head: true }),
      this.db.from("visitas").select("*", { count: "exact", head: true }).not("analisis", "is", null),
    ]);
    const metricas: Record<string, string> = {
      orquestador: `${convs.count ?? 0} chats · ${msgs.count ?? 0} mensajes`,
      motor: `${busq.count ?? 0} búsquedas en la red`,
      analista: `${vis.count ?? 0} visitas analizadas`,
    };
    return PIEZAS.map((p) => ({ ...p, metric: metricas[p.key] ?? p.metric }));
  }

  // ---- Demanda real: mensajes entrantes por hora del día (zona AR) ----
  async getDemanda(): Promise<number[]> {
    const buckets = new Array(24).fill(0);
    const { data } = await this.db.from("mensajes").select("enviado_at").eq("who", "in");
    const fmt = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });
    for (const m of data ?? []) {
      const iso = m.enviado_at as string | null;
      if (!iso) continue;
      const h = parseInt(fmt.format(new Date(iso)), 10) % 24;
      if (Number.isFinite(h) && h >= 0 && h < 24) buckets[h]++;
    }
    return buckets;
  }

  // ---- KPIs derivados de la data real del tenant (RLS) ----
  async getKpis(): Promise<Kpi[]> {
    const [convsRes, leadsRes] = await Promise.all([
      this.db.from("conversaciones").select("estado, unread"),
      this.db.from("leads").select("id"),
    ]);
    const convs = (convsRes.data ?? []) as { estado: string; unread: number | null }[];
    const leadsN = (leadsRes.data ?? []).length;
    const cnt = (e: string) => convs.filter((c) => c.estado === e).length;
    const sinLeer = convs.reduce((a, c) => a + (c.unread ?? 0), 0);
    const porAtender = cnt("visita") + cnt("handoff");

    return [
      { k: "Leads", v: String(leadsN), d: "" },
      { k: "Chats", v: String(convs.length), d: "" },
      { k: "Sin leer", v: String(sinLeer), d: sinLeer ? "requieren atención" : "al día", warn: sinLeer > 0 },
      { k: "Bot activo", v: String(cnt("bot")), d: "" },
      { k: "Por atender", v: String(porAtender), d: porAtender ? "visita / handoff" : "", warn: porAtender > 0 },
      { k: "En operación", v: String(cnt("operacion")), d: "" },
    ];
  }

  // ---- Embudo: leads por etapa, real ----
  async getFunnel(): Promise<FunnelStep[]> {
    const { data } = await this.db.from("leads").select("etapa");
    const leads = (data ?? []) as { etapa: string | null }[];
    const ETAPAS = ["Calificación", "Búsqueda", "Visita", "Seguimiento", "Operación"];
    const counts = ETAPAS.map((e) => ({ k: e, v: leads.filter((l) => l.etapa === e).length }));
    const max = Math.max(1, ...counts.map((c) => c.v));
    return counts.map((c) => ({ k: c.k, v: c.v, pct: Math.round((c.v / max) * 100) }));
  }

  // ---- tenant data (RLS) ----
  async getConversaciones(): Promise<Conversacion[]> {
    const { data, error } = await this.db
      .from("conversaciones")
      .select("id, lead_id, estado, reason, priority, asignado_label, unread, ultimo_mensaje, ultimo_label, leads(nombre, telefono, ancla, origen, mood, score, disponibilidad)")
      .order("ultimo_label", { ascending: false });
    if (error) throw error;

    // Última búsqueda (criterios) por lead → referencia para el vendedor en el handoff.
    const leadIds = (data ?? []).map((r) => r.lead_id as string).filter(Boolean);
    const critByLead: Record<string, string> = {};
    if (leadIds.length) {
      const { data: bq } = await this.db
        .from("busquedas").select("lead_id, criterios, creada_at")
        .in("lead_id", leadIds).order("creada_at", { ascending: false });
      for (const b of bq ?? []) {
        const lid = b.lead_id as string;
        if (lid && !(lid in critByLead)) critByLead[lid] = (b.criterios as string) ?? "";
      }
    }

    return (data ?? []).map((r): Conversacion => {
      const lraw = Array.isArray(r.leads) ? r.leads[0] : r.leads;
      const l = (lraw ?? {}) as unknown as Record<string, unknown>;
      return {
        id: r.id as string,
        nombre: (l.nombre as string) ?? "—",
        tel: (l.telefono as string) ?? "",
        ancla: (l.ancla as string) ?? "",
        origen: (l.origen as string) ?? "",
        last: (r.ultimo_mensaje as string) ?? "",
        t: (r.ultimo_label as string) ?? "",
        unread: (r.unread as number) ?? 0,
        estado: r.estado as EstadoConversacion,
        reason: (r.reason as string) ?? undefined,
        priority: (r.priority as Prioridad) ?? undefined,
        asignado: (r.asignado_label as string) ?? "bot",
        mood: MOOD_POR_ESTADO[r.estado as string] ?? (l.mood as string) ?? "—",
        score: (l.score as number) ?? 0,
        disponibilidad: (l.disponibilidad as string) ?? undefined,
        criteriosBusqueda: critByLead[r.lead_id as string] ?? undefined,
      };
    });
  }

  async getConversacion(id: string): Promise<Conversacion | null> {
    const all = await this.getConversaciones();
    return all.find((c) => c.id === id) ?? null;
  }

  async getHilosByConversacion(): Promise<Record<string, MensajeHilo[]>> {
    const { data, error } = await this.db
      .from("mensajes")
      .select("conversacion_id, who, agent, texto, card, system, ts_label")
      .order("enviado_at", { ascending: true });
    if (error) throw error;
    const out: Record<string, MensajeHilo[]> = {};
    for (const m of data ?? []) {
      if (m.card === "resultados_data") continue; // estado interno del bot (no se muestra)
      const cid = m.conversacion_id as string;
      (out[cid] ??= []).push({
        who: m.who as "bot" | "in",
        agent: (m.agent as string) ?? undefined,
        t: m.texto as string,
        ts: (m.ts_label as string) ?? "",
        card: (m.card as "ficha" | "resultados") ?? undefined,
        system: !!m.system,
      });
    }
    return out;
  }

  async getResultados(): Promise<Resultado[]> {
    const { data: matches, error } = await this.db
      .from("matches")
      .select("tokko_property_id, match_score, posicion_ranking, precio_mostrado, moneda")
      .order("posicion_ranking", { ascending: true })
      .limit(3);
    if (error) throw error;
    const ids = (matches ?? []).map((m) => m.tokko_property_id as string);
    const { data: props } = await this.db
      .from("propiedades")
      .select("tokko_property_id, titulo, zona")
      .in("tokko_property_id", ids.length ? ids : ["—"]);
    const byId = new Map((props ?? []).map((p) => [p.tokko_property_id as string, p]));
    return (matches ?? []).map((m): Resultado => {
      const p = byId.get(m.tokko_property_id as string);
      return {
        match: (m.match_score as number) ?? 0,
        t: (p?.titulo as string) ?? (m.tokko_property_id as string),
        zona: (p?.zona as string) ?? "",
        precio: precioStr(m.precio_mostrado as number, m.moneda as string),
        src: "Red Tokko",
      };
    });
  }

  async getAcciones(): Promise<Accion[]> {
    const { data, error } = await this.db
      .from("conversaciones")
      .select("id, estado, reason, priority, ultimo_label, leads(nombre)")
      .in("estado", ["visita", "handoff", "operacion"]);
    if (error) throw error;
    return (data ?? []).map((r): Accion => {
      const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
      return {
      id: r.id as string,
      lead: ((lead as { nombre?: string } | null)?.nombre) ?? "—",
      tipo: TIPO_ACCION[r.estado as string] ?? (r.estado as string),
      detalle: (r.reason as string) ?? "",
      priority: ((r.priority as Prioridad) ?? "medium"),
      t: (r.ultimo_label as string) ?? "",
      };
    });
  }

  async getLeads(): Promise<Lead[]> {
    const { data, error } = await this.db
      .from("leads")
      .select("id, nombre, telefono, etapa, score, ancla, origen, asignado_label, ultima_actividad")
      .order("creado_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r): Lead => ({
      id: r.id as string,
      nombre: r.nombre as string,
      tel: (r.telefono as string) ?? "",
      etapa: r.etapa as string,
      score: (r.score as number) ?? 0,
      ancla: (r.ancla as string) ?? "",
      origen: (r.origen as string) ?? "",
      asignado: (r.asignado_label as string) ?? "bot",
      act: (r.ultima_actividad as string) ?? "",
    }));
  }

  async getBusquedas(): Promise<Busqueda[]> {
    const { data, error } = await this.db
      .from("busquedas")
      .select("lead_label, criterios, ancla, fuentes, resultados, hora_label, leads(ancla)")
      .order("creada_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r): Busqueda => {
      const l = (Array.isArray(r.leads) ? r.leads[0] : r.leads) as { ancla?: string } | null;
      // la ancla del lead (la propiedad que lo trajo) es lo que mostramos; si está,
      // la página le aplica anclaLabel(). Fallback a la columna ancla de la búsqueda.
      return {
        lead: (r.lead_label as string) ?? "",
        criterios: (r.criterios as string) ?? "",
        ancla: (l?.ancla as string) ?? (r.ancla as string) ?? "",
        fuentes: (r.fuentes as string) ?? "",
        resultados: (r.resultados as number) ?? 0,
        t: (r.hora_label as string) ?? "",
      };
    });
  }

  async getAnclas(): Promise<Ancla[]> {
    const { data, error } = await this.db
      .from("anclas")
      .select("tipo, prop, precio, variante, leads, visitas, web, tokko, estado");
    if (error) throw error;
    return (data ?? []).map((r): Ancla => ({
      tipo: r.tipo as string,
      prop: r.prop as string,
      precio: (r.precio as string) ?? "",
      variante: (r.variante as string) ?? "",
      leads: (r.leads as number) ?? 0,
      visitas: (r.visitas as number) ?? 0,
      web: !!r.web,
      tokko: !!r.tokko,
      estado: (r.estado as "ganadora" | "testeando") ?? "testeando",
    }));
  }

  async getOperaciones(): Promise<Operacion[]> {
    const { data, error } = await this.db
      .from("operaciones")
      .select("id, prop, cliente, colega, monto, comision, split, estado");
    if (error) throw error;
    return (data ?? []).map((r): Operacion => ({
      id: r.id as string,
      prop: (r.prop as string) ?? "",
      cliente: (r.cliente as string) ?? "",
      colega: (r.colega as string) ?? "",
      monto: (r.monto as string) ?? "",
      comision: (r.comision as string) ?? "",
      split: (r.split as string) ?? "",
      estado: (r.estado as string) ?? "",
    }));
  }

  async getVisita(): Promise<Visita> {
    const { data, error } = await this.db
      .from("visitas")
      .select("lead_label, prop, agente, fecha, transcripto, analisis")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return {
        lead: "—", prop: "—", agente: "—", fecha: "—", transcripto: false,
        analisis: { perfil: "Sin visitas cargadas.", preguntas: [], objeciones: [], siguiente: "—", prob: 0 },
      };
    }
    return {
      lead: (data.lead_label as string) ?? "—",
      prop: (data.prop as string) ?? "—",
      agente: (data.agente as string) ?? "—",
      fecha: (data.fecha as string) ?? "—",
      transcripto: !!data.transcripto,
      analisis: data.analisis as Visita["analisis"],
    };
  }

  async getVisitas(): Promise<VisitaItem[]> {
    const { data, error } = await this.db
      .from("visitas")
      .select("id, lead_id, lead_label, prop, agente, fecha, audio_path, transcripto_texto, duracion_seg, analisis, leads(nombre)")
      .order("creada_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r): VisitaItem => {
      const l = (Array.isArray(r.leads) ? r.leads[0] : r.leads) as { nombre?: string } | null;
      return {
        id: r.id as string,
        leadId: (r.lead_id as string) ?? null,
        lead: l?.nombre ?? (r.lead_label as string) ?? "—",
        prop: (r.prop as string) ?? "",
        agente: (r.agente as string) ?? "",
        fecha: (r.fecha as string) ?? "",
        audioPath: (r.audio_path as string) ?? null,
        transcripto: (r.transcripto_texto as string) ?? null,
        duracionSeg: (r.duracion_seg as number) ?? null,
        analisis: (r.analisis as VisitaItem["analisis"]) ?? null,
      };
    });
  }
}
