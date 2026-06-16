// API route de Honex: recibe la búsqueda del panel y pega al webhook de n8n que
// invoca `buscar_propiedad` (modo 1 — preview, no manda Telegram). Server-side:
// evita CORS y mantiene la URL del motor fuera del cliente.
//
// El webhook devuelve { total_combinado, filtros_aplicados, api:{propiedades}, red:{propiedades} }.
// Acá lo aplanamos a una sola lista para que la UI no dependa de esa forma.

import { NextResponse } from "next/server";

const WEBHOOK_URL =
  process.env.N8N_SEARCH_WEBHOOK_URL ??
  "https://n8n.tokko-finder.gachetponzellini.com/webhook/honex/search";

export async function POST(req: Request) {
  let payload: { filtros?: string; vendedor_id?: string; limit?: number };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const { filtros, vendedor_id, limit } = payload;
  if (!filtros || !vendedor_id) {
    return NextResponse.json({ ok: false, error: "Falta filtros o vendedor_id" }, { status: 400 });
  }

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filtros, vendedor_id, limit: limit ?? 10 }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `motor respondió ${res.status} ${res.statusText}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const api = Array.isArray(data?.api?.propiedades) ? data.api.propiedades : [];
    const red = Array.isArray(data?.red?.propiedades) ? data.red.propiedades : [];
    const propiedades = [
      ...api.map((p: Record<string, unknown>) => ({ ...p, origen: "propia" })),
      ...red.map((p: Record<string, unknown>) => ({ ...p, origen: "red" })),
    ];

    return NextResponse.json({
      ok: true,
      descripcion: data?.filtros_aplicados?.descripcion ?? "",
      total: data?.total_combinado ?? propiedades.length,
      total_propias: api.length,
      total_red: red.length,
      propiedades,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "error desconocido" },
      { status: 500 },
    );
  }
}
