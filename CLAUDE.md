# Honex — MVP (honexinmo)

Panel interno (back-office) para una inmobiliaria en Rosario. Un comprador escribe
por chat desde una campaña; un **bot** lo identifica y califica; un **motor de
búsqueda** busca en toda la red y rankea por match; se coordina la **visita** con
el colega dueño de la propiedad y se reparte la **comisión**. Trazabilidad total
de qué aviso trajo cada lead.

**Honex es un SaaS MULTI-TENANT:** lo usan varias inmobiliarias, cada una aislada
de la otra. Toda tabla de negocio lleva `inmobiliaria_id` y todo acceso filtra por
tenant (ver Multi-tenant + RLS).

**Etapa actual:** MVP para ver cómo queda y validar que el flujo cierra.
**Canal de prueba:** Telegram ahora, WhatsApp después (sin reescribir — ver Canal).
**Front de referencia:** `../honex-app` (Vite). Su UI es la que tiene que quedar:
se reutiliza, NO se rehace.

## Las 3 piezas (NO son 3 agentes)
1. **Orquestador (bot)** — agente LLM. Recibe cada mensaje, califica
   (particular/colega), rutea, mantiene el hilo de la "propiedad ancla", hace
   seguimiento. **Fase 2** (vive en n8n). En el MVP: mock.
2. **Motor de búsqueda** — NO es agente. Busca en la red (Tokko/Propia/portales)
   y rankea por match. **Ya existe, NO se toca** (ver Borde Tokko). En el MVP: mock.
3. **Analista** — agente LLM. Analiza conversaciones y transcriptos de visitas,
   saca correcciones, entrena al bot. En el MVP: salida mockeada.

## Máquina de estados de la conversación (regla de negocio)
- `bot` — el bot maneja; el humano no escribe hasta "tomarla".
- `visita` — quiere coordinar visita → avisar al colega + asignar agente.
- `handoff` — algo salió mal ("¿sos un bot?" 2+ veces, o confianza IA < 0.5)
  → humano toma.
- `seguimiento` — post-visita, seguimiento personalizado.
- `operacion` — avanza la seña → pasa a un humano (otro número), el bot queda OFF.

El handoff principal es para **coordinar la visita**, no por pagos
(no hay comprobantes de pago).

## Multi-tenant (regla transversal)
- Tabla **`inmobiliarias`** = el tenant. TODAS las tablas de negocio llevan
  `inmobiliaria_id` (FK → `inmobiliarias`).
- **RLS de doble capa:**
  (a) **aislamiento por tenant** — cada query filtra por el `inmobiliaria_id` del
      usuario; una inmobiliaria NUNCA ve data de otra.
  (b) **rol dentro del tenant.**
- El `inmobiliaria_id` se resuelve en el **server** desde el perfil del usuario;
  **nunca** se confía en lo que mande el cliente.

## Roles — jerarquía de 4 niveles (materializan RLS)
- **Super Admin** — plataforma (Honex). Da de alta inmobiliarias, ve cross-tenant,
  **saltea** el filtro de tenant. Único que NO pertenece a una inmobiliaria
  (`inmobiliaria_id` null).
- **Administrador** — admin de SU inmobiliaria. No ve otras.
- **Operador** — solo sus leads asignados, dentro de su tenant.
- **Agente de visitas** — recibe visitas / sube transcripto, dentro de su tenant.

`usuarios` tiene `rol` + `inmobiliaria_id` (null solo para Super Admin).

El panel es **mobile-first**: operador y agente lo usan del celular.

## Stack
- Next.js 16 (App Router) + TypeScript.
- Tailwind v4 (se mantiene el look de honex-app: `@theme` en `app/globals.css`,
  paleta miel/ink, fuentes Bricolage Grotesque / Inter / Space Mono vía `next/font`).
- Supabase: Postgres + Auth + RLS. `@supabase/ssr` para auth en server components.
- Datos reales desde Supabase, salvo el **motor de búsqueda** (mock) y el
  **canal** (Telegram, fase 2).

## Mapa del repo
```
app/
  layout.tsx              # raíz: fuentes (next/font), <html lang="es">
  page.tsx                # redirect → /dashboard
  globals.css             # Tailwind v4 @theme + clases (.card .pill .hoverable ...)
  (panel)/
    layout.tsx            # sidebar + header (client: nav mobile + activo por ruta)
    dashboard/page.tsx    # KPIs, piezas, acciones, embudo, demanda
    chats/                # page.tsx (server) + ChatsClient.tsx (selección)
    acciones/ busquedas/ leads/ anclas/ visitas/ operaciones/ sistema/ usuarios/
components/
  icons.tsx               # SVG (portado de honex-app)
  panel/ui.tsx            # átomos: Page, Card, F, A, pills (prio, estadoPill)
lib/
  data/                   # CAPA DE DATOS ABSTRAÍDA
    types.ts              # modelos + interfaz HonexRepository
    seed-data.ts          # datos demo (ilustrativos)
    mock.ts               # MockRepository (lee seed-data)
    index.ts              # getRepository() — swap a Supabase acá
  search/                 # BORDE TOKKO (contrato /honex/search)
    types.ts engine.ts mock.ts
  channel/types.ts        # adapter de canal (Telegram/WhatsApp) — interfaz, fase 2
```

## Capa de datos abstraída (regla)
Toda lectura/escritura del panel pasa por el **repositorio** (`lib/data`,
`getRepository()`), NUNCA por llamadas directas en los componentes. Hoy:
`MockRepository`. Mañana: `SupabaseRepository` (swap en `lib/data/index.ts`).
Cambiar de una a otra NO debe tocar la UI.

## Borde Tokko — REGLA DURA: el motor NO se toca
El motor ("Tokko Finder") ya está construido, probado y corriendo. Es una caja
negra de búsqueda **read-only**. NO se modifica su ranking ni su flujo.

Honex lo consume vía contrato HTTP (`lib/search`):

    POST /honex/search
    in:  { inmobiliaria_id, operacion, tipo, ciudad, zona,
           presupuesto_min, presupuesto_max, ambientes }
    out: [ { tokko_property_id, operacion, tipo, titulo, descripcion, precio, moneda,
             zona, direccion_aprox, m2, ambientes, dormitorios, fotos[], tokko_url,
             estado, match_score, posicion_ranking } ]

`inmobiliaria_id` va en el input desde el día 1 (cada inmobiliaria tiene su propia
cuenta de Tokko / inventario). En el MVP es mock, pero el campo va igual para no
rehacer el contrato.

Reglas de consumo:
- Por cada match: **upsert** en `propiedades` (snapshot) + **insert** en `matches`
  con el precio mostrado. `matches` es **INMUTABLE** (trazabilidad y comisiones).
- El bot presenta desde `propiedades` (incl. fotos Cloudinary), sin depender del
  motor en vivo.
- Antes de coordinar visita (estado `visita`): re-consultar esa propiedad al motor
  para confirmar disponibilidad y precio. **Único** punto de fetch en vivo.

En el MVP el motor está **mockeado** (`lib/search/mock.ts`) con un JSON con la
forma exacta del `out`. El swap al webhook real es cambiar el mock por un `fetch`,
sin tocar el panel ni el contrato. **El contrato es sagrado.**

## Canal — Telegram ahora, WhatsApp después
Interfaz `Channel` (`lib/channel/types.ts`) con dos implementaciones detrás de la
misma firma. Hoy `TelegramChannel`; mañana `WhatsAppChannel` (360dialog) sin tocar
la lógica del bot. La implementación es **fase 2**.
- Inbound normaliza a `IncomingMessage { leadRef, text, media, channel }`.
- Outbound toma `OutgoingMessage { leadRef, text, buttons?, type: 'reply' | 'proactive' }`.

Tres reglas desde ahora (para que WhatsApp entre sin rework):
1. **Identidad:** PK del lead = UUID interno, NUNCA el teléfono. Guardar
   `canal` + `canal_user_id` + `telefono` (null en Telegram). WhatsApp usa E.164.
2. **Reply vs proactive:** marcar cada saliente. WhatsApp `proactive` necesita
   template aprobado.
3. **Botones degradables:** toda respuesta con botones cae a texto plano si el
   canal no los soporta (WhatsApp: máx 3 botones / listas con límites).

## Bot — fase 2, asunción flippable
El bot vivirá separado, en **n8n**, consumiendo `/honex/search`. NO se construye
en esta etapa y NO bloquea el MVP. El panel queda desacoplado del bot: si después
se decide hacerlo in-app (webhook de Telegram dentro de Next), no se rehace el panel.

## Modelo de datos (Supabase) — A ACORDAR, no crear todavía
Tablas: `inmobiliarias` (tenant), `usuarios`, `leads`, `clientes`, `conversaciones`,
`busquedas`, `matches`, `visitas`, `operaciones`, `anclas` + `ads`, `propiedades`
(espejo de Tokko).

**TODAS las tablas de negocio llevan `inmobiliaria_id` (FK → `inmobiliarias`).**
`usuarios.inmobiliaria_id` es null solo para el Super Admin.

Dos tablas con forma ya definida (borde Tokko) — ambas scopeadas por tenant:

    propiedades  (espejo local de Tokko — scopeado por tenant: cada inmobiliaria
                  tiene su cuenta de Tokko e inventario propio)
      inmobiliaria_id (fk)         estado (disponible/reservado/vendido)
      tokko_property_id            operacion, tipo
      titulo, descripcion          precio, moneda
      m2, ambientes, dormitorios   zona, direccion_aprox
      amenities (jsonb)            fotos[] (URLs Cloudinary)
      tokko_url                    last_synced_at
      UNIQUE (inmobiliaria_id, tokko_property_id)

    matches  (registro INMUTABLE de qué se mostró)
      inmobiliaria_id (fk)
      lead_id, busqueda_id, tokko_property_id (fk → propiedades)
      match_score, posicion_ranking
      precio_mostrado, moneda, mostrado_at

El detalle fino de campos sale del mock (`lib/data/seed-data.ts`). **No inventar
campos:** si algo falta o está ambiguo, marcarlo y preguntar.

### Ambigüedades abiertas (resolver antes del esquema)
- Nombres de campo del mock (español) → columnas DB.
- `clientes` vs `leads`: el mock tiene `leads` pero no datos de `clientes`; falta el corte.
- `busquedas`/`matches`: el contrato pide `matches` inmutable con fks, pero el mock
  de `busquedas` no tiene ids/fks. Resolver en el esquema.
- Mapa de los 4 roles → policies RLS (incluido cómo el Super Admin saltea el filtro
  de tenant: policy aparte / bypass por rol).
- Cómo se resuelve el `inmobiliaria_id` del usuario en el server (claim en el JWT
  vs. lookup a `usuarios`) — definir antes de escribir las policies.

## Frontera de scope del MVP
DENTRO: scaffold + front de honex-app (10 secciones, mock) · capa de datos
abstraída · Supabase (migraciones + RLS de doble capa: tenant + 4 roles · auth) ·
motor mockeado con la forma del contrato · **script de seed que crea DOS
inmobiliarias distintas con su propia data** (para verificar el aislamiento por
tenant: logueado en una, no ves nada de la otra) · 1 sección end-to-end a datos
reales (vertical slice: Leads o Chats), respetando el filtro por tenant.

FUERA (fase 2-3): bot real (n8n) · webhook real de Tokko · WhatsApp/360dialog ·
Meta Ads API · Analista LLM real.

## Convenciones — trabajamos spec-driven
Spec antes que código. Si algo no está definido, se **marca y se pregunta** — no se
inventa. Abstraer cada borde (Tokko, canal, datos), mockear, y dejar el swap a un
solo punto.

## Estado actual (hecho en esta sesión)
- Scaffold Next 16 + TS + Tailwind v4.
- Front de honex-app portado: 10 secciones navegables con datos **mock** vía repositorio.
- Capa de datos abstraída (mock → swappable a Supabase).
- Contratos de borde definidos: `/honex/search` (con mock, input ya con
  `inmobiliaria_id`) y `Channel` (interfaz).
- Multi-tenant incorporado al plan: roles a 4 niveles, RLS de doble capa, seed de
  dos tenants. **El esquema sigue sin crearse** (a acordar campos primero).
- **Pendiente (próxima sesión):** acordar esquema multi-tenant → migraciones
  Supabase + RLS doble capa + auth + seed de 2 inmobiliarias; vertical slice de una
  sección a datos reales con filtro por tenant.

## .env.local (lo crea el dev a mano, NO va en git)
```
NEXT_PUBLIC_SUPABASE_URL=...            # Project URL — pública
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...  # pública (cliente)
SUPABASE_SECRET_KEY=sb_secret_...       # solo server, nunca al cliente
DATABASE_URL=...                        # pooler, para migraciones
```
Formato de keys nuevo de Supabase (`sb_publishable_` / `sb_secret_`). La publishable
es segura para el cliente: **la protección la da el RLS**, así que las policies por
rol NO son opcionales. `.env*` ya está en `.gitignore`.
