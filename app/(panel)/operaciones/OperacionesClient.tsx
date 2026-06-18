"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/panel/ui";
import type { Operacion } from "@/lib/data/types";
import { crearOperacion, cambiarEstadoOperacion, eliminarOperacion } from "./actions";

const ESTADOS = ["Seña", "En escritura", "Cerrada", "Caída"];
const ESTADO_COLOR: Record<string, string> = {
  "Seña": "bg-warn/15 text-warn",
  "En escritura": "bg-sky-400/15 text-sky-300",
  "Cerrada": "bg-ok/15 text-ok",
  "Caída": "bg-bad/15 text-bad",
};
const field = "w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/60";

export default function OperacionesClient({ operaciones }: { operaciones: Operacion[] }) {
  const router = useRouter();
  const [f, setF] = useState({ prop: "", cliente: "", colega: "", monto: "", comision: "", split: "", estado: "Seña" });
  const [busy, setBusy] = useState(false);
  const [abierto, setAbierto] = useState(false);

  function set(k: keyof typeof f, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function crear() {
    if (!f.prop.trim() || !f.cliente.trim() || busy) return;
    setBusy(true);
    const res = await crearOperacion(f);
    setBusy(false);
    if (!res.ok) { alert(res.error ?? "No se pudo crear"); return; }
    setF({ prop: "", cliente: "", colega: "", monto: "", comision: "", split: "", estado: "Seña" });
    setAbierto(false);
    router.refresh();
  }
  async function cambiarEstado(id: string, estado: string) {
    const res = await cambiarEstadoOperacion(id, estado);
    if (!res.ok) alert(res.error ?? "Error");
    router.refresh();
  }
  async function borrar(id: string) {
    if (!confirm("¿Eliminar esta operación?")) return;
    const res = await eliminarOperacion(id);
    if (!res.ok) { alert(res.error ?? "Error"); return; }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-zinc-400">
        <span className="font-semibold text-zinc-200">Operaciones.</span> Cuando un trato avanza (seña → cierre), registralo acá
        con el <strong>reparto de comisión</strong> entre tu inmobiliaria y el colega dueño del aviso. Trazabilidad total.
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-zinc-400"><span className="font-mono text-brand-300">{operaciones.length}</span> operación{operaciones.length === 1 ? "" : "es"}</div>
        <button onClick={() => setAbierto((o) => !o)} className="rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-300">
          {abierto ? "Cancelar" : "+ Nueva operación"}
        </button>
      </div>

      {abierto && (
        <Card className="p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Registrar operación</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] text-zinc-500">Propiedad
              <input value={f.prop} onChange={(e) => set("prop", e.target.value)} placeholder="Depto Pichincha · Mendoza 2540" className={field} />
            </label>
            <label className="block text-[11px] text-zinc-500">Cliente
              <input value={f.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Luis" className={field} />
            </label>
            <label className="block text-[11px] text-zinc-500">Colega / inmobiliaria dueña del aviso
              <input value={f.colega} onChange={(e) => set("colega", e.target.value)} placeholder="Inmobiliaria Centro" className={field} />
            </label>
            <label className="block text-[11px] text-zinc-500">Monto
              <input value={f.monto} onChange={(e) => set("monto", e.target.value)} placeholder="USD 89.000" className={field} />
            </label>
            <label className="block text-[11px] text-zinc-500">Comisión
              <input value={f.comision} onChange={(e) => set("comision", e.target.value)} placeholder="USD 3.560 (4%)" className={field} />
            </label>
            <label className="block text-[11px] text-zinc-500">Reparto (split)
              <input value={f.split} onChange={(e) => set("split", e.target.value)} placeholder="50/50 — USD 1.780 c/u" className={field} />
            </label>
            <label className="block text-[11px] text-zinc-500">Estado
              <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={field}>
                {ESTADOS.map((e) => <option key={e} value={e} className="bg-ink-900">{e}</option>)}
              </select>
            </label>
          </div>
          <button onClick={crear} disabled={busy || !f.prop.trim() || !f.cliente.trim()} className="mt-4 rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-300 disabled:opacity-50">
            {busy ? "Guardando…" : "Registrar operación"}
          </button>
        </Card>
      )}

      <Card className="overflow-x-auto p-0">
        {operaciones.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            No hay operaciones todavía.<br />
            <span className="text-xs text-zinc-600">Registrá una con “+ Nueva operación” cuando un trato avance.</span>
          </div>
        ) : (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b border-line bg-ink-850 text-left text-xs text-zinc-500">
              <tr><th className="px-4 py-2.5">Propiedad</th><th className="px-4 py-2.5">Cliente</th><th className="px-4 py-2.5">Colega/fuente</th><th className="px-4 py-2.5">Monto</th><th className="px-4 py-2.5">Comisión</th><th className="px-4 py-2.5">Reparto</th><th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5"></th></tr>
            </thead>
            <tbody>{operaciones.map((o) => (
              <tr key={o.id ?? o.prop} className="hoverable border-b border-line/60">
                <td className="px-4 py-3 font-semibold">{o.prop}</td>
                <td className="px-4 py-3 text-zinc-300">{o.cliente}</td>
                <td className="px-4 py-3 text-zinc-400">{o.colega}</td>
                <td className="px-4 py-3 font-mono">{o.monto}</td>
                <td className="px-4 py-3 font-mono text-brand-300">{o.comision}</td>
                <td className="px-4 py-3 text-[11px] text-zinc-500">{o.split}</td>
                <td className="px-4 py-3">
                  {o.id ? (
                    <select value={o.estado} onChange={(e) => cambiarEstado(o.id as string, e.target.value)} className={"cursor-pointer rounded-full border border-line px-2 py-1 text-[11px] font-medium outline-none " + (ESTADO_COLOR[o.estado] ?? "bg-white/5 text-zinc-300")}>
                      {ESTADOS.map((e) => <option key={e} value={e} className="bg-ink-900 text-zinc-200">{e}</option>)}
                    </select>
                  ) : <span className="pill bg-white/5 text-zinc-300">{o.estado}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {o.id && <button onClick={() => borrar(o.id as string)} className="rounded-md border border-bad/40 px-2 py-1 text-[11px] text-bad hover:bg-bad/10">Eliminar</button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
