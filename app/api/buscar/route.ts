// API route de Honex: recibe la búsqueda del panel y pega al webhook de n8n que
// invoca `buscar_propiedad` (modo 1 — preview, no manda Telegram). El vendedor se
// resuelve solo en el server: agarra al azar un agente de visitas del tenant con
// Telegram ID (tokko) cargado — igual que el bot. La UI no pide ningún id.
//
// El webhook devuelve { total_combinado, filtros_aplicados, api:{propiedades}, red:{propiedades} }.

import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient as createAdmin } from "@supabase/supabase-js";

export const runtime = "nodejs";

const WEBHOOK_URL =
  process.env.N8N_SEARCH_WEBHOOK_URL ??
  "https://n8n.tokko-finder.gachetponzellini.com/webhook/honex/search-v2";

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function POST(req: Request) {
  let payload: { filtros?: string; limit?: number };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { filtros, limit } = payload;
  if (!filtros?.trim()) {
    return NextResponse.json({ ok: false, error: "Falta el texto de búsqueda" }, { status: 400 });
  }

  const ctx = await getSessionContext();
  if (!ctx?.inmobiliariaId) {
    return NextResponse.json({ ok: false, error: "Sin sesión / inmobiliaria" }, { status: 401 });
  }

  // Elegir un agente de visitas al azar con Telegram ID (tokko) cargado — como el bot.
  const { data: vends } = await admin
    .from("usuarios")
    .select("tokko_vendedor_id")
    .eq("inmobiliaria_id", ctx.inmobiliariaId)
    .eq("rol", "agente_visitas")
    .not("tokko_vendedor_id", "is", null);
  const ids = (vends ?? []).map((v) => v.tokko_vendedor_id as string).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No hay agentes de visitas con Telegram ID cargado. Cargalo en Usuarios." },
      { status: 400 },
    );
  }
  const telegram_id = ids[Math.floor(Math.random() * ids.length)];

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegram_id, filtros, limit: limit ?? 10 }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `motor respondió ${res.status} ${res.statusText}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    // El motor ahora devuelve una lista plana `propiedades` (cada una con su `origen`).
    // Fallback al formato viejo api/red por si algún webhook todavía lo usa.
    const propiedades: Record<string, unknown>[] = Array.isArray(data?.propiedades)
      ? data.propiedades
      : [
          ...(Array.isArray(data?.api?.propiedades) ? data.api.propiedades.map((p: Record<string, unknown>) => ({ ...p, origen: "propia" })) : []),
          ...(Array.isArray(data?.red?.propiedades) ? data.red.propiedades.map((p: Record<string, unknown>) => ({ ...p, origen: "red" })) : []),
        ];

    return NextResponse.json({
      ok: true,
      descripcion: data?.filtros_aplicados?.descripcion ?? "",
      total: data?.total_combinado ?? propiedades.length,
      total_propias: propiedades.filter((p) => p.origen === "propia").length,
      total_red: propiedades.filter((p) => p.origen === "red").length,
      propiedades,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error desconocido" },
      { status: 500 },
    );
  }
}
