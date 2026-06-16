"use client";

// Buscador EN VIVO: pega al motor real (n8n → buscar_propiedad modo 1) vía /api/buscar.
// MVP: el vendedor se pasa por id (demo: Ubaldo). El selector por nombre viene después.

import { useState } from "react";
import { Card } from "@/components/panel/ui";

// Vendedor demo (Ubaldo) — se reemplaza por un selector contra la tabla `vendedores`.
const VENDEDOR_DEMO = "25e94c02-03ee-4272-8003-57f6dcebd36c";

type Propiedad = {
  ubicacion?: string;
  direccion?: string;
  precio?: number | null;
  moneda?: string;
  tipo?: string;
  dormitorios?: number | null;
  ambientes?: number | null;
  banos?: number | null;
  cocheras?: number | null;
  sup_cubierta?: number | null;
  sup_total?: number | null;
  origen?: string;
};

type Respuesta = {
  ok: boolean;
  error?: string;
  descripcion?: string;
  total?: number;
  total_propias?: number;
  total_red?: number;
  propiedades?: Propiedad[];
};

function precioFmt(p: Propiedad) {
  if (p.precio == null) return "Consultar";
  return `${p.moneda ?? "USD"} ${Number(p.precio).toLocaleString("es-AR")}`;
}

export function BuscarClient() {
  const [filtros, setFiltros] = useState("");
  const [vendedor, setVendedor] = useState(VENDEDOR_DEMO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Respuesta | null>(null);

  async function buscar() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch("/api/buscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filtros, vendedor_id: vendedor, limit: 10 }),
      });
      const json: Respuesta = await res.json();
      if (!json.ok) throw new Error(json.error ?? "error del motor");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-6">
      <Card>
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Buscar en la red (motor Tokko — en vivo)
        </div>
        <textarea
          value={filtros}
          onChange={(e) => setFiltros(e.target.value)}
          rows={2}
          placeholder="¿Qué busca el comprador? Ej: Departamento 2 ambientes en Pichincha hasta 90.000 USD"
          className="w-full resize-none rounded-lg border border-line bg-ink-850 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-400/50"
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
            Vendedor (id)
            <input
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              className="w-[320px] max-w-full rounded-lg border border-line bg-ink-850 px-3 py-1.5 font-mono text-xs text-zinc-300 outline-none focus:border-brand-400/50"
            />
          </label>
          <button
            onClick={buscar}
            disabled={loading || !filtros.trim() || !vendedor.trim()}
            className="rounded-lg border border-brand-400/50 bg-brand-400/15 px-4 py-2 text-xs font-semibold text-brand-200 transition hover:bg-brand-400/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </Card>

      {error && (
        <div className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">
          {error}
        </div>
      )}

      {data && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono text-brand-300">{data.total} resultados</span>
            {data.descripcion && <span className="text-zinc-400">· {data.descripcion}</span>}
            <span className="text-[11px] text-zinc-600">
              ({data.total_propias} propias · {data.total_red} red)
            </span>
          </div>

          {data.propiedades && data.propiedades.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.propiedades.map((p, i) => (
                <Card key={i} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">{p.tipo || "Propiedad"}</div>
                      <div className="text-xs text-zinc-400">{p.ubicacion}</div>
                    </div>
                    <span
                      className={
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium " +
                        (p.origen === "propia" ? "bg-brand-400/15 text-brand-200" : "bg-white/5 text-zinc-400")
                      }
                    >
                      {p.origen}
                    </span>
                  </div>
                  <div className="font-mono text-base text-brand-300">{precioFmt(p)}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
                    {p.dormitorios != null && p.dormitorios > 0 && <span>{p.dormitorios} dorm</span>}
                    {p.banos != null && p.banos > 0 && <span>{p.banos} baños</span>}
                    {p.ambientes != null && p.ambientes > 0 && <span>{p.ambientes} amb</span>}
                    {p.sup_cubierta != null && <span>{p.sup_cubierta} m² cub</span>}
                    {p.sup_total != null && <span>{p.sup_total} m² tot</span>}
                  </div>
                  {p.direccion && <div className="text-[11px] text-zinc-600">{p.direccion}</div>}
                </Card>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-ink-850 px-4 py-6 text-center text-sm text-zinc-500">
              No se encontraron propiedades para esos criterios.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
