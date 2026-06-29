"use client";

import { useState } from "react";
import { Card, anclaLabel, anclaData, type AnclaProp } from "@/components/panel/ui";
import { FichaModal } from "@/components/panel/FichaModal";
import type { Lead } from "@/lib/data/types";
import { actualizarLead, eliminarLead } from "./actions";

const ETAPAS = ["Calificación", "Búsqueda", "Visita", "Seguimiento", "Operación"];

// Piso de score por etapa (espejo de SCORE_POR_ETAPA en leads/actions.ts) para reflejar
// el cambio al instante en la barra. El 100 es Operación = venta cerrada.
const SCORE_POR_ETAPA: Record<string, number> = {
  Calificación: 15, Búsqueda: 35, Visita: 85, Seguimiento: 90, Operación: 100,
};

const ec: Record<string, string> = {
  Calificación: "text-zinc-300 bg-white/5 border-white/10",
  Búsqueda: "text-brand-300 bg-brand-400/10 border-brand-400/30",
  Seguimiento: "text-sky-300 bg-sky-400/10 border-sky-400/30",
  Visita: "text-warn bg-warn/10 border-warn/30",
  Operación: "text-ok bg-ok/10 border-ok/30",
};

export default function LeadsClient({ leads: initial }: { leads: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ficha, setFicha] = useState<AnclaProp | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "basura">("todos");

  const basuraCount = leads.filter((l) => l.basura).length;
  const visibleLeads = filtro === "basura" ? leads.filter((l) => l.basura) : leads;

  async function setEtapa(l: Lead, etapa: string) {
    if (!l.id) return;
    const prev = leads;
    const piso = SCORE_POR_ETAPA[etapa] ?? 0;
    setLeads((p) => p.map((x) => (x.id === l.id ? { ...x, etapa, score: Math.max(x.score, piso) } : x)));
    const res = await actualizarLead(l.id, { etapa });
    if (!res.ok) {
      alert(res.error ?? "No se pudo cambiar la etapa");
      setLeads(prev);
    }
  }

  async function borrar(l: Lead) {
    if (!l.id) return;
    if (!confirm(`¿Eliminar el lead "${l.nombre}"? Se borra también su conversación.`)) return;
    setBusyId(l.id);
    const res = await eliminarLead(l.id);
    setBusyId(null);
    if (!res.ok) {
      alert(res.error ?? "No se pudo eliminar");
      return;
    }
    setLeads((p) => p.filter((x) => x.id !== l.id));
  }

  function onSaved(id: string, patch: Partial<Lead>) {
    setLeads((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    setEditing(null);
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm text-zinc-400">
          <span className="font-mono text-brand-300">{visibleLeads.length}</span> lead{visibleLeads.length === 1 ? "" : "s"}
          {filtro === "basura" && <span className="text-zinc-600"> · basura</span>}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-ink-900 p-0.5 text-xs">
          <button
            onClick={() => setFiltro("todos")}
            className={"rounded-md px-2.5 py-1 transition " + (filtro === "todos" ? "bg-white/10 text-zinc-100" : "text-zinc-400 hover:text-zinc-200")}
          >
            Todos
          </button>
          <button
            onClick={() => setFiltro("basura")}
            className={"rounded-md px-2.5 py-1 transition " + (filtro === "basura" ? "bg-bad/20 text-bad" : "text-zinc-400 hover:text-zinc-200")}
          >
            Basura{basuraCount > 0 ? ` (${basuraCount})` : ""}
          </button>
        </div>
      </div>

      <Card className="overflow-x-auto p-0">
        {visibleLeads.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-500">
            {filtro === "basura" ? "No hay leads en basura." : "No hay leads todavía."}<br />
            <span className="text-xs text-zinc-600">
              {filtro === "basura"
                ? "Acá caen los leads que no avanzaron (sin respuesta 7 días, baja probabilidad)."
                : "Entran solos cuando alguien le escribe al bot de Telegram."}
            </span>
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-line bg-ink-850 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-2.5">Lead</th>
                <th className="px-4 py-2.5">Etapa</th>
                <th className="px-4 py-2.5">Score</th>
                <th className="px-4 py-2.5">Ancla</th>
                <th className="px-4 py-2.5">Vino de (ADS)</th>
                <th className="px-4 py-2.5">Asignado</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {visibleLeads.map((l) => (
                <tr key={l.id ?? l.tel} className={"hoverable border-b border-line/60" + (l.basura ? " bg-bad/[0.04]" : "")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{l.nombre}</span>
                      {l.basura && <span className="rounded-full bg-bad/15 px-1.5 py-0.5 text-[10px] font-medium text-bad">basura</span>}
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500">{l.tel || "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={ETAPAS.includes(l.etapa) ? l.etapa : "Calificación"}
                      onChange={(e) => setEtapa(l, e.target.value)}
                      className={"cursor-pointer rounded-full border px-2 py-1 text-[11px] font-medium outline-none " + (ec[l.etapa] ?? ec["Calificación"])}
                    >
                      {ETAPAS.map((e) => (
                        <option key={e} value={e} className="bg-ink-900 text-zinc-200">{e}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/5">
                        <div className="h-full bg-brand-400" style={{ width: l.score + "%" }} />
                      </div>
                      <span className="font-mono text-xs text-zinc-400">{l.score}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {(() => {
                      const d = anclaData(l.ancla);
                      return d ? (
                        <button
                          onClick={() => setFicha(d)}
                          className="rounded-md border border-line bg-ink-850 px-2 py-1 text-[12px] text-zinc-200 transition hover:border-brand-400/40 hover:bg-brand-400/10"
                        >
                          {anclaLabel(l.ancla)} <span className="text-zinc-500">↗</span>
                        </button>
                      ) : (
                        anclaLabel(l.ancla)
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3"><span className="font-mono text-[11px] text-zinc-500">{l.origen || "—"}</span></td>
                  <td className="px-4 py-3"><span className={l.asignado === "bot" ? "text-brand-300" : "text-zinc-300"}>{l.asignado}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setEditing(l)}
                        disabled={!l.id}
                        className="rounded-md border border-line px-2 py-1 text-[11px] text-zinc-300 transition hover:bg-white/5 disabled:opacity-40"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => borrar(l)}
                        disabled={!l.id || busyId === l.id}
                        className="rounded-md border border-bad/40 px-2 py-1 text-[11px] text-bad transition hover:bg-bad/10 disabled:opacity-40"
                      >
                        {busyId === l.id ? "…" : "Eliminar"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && <EditModal lead={editing} onClose={() => setEditing(null)} onSaved={onSaved} />}
      {ficha && <FichaModal prop={ficha} onClose={() => setFicha(null)} />}
    </>
  );
}

function EditModal({
  lead,
  onClose,
  onSaved,
}: {
  lead: Lead;
  onClose: () => void;
  onSaved: (id: string, patch: Partial<Lead>) => void;
}) {
  const [nombre, setNombre] = useState(lead.nombre);
  const [tel, setTel] = useState(lead.tel);
  const [score, setScore] = useState(String(lead.score));
  const [ancla, setAncla] = useState(lead.ancla);
  const [asignado, setAsignado] = useState(lead.asignado);
  const [etapa, setEtapa] = useState(ETAPAS.includes(lead.etapa) ? lead.etapa : "Calificación");
  const [saving, setSaving] = useState(false);

  async function guardar() {
    if (!lead.id) return;
    setSaving(true);
    const scoreNum = Math.max(0, Math.min(100, parseInt(score, 10) || 0));
    const res = await actualizarLead(lead.id, {
      nombre: nombre.trim(),
      telefono: tel.trim(),
      etapa,
      score: scoreNum,
      ancla: ancla.trim(),
      asignado_label: asignado.trim(),
    });
    setSaving(false);
    if (!res.ok) {
      alert(res.error ?? "No se pudo guardar");
      return;
    }
    onSaved(lead.id, { nombre: nombre.trim(), tel: tel.trim(), etapa, score: scoreNum, ancla: ancla.trim(), asignado: asignado.trim() });
  }

  const field = "w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/60";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-ink-950 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-sm font-semibold">Editar lead</div>
        <div className="space-y-3">
          <label className="block text-[11px] text-zinc-500">Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={field} />
          </label>
          <label className="block text-[11px] text-zinc-500">Teléfono
            <input value={tel} onChange={(e) => setTel(e.target.value)} className={field} />
          </label>
          <div className="flex gap-3">
            <label className="block flex-1 text-[11px] text-zinc-500">Etapa
              <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={field}>
                {ETAPAS.map((e) => <option key={e} value={e} className="bg-ink-900">{e}</option>)}
              </select>
            </label>
            <label className="block w-24 text-[11px] text-zinc-500">Score
              <input type="number" min={0} max={100} value={score} onChange={(e) => setScore(e.target.value)} className={field} />
            </label>
          </div>
          <label className="block text-[11px] text-zinc-500">Propiedad ancla
            <input value={ancla} onChange={(e) => setAncla(e.target.value)} className={field} />
          </label>
          <label className="block text-[11px] text-zinc-500">Asignado a
            <input value={asignado} onChange={(e) => setAsignado(e.target.value)} className={field} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-xs text-zinc-300 hover:bg-white/5">Cancelar</button>
          <button onClick={guardar} disabled={saving || !nombre.trim()} className="rounded-lg bg-brand-400 px-4 py-2 text-xs font-semibold text-ink-950 hover:bg-brand-300 disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
