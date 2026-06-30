// Átomos compartidos del panel (server-safe). Portados de honex-app.
import type { ReactNode } from "react";
import type { Prioridad, EstadoConversacion } from "@/lib/data/types";

export function Page({ children }: { children: ReactNode }) {
  return <div className="h-full overflow-y-auto p-4 md:p-6">{children}</div>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={"card " + className}>{children}</div>;
}

export function F({ l, children }: { l: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-500">{l}</span>
      <div className="font-medium">{children}</div>
    </div>
  );
}

export function A({ i: Icon, t, primary }: { i: (p: { className?: string }) => ReactNode; t: string; primary?: boolean }) {
  return (
    <button className={"flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition " + (primary ? "border-brand-400/50 bg-brand-400/15 text-brand-200" : "border-line text-zinc-300 hover:bg-white/3")}>
      <Icon className="h-4 w-4" /> {t}
    </button>
  );
}

export const prio: Record<Prioridad, string> = {
  critical: "text-bad bg-bad/10",
  high: "text-warn bg-warn/10",
  medium: "text-brand-300 bg-brand-400/10",
  low: "text-zinc-400 bg-white/5",
};

export const estadoPill: Record<EstadoConversacion, { c: string; t: string }> = {
  bot: { c: "bg-ok/10 text-ok", t: "bot activo" },
  handoff: { c: "bg-bad/15 text-bad", t: "handoff" },
  visita: { c: "bg-warn/15 text-warn", t: "coordinar visita" },
  seguimiento: { c: "bg-sky-400/15 text-sky-300", t: "seguimiento" },
  operacion: { c: "bg-white/8 text-zinc-300", t: "operación · bot OFF" },
};

// Propiedad-ancla: puede ser texto plano (legacy/campaña) o un JSON con la ficha
// completa de la propiedad que el cliente eligió. Estos helpers parsean ambos.
export type AnclaProp = {
  tipo?: string; ubicacion?: string; direccion?: string; precio?: number | null; moneda?: string;
  ambientes?: number | null; dormitorios?: number | null; banos?: number | null; toilettes?: number | null;
  sup_cubierta?: number | null; sup_total?: number | null; sup_terreno?: number | null; cocheras?: number | null;
  antiguedad?: number | null; expensas?: number | string | null; condicion?: string | null;
  orientacion?: string | null; disposicion?: string | null; origen?: string;
  foto?: string | null; url?: string | null;
  // Si es de la RED Tokko: datos de la inmobiliaria dueña, para que el operador la contacte
  // y coordine la visita. Es info INTERNA del panel — nunca se le manda al cliente.
  inmobiliaria?: string | null; contacto_nombre?: string | null;
  contacto_telefono?: string | null; contacto_email?: string | null;
  contacto_horario?: string | null; comision?: number | string | null;
};

export function anclaData(ancla?: string | null): AnclaProp | null {
  if (!ancla) return null;
  const t = ancla.trim();
  if (t.startsWith("{")) {
    try { return JSON.parse(t) as AnclaProp; } catch { return null; }
  }
  return null;
}

export function anclaLabel(ancla?: string | null): string {
  if (!ancla) return "—";
  const d = anclaData(ancla);
  if (d) return [d.tipo, d.ubicacion].filter(Boolean).join(" · ") || "Propiedad";
  return ancla;
}
