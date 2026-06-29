"use client";

import { useState } from "react";
import { Card, anclaData, anclaLabel, type AnclaProp } from "@/components/panel/ui";
import { FichaModal } from "@/components/panel/FichaModal";

export type Item = { criterios: string; t: string; resultados: number; repetida: boolean };
export type Grupo = { lead: string; ancla: string; items: Item[] };

export default function BusquedasClient({ grupos }: { grupos: Grupo[] }) {
  if (grupos.length === 0) {
    return <Card className="px-4 py-10 text-center text-sm text-zinc-500">No hay búsquedas todavía.</Card>;
  }
  return (
    <div className="space-y-2">
      {grupos.map((g, i) => <GrupoRow key={i} g={g} />)}
    </div>
  );
}

function GrupoRow({ g }: { g: Grupo }) {
  const [open, setOpen] = useState(false);
  const [ficha, setFicha] = useState<AnclaProp | null>(null);
  const distintas = new Set(g.items.map((it) => it.criterios.trim().toLowerCase())).size;
  const repetidas = g.items.filter((it) => it.repetida).length;
  const ultima = g.items[0]?.t ?? "";
  const anclaProp = anclaData(g.ancla);
  const anclaTxt = anclaLabel(g.ancla);

  return (
    <Card className="overflow-hidden p-0">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/3">
        <span className={"shrink-0 text-[10px] text-zinc-500 transition " + (open ? "rotate-90" : "")}>▶</span>
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/5 font-mono text-xs text-zinc-300">{(g.lead || "—").slice(0, 2)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{g.lead || "—"}</span>
            {anclaTxt !== "—" && (anclaProp ? (
              <span
                onClick={(e) => { e.stopPropagation(); setFicha(anclaProp); }}
                className="shrink-0 cursor-pointer rounded border border-brand-400/30 bg-brand-400/10 px-1.5 py-0.5 text-[11px] text-brand-200 transition hover:bg-brand-400/20"
              >
                {anclaTxt} ↗
              </span>
            ) : (
              <span className="truncate text-[11px] text-zinc-500">· {anclaTxt}</span>
            ))}
          </div>
          <div className="text-[11px] text-zinc-500">
            {g.items.length} búsqueda{g.items.length === 1 ? "" : "s"} · {distintas} distinta{distintas === 1 ? "" : "s"}
            {repetidas > 0 && <span className="text-warn"> · {repetidas} repetida{repetidas === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <span className="shrink-0 font-mono text-[11px] text-zinc-600">{ultima}</span>
      </button>

      {open && (
        <div className="border-t border-line bg-black/20">
          {g.items.map((it, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-line/40 px-4 py-2 last:border-b-0">
              <span className="w-12 shrink-0 text-center font-mono text-[10px] text-zinc-600">#{g.items.length - i}</span>
              <div className="min-w-0 flex-1 text-[13px] text-zinc-300">{it.criterios}</div>
              {it.repetida && <span className="pill shrink-0 bg-warn/15 text-warn">repetida</span>}
              <span className="w-10 shrink-0 text-right font-mono text-[11px] text-brand-300" title="resultados">{it.resultados}</span>
              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-zinc-600">{it.t}</span>
            </div>
          ))}
        </div>
      )}
      {ficha && <FichaModal prop={ficha} onClose={() => setFicha(null)} />}
    </Card>
  );
}
