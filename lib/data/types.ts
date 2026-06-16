// Modelos de dominio del panel Honex.
// Derivados del mock de honex-app (data.ts). Los nombres de campo son provisorios:
// el mapeo fino a columnas de Supabase se ACUERDA antes de migrar (no inventar).

export type EstadoConversacion =
  | "bot"
  | "visita"
  | "handoff"
  | "seguimiento"
  | "operacion";

export type Prioridad = "critical" | "high" | "medium" | "low";

export interface Pieza {
  key: string;
  nombre: string;
  tipo: "agente" | "motor";
  rol: string;
  icon: "Bot" | "Search" | "Brain";
  estado: "online" | "idle" | "offline";
  metric: string;
  color: string;
}

export interface Kpi {
  k: string;
  v: string;
  d: string;
  warn?: boolean;
}

export interface FunnelStep {
  k: string;
  v: number;
  pct: number;
}

export interface Conversacion {
  id: string;
  nombre: string;
  tel: string;
  ancla: string;
  origen: string;
  last: string;
  t: string;
  unread: number;
  estado: EstadoConversacion;
  reason?: string;
  priority?: Prioridad;
  asignado: string;
  mood: string;
  score: number;
  abierta?: boolean;
}

export interface MensajeHilo {
  who: "bot" | "in";
  agent?: string;
  t: string;
  ts: string;
  card?: "ficha" | "resultados";
  system?: boolean;
}

export interface Resultado {
  match: number;
  t: string;
  zona: string;
  precio: string;
  src: string;
}

export interface Accion {
  id: string;
  lead: string;
  tipo: string;
  detalle: string;
  priority: Prioridad;
  t: string;
}

export interface Lead {
  id?: string;
  nombre: string;
  tel: string;
  etapa: string;
  score: number;
  ancla: string;
  origen: string;
  asignado: string;
  act: string;
}

export interface Busqueda {
  lead: string;
  criterios: string;
  ancla: string;
  fuentes: string;
  resultados: number;
  t: string;
}

export interface Ancla {
  tipo: string;
  prop: string;
  precio: string;
  variante: string;
  leads: number;
  visitas: number;
  web: boolean;
  tokko: boolean;
  estado: "ganadora" | "testeando";
}

export interface Operacion {
  prop: string;
  cliente: string;
  colega: string;
  monto: string;
  comision: string;
  split: string;
  estado: string;
}

export interface Visita {
  lead: string;
  prop: string;
  agente: string;
  fecha: string;
  transcripto: boolean;
  analisis: {
    perfil: string;
    preguntas: string[];
    objeciones: string[];
    siguiente: string;
    prob: number;
  };
}

export interface Rol {
  r: string;
  d: string;
}

/**
 * Toda lectura/escritura del panel pasa por este repositorio — NUNCA por llamadas
 * directas en los componentes. Hoy: implementación mock. Mañana: Supabase.
 * Cambiar de una a otra no debe tocar la UI.
 */
export interface HonexRepository {
  getPiezas(): Promise<Pieza[]>;
  getKpis(): Promise<Kpi[]>;
  getFunnel(): Promise<FunnelStep[]>;
  getDemanda(): Promise<number[]>;
  getConversaciones(): Promise<Conversacion[]>;
  getConversacion(id: string): Promise<Conversacion | null>;
  /** Mensajes de cada conversación, indexados por conversacion_id. */
  getHilosByConversacion(): Promise<Record<string, MensajeHilo[]>>;
  getResultados(): Promise<Resultado[]>;
  getAcciones(): Promise<Accion[]>;
  getLeads(): Promise<Lead[]>;
  getBusquedas(): Promise<Busqueda[]>;
  getAnclas(): Promise<Ancla[]>;
  getOperaciones(): Promise<Operacion[]>;
  getVisita(): Promise<Visita>;
  getRoles(): Promise<Rol[]>;
}
