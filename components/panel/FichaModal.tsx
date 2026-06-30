"use client";

// Ficha de una propiedad (la propiedad-ancla del lead). Se usa en Chats y Búsquedas.
import type { AnclaProp } from "@/components/panel/ui";

export function FichaModal({ prop, onClose }: { prop: AnclaProp; onClose: () => void }) {
  const precio = prop.precio != null ? `${prop.moneda || "USD"} ${Number(prop.precio).toLocaleString("es-AR")}` : "Consultar";
  const tags = [
    prop.ambientes ? `${prop.ambientes} amb` : null,
    prop.dormitorios ? `${prop.dormitorios} dorm` : null,
    prop.banos ? `${prop.banos} baños` : null,
    prop.sup_cubierta ? `${prop.sup_cubierta} m² cub` : null,
    prop.sup_total ? `${prop.sup_total} m² tot` : null,
    prop.cocheras ? `${prop.cocheras} cochera` : null,
  ].filter(Boolean) as string[];
  const extra: [string, string][] = [];
  if (prop.direccion) extra.push(["Dirección", prop.direccion]);
  if (prop.antiguedad != null) extra.push(["Antigüedad", Number(prop.antiguedad) <= 0 ? "A estrenar" : `${prop.antiguedad} años`]);
  if (prop.expensas) extra.push(["Expensas", String(prop.expensas)]);
  if (prop.condicion) extra.push(["Estado", prop.condicion]);
  if (prop.orientacion) extra.push(["Orientación", prop.orientacion]);
  if (prop.disposicion) extra.push(["Disposición", prop.disposicion]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-ink-950" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-40 bg-gradient-to-br from-ink-800 to-ink-900">
          {prop.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prop.foto} alt={prop.tipo || "propiedad"} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-xs text-zinc-600">📷 sin foto</div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[11px] text-zinc-200">📍 {prop.origen === "propia" ? "Propia" : "Red Tokko"}</span>
        </div>
        <div className="p-4">
          <div className="text-base font-semibold text-zinc-100">{prop.tipo || "Propiedad"}</div>
          <div className="text-xs text-zinc-500">{prop.ubicacion || ""}</div>
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
          {(prop.contacto_telefono || prop.contacto_email || prop.contacto_nombre) && (
            <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs">
              <div className="mb-1.5 font-semibold text-warn">🤝 Inmobiliaria dueña (Red Tokko) — coordinar la visita con ellos</div>
              {(prop.contacto_nombre || prop.inmobiliaria) && (
                <div className="text-zinc-100">{prop.contacto_nombre || prop.inmobiliaria}</div>
              )}
              {prop.contacto_telefono && (
                <div className="mt-1"><span className="text-zinc-500">Tel: </span>
                  <a href={`tel:${String(prop.contacto_telefono).replace(/[^0-9+]/g, "")}`} className="text-brand-200 underline">{prop.contacto_telefono}</a>
                </div>
              )}
              {prop.contacto_email && (
                <div><span className="text-zinc-500">Email: </span>
                  <a href={`mailto:${prop.contacto_email}`} className="text-brand-200 underline break-all">{prop.contacto_email}</a>
                </div>
              )}
              {prop.contacto_horario && <div className="mt-1 text-zinc-400">{prop.contacto_horario}</div>}
              {prop.comision != null && prop.comision !== "" && <div className="text-zinc-400">Comisión: {prop.comision}%</div>}
              <div className="mt-1.5 text-[10px] text-zinc-500">Solo para el equipo — no enviar al cliente.</div>
            </div>
          )}
          {prop.url ? (
            <a href={prop.url} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg border border-brand-400/40 bg-brand-400/10 py-2 text-center text-xs font-semibold text-brand-200 transition hover:bg-brand-400/20">
              Ver ficha en Tokko ↗
            </a>
          ) : (
            <div className="mt-3 rounded-lg border border-line bg-ink-900 px-3 py-2 text-center text-[11px] text-zinc-500">Sin link a Tokko</div>
          )}
          <button onClick={onClose} className="mt-3 w-full cursor-pointer rounded-lg border border-line py-2 text-xs text-zinc-300 hover:bg-white/5">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
