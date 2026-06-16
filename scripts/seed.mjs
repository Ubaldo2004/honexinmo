// Seed de Honex (multi-tenant). Crea usuarios de auth + 2 inmobiliarias con data
// DISTINTA cada una, para verificar el aislamiento por tenant.
//
//   node scripts/seed.mjs
//
// Usa la service_role key (bypassa RLS). Lee credenciales de .env.local.
// Es re-ejecutable: limpia la data de negocio y reusa los usuarios de auth por email.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// --- cargar .env.local ---
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = env.SUPABASE_SECRET_KEY;
if (!URL_ || !SECRET) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local");

const db = createClient(URL_, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });

const PASS = "Honex1234!";
const ALWAYS = "00000000-0000-0000-0000-000000000000"; // filtro "todo" para deletes

// --- usuarios demo ---
const USERS = [
  { key: "super",  email: "super@honex.test",  nombre: "Súper Admin (Honex)", rol: "super_admin" },
  { key: "aNorte", email: "bot@honexinmo.com",    nombre: "bottelegram", rol: "administrador" },
  { key: "oNorte", email: "ubaldo@honexinmo.com", nombre: "Ubaldo",      rol: "operador" },
  { key: "aSur",   email: "admin@sur.test",    nombre: "Diego Romero",        rol: "administrador" },
];

async function ensureUser(u) {
  const { data, error } = await db.auth.admin.createUser({
    email: u.email, password: PASS, email_confirm: true,
  });
  if (!error) return data.user.id;
  // ya existe → buscarlo
  let page = 1;
  while (page < 20) {
    const { data: list } = await db.auth.admin.listUsers({ page, perPage: 200 });
    const found = list.users.find((x) => x.email === u.email);
    if (found) return found.id;
    if (list.users.length < 200) break;
    page++;
  }
  throw new Error("No pude crear ni encontrar el usuario " + u.email);
}

async function clean() {
  for (const t of ["mensajes","conversaciones","busquedas","matches","visitas","operaciones","anclas","propiedades","leads","usuarios","inmobiliarias"]) {
    const { error } = await db.from(t).delete().neq("id", ALWAYS);
    if (error) throw new Error(`limpiando ${t}: ${error.message}`);
  }
}

async function insert(table, rows) {
  const { data, error } = await db.from(table).insert(rows).select();
  if (error) throw new Error(`insert ${table}: ${error.message}`);
  return data;
}

// Carga la data de negocio de un tenant. `assignTo` = uuid del operador (o null).
async function seedTenant(inmoId, d, assignTo) {
  // leads
  const leadRows = d.leads.map((l) => ({
    inmobiliaria_id: inmoId, nombre: l.nombre, telefono: l.tel, etapa: l.etapa,
    score: l.score, ancla: l.ancla, origen: l.origen, mood: l.mood,
    asignado_label: l.asignado, ultima_actividad: l.act,
    asignado_a: l.asignar ? assignTo : null,
  }));
  const leads = await insert("leads", leadRows);
  const leadId = Object.fromEntries(leads.map((r) => [r.nombre, r.id]));

  // conversaciones
  const convRows = d.conversaciones.map((c) => ({
    inmobiliaria_id: inmoId, lead_id: leadId[c.nombre], estado: c.estado,
    reason: c.reason ?? null, priority: c.priority ?? null, asignado_label: c.asignado,
    unread: c.unread, ultimo_mensaje: c.last, ultimo_label: c.t,
    asignado_a: c.asignar ? assignTo : null,
  }));
  const convs = await insert("conversaciones", convRows);
  const convId = Object.fromEntries(convs.map((r, i) => [d.conversaciones[i].nombre, r.id]));

  // mensajes (en la conversación marcada con hiloEn)
  if (d.hilo && d.hiloEn) {
    await insert("mensajes", d.hilo.map((m) => ({
      inmobiliaria_id: inmoId, conversacion_id: convId[d.hiloEn],
      who: m.who, agent: m.agent ?? null, texto: m.t, card: m.card ?? null,
      system: !!m.system, ts_label: m.ts,
    })));
  }

  // propiedades
  await insert("propiedades", d.propiedades.map((p) => ({
    inmobiliaria_id: inmoId, tokko_property_id: p.tokko_property_id, estado: p.estado,
    operacion: p.operacion, tipo: p.tipo, titulo: p.titulo, descripcion: p.descripcion,
    precio: p.precio, moneda: p.moneda, zona: p.zona, direccion_aprox: p.direccion_aprox,
    m2: p.m2, ambientes: p.ambientes, dormitorios: p.dormitorios, fotos: p.fotos, tokko_url: p.tokko_url,
  })));

  // busquedas
  const busq = await insert("busquedas", d.busquedas.map((b) => ({
    inmobiliaria_id: inmoId, lead_id: leadId[b.lead] ?? null, lead_label: b.lead,
    criterios: b.criterios, ancla: b.ancla, fuentes: b.fuentes, resultados: b.resultados, hora_label: b.t,
  })));

  // matches (registro de qué se mostró)
  if (d.matches) {
    await insert("matches", d.matches.map((m) => ({
      inmobiliaria_id: inmoId, lead_id: leadId[m.lead] ?? null, busqueda_id: busq[0]?.id ?? null,
      tokko_property_id: m.tokko_property_id, match_score: m.match, posicion_ranking: m.pos,
      precio_mostrado: m.precio, moneda: "USD",
    })));
  }

  // anclas
  await insert("anclas", d.anclas.map((a) => ({
    inmobiliaria_id: inmoId, tipo: a.tipo, prop: a.prop, precio: a.precio, variante: a.variante,
    leads: a.leads, visitas: a.visitas, web: a.web, tokko: a.tokko, estado: a.estado,
  })));

  // visitas
  await insert("visitas", d.visitas.map((v) => ({
    inmobiliaria_id: inmoId, lead_id: leadId[v.lead] ?? null, lead_label: v.lead, prop: v.prop,
    agente: v.agente, fecha: v.fecha, transcripto: v.transcripto, analisis: v.analisis,
  })));

  // operaciones
  await insert("operaciones", d.operaciones.map((o) => ({
    inmobiliaria_id: inmoId, prop: o.prop, cliente: o.cliente, colega: o.colega,
    monto: o.monto, comision: o.comision, split: o.split, estado: o.estado,
  })));
}

// ============================ datasets ============================
const NORTE = {
  leads: [
    { nombre: "Andrés M.", tel: "341 555-1042", etapa: "Búsqueda", score: 86, ancla: "2 amb Oroño", origen: "Meta · 2amb-A", asignado: "Operador Norte", act: "hace 3 min", mood: "interesado", asignar: true },
    { nombre: "Luciana P.", tel: "341 555-7781", etapa: "Visita", score: 94, ancla: "Casa Fisherton", origen: "Meta · casa-B", asignado: "Calandria", act: "hace 6 min", mood: "caliente" },
    { nombre: "Mariana T.", tel: "341 555-2204", etapa: "Seguimiento", score: 72, ancla: "2 amb Abasto", origen: "Meta · 2amb-A", asignado: "bot", act: "hace 1 h", mood: "tibio" },
    { nombre: "Juan C.", tel: "341 555-6678", etapa: "Operación", score: 91, ancla: "Mono estrenar", origen: "Meta · mono-C", asignado: "Operador", act: "hace 2 h", mood: "caliente" },
    { nombre: "Gastón R.", tel: "341 555-9015", etapa: "Calificación", score: 51, ancla: "3 dorm Centro", origen: "Meta · 3d-A", asignado: "Operador", act: "hace 40 min", mood: "dudoso" },
    { nombre: "Sofía L.", tel: "341 555-8890", etapa: "Búsqueda", score: 73, ancla: "Mono Pichincha", origen: "Meta · mono-C", asignado: "bot", act: "hace 25 min", mood: "interesado" },
  ],
  conversaciones: [
    { nombre: "Andrés M.", estado: "bot", unread: 0, last: "Dale, ¿qué otras opciones hay parecidas?", t: "14:32", asignado: "Operador Norte", asignar: true },
    { nombre: "Luciana P.", estado: "visita", unread: 2, last: "Sí! Quiero ir a verla 🙌", t: "14:28", reason: "Quiere coordinar visita → avisar al colega", priority: "high", asignado: "Calandria" },
    { nombre: "Gastón R.", estado: "handoff", unread: 1, last: "¿Sos un bot? jaja", t: "13:55", reason: '"Sos un bot?" 2+ veces', priority: "critical", asignado: "Operador" },
    { nombre: "Mariana T.", estado: "seguimiento", unread: 0, last: "Volví de la visita, me gustó pero...", t: "13:40", reason: "Post-visita · seguimiento personalizado", asignado: "bot" },
    { nombre: "Juan C.", estado: "operacion", unread: 0, last: "Avanzo con la seña, pasame con alguien", t: "13:12", reason: "Avanza operación → pasa a humano, bot OFF", asignado: "Operador" },
  ],
  hiloEn: "Andrés M.",
  hilo: [
    { who: "bot", agent: "Orquestador", t: "¡Hola Andrés! Vi que te interesó el 2 ambientes de Bv. Oroño 🙌 Te paso la ficha 👇", ts: "14:20" },
    { who: "bot", card: "ficha", t: "📄 2 amb · balcón al frente · Bv. Oroño · USD 92.000 — ver ficha", ts: "14:20" },
    { who: "in", t: "Está buenísimo. ¿Sigue disponible?", ts: "14:22" },
    { who: "bot", agent: "Orquestador", t: "Te soy sincero: esa ya está reservada. Pero tengo varias parecidas. ¿La buscás para vos o sos colega?", ts: "14:23" },
    { who: "in", t: "Para mí. Algo así, Centro o Pichincha, hasta 95 lucas", ts: "14:25" },
    { who: "bot", agent: "Motor de búsqueda", t: "Buscando en toda la red (Tokko + Propia + portales)…", ts: "14:25", system: true },
    { who: "bot", card: "resultados", t: "Encontré 3 que coinciden, ordenadas por match:", ts: "14:26" },
    { who: "in", t: "Dale, ¿qué otras opciones hay parecidas?", ts: "14:32" },
  ],
  propiedades: [
    { tokko_property_id: "TK-100245", estado: "disponible", operacion: "venta", tipo: "departamento", titulo: "2 amb · balcón al frente", descripcion: "2 amb luminoso, balcón al frente, Bv. Oroño.", precio: 92000, moneda: "USD", zona: "Centro · Oroño", direccion_aprox: "Bv. Oroño 1200", m2: 58, ambientes: 2, dormitorios: 1, fotos: [], tokko_url: "https://ficha.tokko.example/TK-100245" },
    { tokko_property_id: "TK-100871", estado: "disponible", operacion: "venta", tipo: "monoambiente", titulo: "Mono a estrenar", descripcion: "Mono a estrenar con amenities en Pichincha.", precio: 64500, moneda: "USD", zona: "Pichincha", direccion_aprox: "Güemes 2300", m2: 34, ambientes: 1, dormitorios: 0, fotos: [], tokko_url: "https://ficha.tokko.example/TK-100871" },
    { tokko_property_id: "TK-101533", estado: "disponible", operacion: "venta", tipo: "departamento", titulo: "2 amb c/ cochera", descripcion: "2 amb con cochera, Centro.", precio: 89000, moneda: "USD", zona: "Centro", direccion_aprox: "Mitre 900", m2: 55, ambientes: 2, dormitorios: 1, fotos: [], tokko_url: "https://ficha.tokko.example/TK-101533" },
  ],
  busquedas: [
    { lead: "Andrés M.", criterios: "2 amb · Centro/Pichincha · ≤95k · balcón", ancla: "2 amb Oroño", fuentes: "Tokko + Propia + portales", resultados: 23, t: "14:26" },
    { lead: "Sofía L.", criterios: "mono · Pichincha · ≤70k · amenities", ancla: "Mono Pichincha", fuentes: "Tokko + portales", resultados: 11, t: "14:09" },
    { lead: "Mariana T.", criterios: "2 amb · Abasto · ≤80k", ancla: "2 amb Abasto", fuentes: "Tokko + Propia", resultados: 8, t: "13:30" },
  ],
  matches: [
    { lead: "Andrés M.", tokko_property_id: "TK-100245", match: 96, pos: 1, precio: 92000 },
    { lead: "Andrés M.", tokko_property_id: "TK-100871", match: 88, pos: 2, precio: 64500 },
    { lead: "Andrés M.", tokko_property_id: "TK-101533", match: 81, pos: 3, precio: 89000 },
  ],
  anclas: [
    { tipo: "Monoambiente", prop: "Mono a estrenar · Pichincha", precio: "USD 64.5k", variante: "mono-C", leads: 412, visitas: 38, web: true, tokko: true, estado: "ganadora" },
    { tipo: "2 ambientes", prop: "2 amb balcón · Bv. Oroño", precio: "USD 92k", variante: "2amb-A", leads: 388, visitas: 31, web: true, tokko: true, estado: "ganadora" },
    { tipo: "Casa", prop: "Casa c/ patio · Fisherton", precio: "USD 175k", variante: "casa-B", leads: 121, visitas: 14, web: true, tokko: false, estado: "testeando" },
    { tipo: "3 dormitorios", prop: "3 dorm · Centro", precio: "USD 130k", variante: "3d-A", leads: 96, visitas: 5, web: false, tokko: true, estado: "testeando" },
  ],
  visitas: [
    { lead: "Mariana T.", prop: "2 amb · Abasto", agente: "Calandria", fecha: "hoy 11:00", transcripto: true, analisis: {
      perfil: "Compradora primera vivienda, busca luminosidad y cochera. Decide rápido.",
      preguntas: ["¿Tiene cochera?", "¿Cuánto de expensas?", "¿Da el sol a la mañana?"],
      objeciones: ["Le pareció oscuro el living", "Expensas un poco altas"],
      siguiente: "Mandarle 2 amb luminosos con cochera ≤ USD 80k en 48h. Evitar PB.", prob: 64 } },
  ],
  operaciones: [
    { prop: "2 amb · Centro", cliente: "Romina V.", colega: "Inmob. Sur", monto: "USD 88.000", comision: "USD 2.640", split: "Honex 50 · mostró 25 · dueño 25", estado: "cerrada" },
    { prop: "Mono · Pichincha", cliente: "Tomás G.", colega: "Propia", monto: "USD 63.000", comision: "USD 1.890", split: "Honex 50 · mostró 25 · dueño 25", estado: "escritura" },
    { prop: "Casa · Fisherton", cliente: "Carla D.", colega: "Century 21", monto: "USD 172.000", comision: "USD 5.160", split: "Honex 50 · mostró 25 · dueño 25", estado: "seña" },
  ],
};

// Sur: data CLARAMENTE distinta (Córdoba) para que el aislamiento se note.
const SUR = {
  leads: [
    { nombre: "Pedro Q.", tel: "351 444-1188", etapa: "Búsqueda", score: 78, ancla: "Dúplex Nueva Cba", origen: "Meta · duplex-X", asignado: "bot", act: "hace 8 min", mood: "interesado" },
    { nombre: "Valeria S.", tel: "351 444-9922", etapa: "Visita", score: 90, ancla: "Casa Cerro", origen: "Meta · casa-Y", asignado: "Bruno", act: "hace 15 min", mood: "caliente" },
    { nombre: "Inmob. Centro (colega)", tel: "351 444-3030", etapa: "Calificación", score: 42, ancla: "Loft Güemes", origen: "Meta · loft-Z", asignado: "bot", act: "hace 33 min", mood: "colega" },
  ],
  conversaciones: [
    { nombre: "Pedro Q.", estado: "bot", unread: 0, last: "¿Tenés algo parecido pero con patio?", t: "15:02", asignado: "bot" },
    { nombre: "Valeria S.", estado: "visita", unread: 1, last: "Genial, ¿puedo verla mañana?", t: "14:50", reason: "Quiere coordinar visita → avisar al colega", priority: "high", asignado: "Bruno" },
    { nombre: "Inmob. Centro (colega)", estado: "bot", unread: 0, last: "Soy colega, me interesa el loft", t: "14:31", asignado: "bot" },
  ],
  hiloEn: "Pedro Q.",
  hilo: [
    { who: "bot", agent: "Orquestador", t: "¡Hola Pedro! Vi tu consulta por el dúplex en Nueva Córdoba 🙌", ts: "14:55" },
    { who: "in", t: "Sí, ¿tenés algo parecido pero con patio?", ts: "15:02" },
    { who: "bot", agent: "Motor de búsqueda", t: "Buscando en la red…", ts: "15:02", system: true },
  ],
  propiedades: [
    { tokko_property_id: "TK-CB-2201", estado: "disponible", operacion: "venta", tipo: "duplex", titulo: "Dúplex 3 amb Nueva Cba", descripcion: "Dúplex luminoso, Nueva Córdoba.", precio: 145000, moneda: "USD", zona: "Nueva Córdoba", direccion_aprox: "Independencia 700", m2: 95, ambientes: 3, dormitorios: 2, fotos: [], tokko_url: "https://ficha.tokko.example/TK-CB-2201" },
    { tokko_property_id: "TK-CB-3340", estado: "reservado", operacion: "venta", tipo: "casa", titulo: "Casa c/ patio Cerro", descripcion: "Casa con patio en Cerro de las Rosas.", precio: 210000, moneda: "USD", zona: "Cerro de las Rosas", direccion_aprox: "Rafael Núñez 4100", m2: 180, ambientes: 4, dormitorios: 3, fotos: [], tokko_url: "https://ficha.tokko.example/TK-CB-3340" },
  ],
  busquedas: [
    { lead: "Pedro Q.", criterios: "dúplex · Nueva Cba · ≤150k · patio", ancla: "Dúplex Nueva Cba", fuentes: "Tokko + portales", resultados: 9, t: "15:02" },
    { lead: "Valeria S.", criterios: "casa · Cerro · ≤220k", ancla: "Casa Cerro", fuentes: "Tokko + Propia", resultados: 5, t: "14:48" },
  ],
  matches: [
    { lead: "Pedro Q.", tokko_property_id: "TK-CB-2201", match: 92, pos: 1, precio: 145000 },
    { lead: "Valeria S.", tokko_property_id: "TK-CB-3340", match: 87, pos: 1, precio: 210000 },
  ],
  anclas: [
    { tipo: "Dúplex", prop: "Dúplex 3 amb · Nueva Cba", precio: "USD 145k", variante: "duplex-X", leads: 210, visitas: 18, web: true, tokko: true, estado: "ganadora" },
    { tipo: "Casa", prop: "Casa c/ patio · Cerro", precio: "USD 210k", variante: "casa-Y", leads: 88, visitas: 9, web: true, tokko: true, estado: "testeando" },
  ],
  visitas: [
    { lead: "Valeria S.", prop: "Casa c/ patio · Cerro", agente: "Bruno", fecha: "hoy 10:00", transcripto: true, analisis: {
      perfil: "Familia, prioriza patio y seguridad. Compara con dos opciones más.",
      preguntas: ["¿Tiene cochera doble?", "¿Cómo es el barrio de noche?"],
      objeciones: ["La cocina chica"],
      siguiente: "Ofrecer casas con cochera doble en Cerro ≤ 220k.", prob: 58 } },
  ],
  operaciones: [
    { prop: "Dúplex · Nueva Cba", cliente: "Lucas F.", colega: "Propia", monto: "USD 140.000", comision: "USD 4.200", split: "Honex 50 · mostró 25 · dueño 25", estado: "seña" },
  ],
};

// ============================ run ============================
console.log("Limpiando data previa…");
await clean();

console.log("Asegurando usuarios de auth…");
const ids = {};
for (const u of USERS) ids[u.key] = await ensureUser(u);

console.log("Creando inmobiliarias…");
const inmobs = await insert("inmobiliarias", [
  { nombre: "Inmobiliaria Norte", slug: "norte" },
  { nombre: "Inmobiliaria Sur", slug: "sur" },
]);
const norteId = inmobs.find((i) => i.slug === "norte").id;
const surId = inmobs.find((i) => i.slug === "sur").id;

console.log("Creando perfiles de usuario…");
await insert("usuarios", [
  { id: ids.super,  inmobiliaria_id: null,    nombre: "Súper Admin (Honex)", rol: "super_admin" },
  { id: ids.aNorte, inmobiliaria_id: norteId, nombre: "Admin Norte",         rol: "administrador" },
  { id: ids.oNorte, inmobiliaria_id: norteId, nombre: "Operador Norte",      rol: "operador" },
  { id: ids.aSur,   inmobiliaria_id: surId,   nombre: "Admin Sur",           rol: "administrador" },
]);

console.log("Cargando data de Norte…");
await seedTenant(norteId, NORTE, ids.oNorte);
console.log("Cargando data de Sur…");
await seedTenant(surId, SUR, null);

console.log("\n✅ Seed completo.");
console.log("Usuarios (contraseña para todos: " + PASS + "):");
for (const u of USERS) console.log("  - " + u.email + "  [" + u.rol + "]");
