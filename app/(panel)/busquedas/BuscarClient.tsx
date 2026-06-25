"use client";

// Buscador EN VIVO: pega al motor real (n8n → buscar_propiedad modo 1) vía /api/buscar.
// El vendedor lo resuelve el server: agarra un agente de visitas al azar (como el bot).

import { useState } from "react";
import { Card } from "@/components/panel/ui";

type Propiedad = {
  id?: number | string;
  ubicacion?: string;
  direccion?: string;
  precio?: number | null;
  moneda?: string;
  tipo?: string;
  dormitorios?: number | null;
  ambientes?: number | null;
  banos?: number | null;
  toilettes?: number | null;
  cocheras?: number | null;
  sup_cubierta?: number | null;
  sup_total?: number | null;
  sup_terreno?: number | null;
  antiguedad?: number | null;
  expensas?: number | null;
  foto?: string;
  url?: string;
  inmobiliaria?: string;
  amenities?: Record<string, boolean> | null;
  origen?: string;
};

// amenities (claves del motor) → etiqueta en español, para el modal.
const AMENITY_ES: Record<string, string> = {
  pool: "Pileta", balcony: "Balcón", gym: "Gimnasio", garden: "Jardín",
  terrace: "Terraza", patio: "Patio", BBQ: "Parrilla", sum: "SUM",
  security: "Seguridad", security_24h: "Seguridad 24hs", lift: "Ascensor",
  laundry: "Laundry", pets_allowed: "Apto mascotas", furnished: "Amoblado",
  professional_use: "Apto profesional", air_conditioning: "Aire acondicionado",
  heating: "Calefacción", central_heating: "Calefacción central", storage_room: "Baulera",
  covered_parking: "Cochera cubierta", uncovered_parking: "Cochera descubierta",
  amenities: "Amenities", sauna: "Sauna", jacuzzi: "Jacuzzi", solarium: "Solárium",
  paddle: "Paddle", tennis: "Tenis", soccer: "Fútbol", bright: "Luminoso",
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
  const [selected, setSelected] = useState<Propiedad | null>(null);
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
        body: JSON.stringify({ filtros, limit: 10 }),
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
        <div className="mt-3 flex justify-end">
          <button
            onClick={buscar}
            disabled={loading || !filtros.trim()}
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
                <button
                  key={i}
                  onClick={() => setSelected(p)}
                  className="card flex cursor-pointer flex-col gap-2 text-left transition hover:border-brand-400/40"
                >
                  {p.foto && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.foto} alt={p.tipo || "propiedad"} className="-mx-1 -mt-1 mb-1 h-32 w-[calc(100%+0.5rem)] rounded-t-lg object-cover" />
                  )}
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
                  <div className="mt-1 text-[11px] font-semibold text-brand-300">Ver detalle ↗</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-line bg-ink-850 px-4 py-6 text-center text-sm text-zinc-500">
              No se encontraron propiedades para esos criterios.
            </div>
          )}
        </div>
      )}

      {selected && <PropiedadModal p={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function PropiedadModal({ p, onClose }: { p: Propiedad; onClose: () => void }) {
  const precio = p.precio != null ? `${p.moneda ?? "USD"} ${Number(p.precio).toLocaleString("es-AR")}` : "Consultar";
  const tags = [
    p.ambientes ? `${p.ambientes} amb` : null,
    p.dormitorios ? `${p.dormitorios} dorm` : null,
    p.banos ? `${p.banos} baños` : null,
    p.toilettes ? `${p.toilettes} toilette` : null,
    p.cocheras ? `${p.cocheras} cochera` : null,
    p.sup_cubierta ? `${p.sup_cubierta} m² cub` : null,
    p.sup_total ? `${p.sup_total} m² tot` : null,
    p.sup_terreno ? `${p.sup_terreno} m² terreno` : null,
  ].filter(Boolean) as string[];

  const extra: [string, string][] = [];
  if (p.direccion) extra.push(["Dirección", p.direccion]);
  if (p.antiguedad != null) extra.push(["Antigüedad", Number(p.antiguedad) <= 0 ? "A estrenar" : `${p.antiguedad} años`]);
  if (p.expensas != null && Number(p.expensas) > 0) extra.push(["Expensas", `${p.moneda ?? ""} ${Number(p.expensas).toLocaleString("es-AR")}`.trim()]);
  if (p.inmobiliaria) extra.push(["Inmobiliaria", p.inmobiliaria]);

  const amenities = p.amenities ? Object.entries(p.amenities).filter(([, v]) => v).map(([k]) => AMENITY_ES[k] ?? k) : [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-ink-950" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-48 bg-gradient-to-br from-ink-800 to-ink-900">
          {p.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.foto} alt={p.tipo || "propiedad"} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-xs text-zinc-600">📷 sin foto</div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[11px] text-zinc-200">📍 {p.origen === "propia" ? "Propia" : "Red Tokko"}</span>
        </div>
        <div className="p-4">
          <div className="text-base font-semibold text-zinc-100">{p.tipo || "Propiedad"}</div>
          <div className="text-xs text-zinc-500">{p.ubicacion || ""}</div>
          <div className="mt-2 font-mono text-xl font-bold text-brand-300">{precio}</div>

          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t, i) => <span key={i} className="rounded-md border border-line bg-ink-850 px-2 py-1 text-[11px] text-zinc-400">{t}</span>)}
            </div>
          )}

          {extra.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
              {extra.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><span className="text-zinc-500">{k}</span><span className="text-right text-zinc-300">{v}</span></div>
              ))}
            </div>
          )}

          {amenities.length > 0 && (
            <div className="mt-3 border-t border-line pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Amenities</div>
              <div className="flex flex-wrap gap-1.5">
                {amenities.map((a) => <span key={a} className="rounded-md border border-brand-400/30 bg-brand-400/10 px-2 py-1 text-[11px] text-brand-200">{a}</span>)}
              </div>
            </div>
          )}

          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-lg border border-brand-400/40 bg-brand-400/10 py-2 text-center text-xs font-semibold text-brand-200 transition hover:bg-brand-400/20">
              Ver en Tokko ↗
            </a>
          ) : (
            <div className="mt-4 rounded-lg border border-line bg-ink-900 px-3 py-2 text-center text-[11px] text-zinc-500">Sin link a Tokko</div>
          )}
          <button onClick={onClose} className="mt-2 w-full cursor-pointer rounded-lg border border-line py-2 text-xs text-zinc-300 hover:bg-white/5">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
