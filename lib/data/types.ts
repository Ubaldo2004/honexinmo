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
  disponibilidad?: string;     // día/horario que el cliente puede (lo captura el bot)
  criteriosBusqueda?: string;  // qué pidió en su última búsqueda (referencia para el vendedor)
}

export interface MensajeHilo {
  who: "bot" | "in";
  agent?: string;
  t: string;
  ts: string;
  card?: "ficha" | "resultados" | "fotos";
  fotos?: string[];
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
  leadId?: string;   // para agrupar por usuario (no solo por nombre)
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
  id?: string;
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

// Análisis que saca el Analista del transcripto de la visita (le gustó, objeciones, qué busca ahora).
export interface AnalisisVisita {
  le_gusto?: string;       // "si" | "no" | "dudoso"
  positivos?: string[];    // qué le gustó
  objeciones?: string[];   // qué no le gustó / objeciones
  busca_ahora?: string;    // qué busca ahora / qué ajustaría
  siguiente?: string;      // próximo paso del seguimiento
  prob?: number;           // probabilidad de cierre 0–100
}

// Una visita grabada por el agente (lista del panel). Distinto de `Visita` (demo single).
export interface VisitaItem {
  id: string;
  leadId: string | null;
  lead: string;
  prop: string;
  agente: string;
  fecha: string;
  audioPath: string | null;
  transcripto: string | null;
  duracionSeg: number | null;
  analisis: AnalisisVisita | null;
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
  getVisitas(): Promise<VisitaItem[]>;
  getRoles(): Promise<Rol[]>;
}
