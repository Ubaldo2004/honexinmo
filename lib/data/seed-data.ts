// Datos demo del panel Honex (ilustrativos). Portados del mock de honex-app.
// Sirven como fuente de la implementación mock del repositorio y, más adelante,
// de base para el script de seed de Supabase.

import type {
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
  Rol,
} from "./types";

// 3 piezas: un BOT conversacional, un MOTOR de búsqueda (no es agente) y un AGENTE analista.
export const PIEZAS: Pieza[] = [
  { key: "orquestador", nombre: "Orquestador (bot)", tipo: "agente", rol: "Conversa: entiende, califica y rutea. Mantiene el hilo de la propiedad ancla.", icon: "Bot", estado: "online", metric: "1.284 mensajes hoy", color: "text-brand-400" },
  { key: "motor", nombre: "Motor de búsqueda", tipo: "motor", rol: "NO es un agente: es el motor que busca en toda la red (Tokko/Propia/portales) y rankea.", icon: "Search", estado: "online", metric: "511 búsquedas · 96 fichas", color: "text-emerald-300" },
  { key: "analista", nombre: "Analista", tipo: "agente", rol: "El “encargado interno”: analiza conversaciones, visitas y seguimientos. Entrena al bot.", icon: "Brain", estado: "idle", metric: "último análisis 03:00 · 14 correcciones", color: "text-sky-300" },
];

export const KPIS: Kpi[] = [
  { k: "Leads hoy", v: "84", d: "+22%" },
  { k: "Conversaciones activas", v: "37", d: "" },
  { k: "A coordinar visita", v: "5", d: "avisar colega", warn: true },
  { k: "Operaciones (mes)", v: "14", d: "+31%" },
  { k: "Conversión", v: "7,4%", d: "+1,8pts" },
  { k: "Búsquedas hoy", v: "511", d: "motor" },
];

export const FUNNEL: FunnelStep[] = [
  { k: "Leads", v: 1284, pct: 100 },
  { k: "Calificados", v: 1010, pct: 79 },
  { k: "Matcheados", v: 511, pct: 40 },
  { k: "Visitas", v: 96, pct: 7.5 },
  { k: "Cierres", v: 14, pct: 1.1 },
];

export const CONVERSACIONES: Conversacion[] = [
  { id: "1", nombre: "Andrés M.", tel: "+54 9 341 555-1042", ancla: "2 amb · Bv. Oroño", origen: "Meta · 2amb-A", last: "Dale, ¿qué otras opciones hay parecidas?", t: "14:32", unread: 0, estado: "bot", asignado: "bot", mood: "interesado", score: 86, abierta: true },
  { id: "2", nombre: "Luciana P.", tel: "+54 9 341 555-7781", ancla: "Casa Fisherton", origen: "Meta · casa-B", last: "Sí! Quiero ir a verla 🙌", t: "14:28", unread: 2, estado: "visita", reason: "Quiere coordinar visita → avisar al colega", priority: "high", asignado: "Calandria", mood: "caliente", score: 94 },
  { id: "3", nombre: "Colega · Inmob. Sur", tel: "+54 9 341 555-3320", ancla: "Mono Pichincha", origen: "Meta · mono-C", last: "Soy colega, me interesa el de Pichincha", t: "14:11", unread: 0, estado: "bot", asignado: "bot", mood: "colega", score: 40 },
  { id: "4", nombre: "Gastón R.", tel: "+54 9 341 555-9015", ancla: "3 dorm Centro", origen: "Meta · 3d-A", last: "¿Sos un bot? jaja", t: "13:55", unread: 1, estado: "handoff", reason: '"Sos un bot?" 2+ veces', priority: "critical", asignado: "Operador", mood: "dudoso", score: 51 },
  { id: "5", nombre: "Mariana T.", tel: "+54 9 341 555-2204", ancla: "2 amb Abasto", origen: "Meta · 2amb-A", last: "Volví de la visita, me gustó pero...", t: "13:40", unread: 0, estado: "seguimiento", reason: "Post-visita · seguimiento personalizado", asignado: "bot", mood: "tibio", score: 72 },
  { id: "6", nombre: "Juan C.", tel: "+54 9 341 555-6678", ancla: "Mono a estrenar", origen: "Meta · mono-C", last: "Avanzo con la seña, pasame con alguien", t: "13:12", unread: 0, estado: "operacion", reason: "Avanza operación → pasa a humano, bot OFF", asignado: "Operador", mood: "caliente", score: 91 },
];

export const HILO: MensajeHilo[] = [
  { who: "bot", agent: "Orquestador", t: "¡Hola Andrés! Vi que te interesó el 2 ambientes de Bv. Oroño 🙌 Te paso la ficha 👇", ts: "14:20" },
  { who: "bot", card: "ficha", t: "📄 2 amb · balcón al frente · Bv. Oroño · USD 92.000 — ver ficha", ts: "14:20" },
  { who: "in", t: "Está buenísimo. ¿Sigue disponible?", ts: "14:22" },
  { who: "bot", agent: "Orquestador", t: "Te soy sincero: esa ya está reservada (vuela). Pero tengo varias parecidas. ¿La buscás para vos o sos colega?", ts: "14:23" },
  { who: "in", t: "Para mí. Algo así, Centro o Pichincha, hasta 95 lucas", ts: "14:25" },
  { who: "bot", agent: "Motor de búsqueda", t: "Buscando en toda la red (Tokko + Propia + portales)…", ts: "14:25", system: true },
  { who: "bot", card: "resultados", t: "Encontré 3 que coinciden, ordenadas por match:", ts: "14:26" },
  { who: "in", t: "Dale, ¿qué otras opciones hay parecidas?", ts: "14:32" },
];

export const RESULTADOS: Resultado[] = [
  { match: 96, t: "2 amb · balcón", zona: "Centro · Oroño", precio: "USD 92.000", src: "Red Tokko" },
  { match: 88, t: "Mono a estrenar", zona: "Pichincha", precio: "USD 64.500", src: "Propia" },
  { match: 81, t: "2 amb c/ cochera", zona: "Centro", precio: "USD 89.000", src: "Portal ext." },
];

// El "handoff" principal es para coordinar la visita (avisar al colega), no por pagos.
export const ACCIONES: Accion[] = [
  { id: "2", lead: "Luciana P.", tipo: "Coordinar visita", detalle: "Quiere ver la Casa de Fisherton → avisar al colega dueño", priority: "high", t: "hace 4 min" },
  { id: "7", lead: "Pablo S.", tipo: "Coordinar visita", detalle: "Quiere ver 2 amb Centro → asignar agente de visitas", priority: "high", t: "hace 12 min" },
  { id: "4", lead: "Gastón R.", tipo: "Handoff", detalle: '"Sos un bot?" 2+ veces → tomar la charla', priority: "critical", t: "hace 37 min" },
  { id: "6", lead: "Juan C.", tipo: "Operación", detalle: "Avanza la seña → pasa a humano, el bot queda OFF", priority: "high", t: "hace 8 min" },
  { id: "9", lead: "Diego A.", tipo: "Handoff", detalle: "Confidence IA < 0.5 → revisar", priority: "low", t: "hace 20 min" },
];

export const LEADS: Lead[] = [
  { nombre: "Andrés M.", tel: "341 555-1042", etapa: "Búsqueda", score: 86, ancla: "2 amb Oroño", origen: "Meta · 2amb-A", asignado: "bot", act: "hace 3 min" },
  { nombre: "Luciana P.", tel: "341 555-7781", etapa: "Visita", score: 94, ancla: "Casa Fisherton", origen: "Meta · casa-B", asignado: "Calandria", act: "hace 6 min" },
  { nombre: "Mariana T.", tel: "341 555-2204", etapa: "Seguimiento", score: 72, ancla: "2 amb Abasto", origen: "Meta · 2amb-A", asignado: "bot", act: "hace 1 h" },
  { nombre: "Juan C.", tel: "341 555-6678", etapa: "Operación", score: 91, ancla: "Mono estrenar", origen: "Meta · mono-C", asignado: "Operador", act: "hace 2 h" },
  { nombre: "Gastón R.", tel: "341 555-9015", etapa: "Calificación", score: 51, ancla: "3 dorm Centro", origen: "Meta · 3d-A", asignado: "Operador", act: "hace 40 min" },
  { nombre: "Sofía L.", tel: "341 555-8890", etapa: "Búsqueda", score: 73, ancla: "Mono Pichincha", origen: "Meta · mono-C", asignado: "bot", act: "hace 25 min" },
];

// Búsquedas hechas (pipeline DB) — todas quedan guardadas.
export const BUSQUEDAS: Busqueda[] = [
  { lead: "Andrés M.", criterios: "2 amb · Centro/Pichincha · ≤95k · balcón", ancla: "2 amb Oroño", fuentes: "Tokko + Propia + portales", resultados: 23, t: "14:26" },
  { lead: "Sofía L.", criterios: "mono · Pichincha · ≤70k · amenities", ancla: "Mono Pichincha", fuentes: "Tokko + portales", resultados: 11, t: "14:09" },
  { lead: "Mariana T.", criterios: "2 amb · Abasto · ≤80k", ancla: "2 amb Abasto", fuentes: "Tokko + Propia", resultados: 8, t: "13:30" },
  { lead: "Gastón R.", criterios: "3 dorm · Centro · ≤140k · cochera", ancla: "3 dorm Centro", fuentes: "Tokko + portales", resultados: 17, t: "13:12" },
  { lead: "Juan C.", criterios: "mono a estrenar · ≤65k", ancla: "Mono estrenar", fuentes: "Tokko", resultados: 6, t: "12:50" },
];

// Propiedades ancla: se cargan, se publican (a la web propia) y se linkean a una publicidad → trazabilidad.
export const ANCLAS: Ancla[] = [
  { tipo: "Monoambiente", prop: "Mono a estrenar · Pichincha", precio: "USD 64.5k", variante: "mono-C", leads: 412, visitas: 38, web: true, tokko: true, estado: "ganadora" },
  { tipo: "2 ambientes", prop: "2 amb balcón · Bv. Oroño", precio: "USD 92k", variante: "2amb-A", leads: 388, visitas: 31, web: true, tokko: true, estado: "ganadora" },
  { tipo: "Casa", prop: "Casa c/ patio · Fisherton", precio: "USD 175k", variante: "casa-B", leads: 121, visitas: 14, web: true, tokko: false, estado: "testeando" },
  { tipo: "3 dormitorios", prop: "3 dorm · Centro", precio: "USD 130k", variante: "3d-A", leads: 96, visitas: 5, web: false, tokko: true, estado: "testeando" },
];

export const OPERACIONES: Operacion[] = [
  { prop: "2 amb · Centro", cliente: "Romina V.", colega: "Inmob. Sur", monto: "USD 88.000", comision: "USD 2.640", split: "Honex 50 · mostró 25 · dueño 25", estado: "cerrada" },
  { prop: "Mono · Pichincha", cliente: "Tomás G.", colega: "Propia", monto: "USD 63.000", comision: "USD 1.890", split: "Honex 50 · mostró 25 · dueño 25", estado: "escritura" },
  { prop: "Casa · Fisherton", cliente: "Carla D.", colega: "Century 21", monto: "USD 172.000", comision: "USD 5.160", split: "Honex 50 · mostró 25 · dueño 25", estado: "seña" },
];

// Visita con transcripto + análisis ("modo laboratorio")
export const VISITA: Visita = {
  lead: "Mariana T.", prop: "2 amb · Abasto", agente: "Calandria", fecha: "hoy 11:00",
  transcripto: true,
  analisis: {
    perfil: "Compradora primera vivienda, busca luminosidad y cochera. Decide rápido si la convence.",
    preguntas: ["¿Tiene cochera?", "¿Cuánto de expensas?", "¿Da el sol a la mañana?"],
    objeciones: ["Le pareció oscuro el living", "Expensas un poco altas"],
    siguiente: "Mandarle 2 amb luminosos con cochera ≤ USD 80k en 48h. Evitar PB.",
    prob: 64,
  },
};

export const DEMANDA: number[] = [3, 4, 5, 7, 6, 8, 11, 14, 12, 9, 7, 5, 6, 8, 11, 14, 17, 19, 16, 12, 9, 7, 5, 4];

// Jerarquía de 3 niveles (una sola inmobiliaria).
export const ROLES: Rol[] = [
  { r: "Administrador", d: "Admin del panel: audita las conversaciones, ve los números y métricas, y asigna leads." },
  { r: "Operador", d: "Solo ve las conversaciones / leads asignados a él." },
  { r: "Agente de visitas", d: "Recibe las visitas asignadas y sube el transcripto post-visita." },
];
