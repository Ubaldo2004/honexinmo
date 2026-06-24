"use client";

import { useState } from "react";
import { Card } from "@/components/panel/ui";
import { agregarRango, quitarRango } from "./actions";

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

type Range = { id: string; usuarioId: string; dia: string; horaInicio: string; horaFin: string };
type Vend = { id: string; nombre: string; rol: string };

export default function AgendaClient({
  vendedores,
  slots,
  currentUserId,
  esAdmin,
}: {
  vendedores: Vend[];
  slots: Range[];
  currentUserId: string;
  esAdmin: boolean;
}) {
  const [ranges, setRanges] = useState<Range[]>(slots);

  if (vendedores.length === 0) {
    return <Card className="px-4 py-10 text-center text-sm text-zinc-500">No hay vendedores cargados en la inmobiliaria.</Card>;
  }

  return (
    <div className="space-y-4">
      {vendedores.map((v) => {
        const editable = esAdmin || v.id === currentUserId;
        return (
          <Card key={v.id} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-semibold">
                {v.nombre}{" "}
                <span className="text-[11px] font-normal text-zinc-500">· {v.rol === "agente_visitas" ? "agente de visitas" : v.rol}</span>
              </div>
              {!editable && <span className="text-[11px] text-zinc-600">solo lectura</span>}
            </div>
            <div>
              {DIAS.map((d) => (
                <DiaAgenda
                  key={d}
                  vend={v}
                  dia={d}
                  editable={editable}
                  ranges={ranges.filter((r) => r.usuarioId === v.id && r.dia === d)}
                  onAdd={(r) => setRanges((prev) => [...prev, r])}
                  onRemove={(id) => setRanges((prev) => prev.filter((r) => r.id !== id))}
                />
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DiaAgenda({
  vend,
  dia,
  editable,
  ranges,
  onAdd,
  onRemove,
}: {
  vend: Vend;
  dia: string;
  editable: boolean;
  ranges: Range[];
  onAdd: (r: Range) => void;
  onRemove: (id: string) => void;
}) {
  const [desde, setDesde] = useState("09:00");
  const [hasta, setHasta] = useState("13:00");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (busy) return;
    if (hasta <= desde) { alert("El 'hasta' tiene que ser mayor que el 'desde'"); return; }
    setBusy(true);
    const res = await agregarRango(vend.id, dia, desde, hasta);
    setBusy(false);
    if (!res.ok || !res.id) { alert(res.error ?? "No se pudo agregar"); return; }
    onAdd({ id: res.id, usuarioId: vend.id, dia, horaInicio: desde, horaFin: hasta });
  }

  async function remove(id: string) {
    const res = await quitarRango(id);
    if (!res.ok) { alert(res.error ?? "No se pudo quitar"); return; }
    onRemove(id);
  }

  const sorted = [...ranges].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line/50 py-2 first:border-t-0">
      <div className="w-20 shrink-0 text-sm capitalize text-zinc-300">{dia}</div>
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {sorted.length === 0 && !editable && <span className="text-[11px] text-zinc-600">—</span>}
        {sorted.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1.5 rounded-md border border-ok/40 bg-ok/15 px-2 py-1 text-[11px] font-medium text-ok">
            {r.horaInicio}–{r.horaFin}
            {editable && (
              <button onClick={() => remove(r.id)} className="cursor-pointer leading-none text-ok/70 hover:text-ok" aria-label="Quitar">✕</button>
            )}
          </span>
        ))}
        {editable && (
          <span className="inline-flex items-center gap-1">
            <input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} className="rounded-md border border-line bg-ink-900 px-1.5 py-1 text-[11px] outline-none focus:border-brand-400/60" />
            <span className="text-zinc-600">–</span>
            <input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} className="rounded-md border border-line bg-ink-900 px-1.5 py-1 text-[11px] outline-none focus:border-brand-400/60" />
            <button onClick={add} disabled={busy} className="cursor-pointer rounded-md border border-brand-400/50 bg-brand-400/15 px-2 py-1 text-[11px] font-semibold text-brand-200 hover:bg-brand-400/25 disabled:opacity-50">+ Agregar</button>
          </span>
        )}
      </div>
    </div>
  );
}
