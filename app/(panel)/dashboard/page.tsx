import Link from "next/link";
import * as I from "@/components/icons";
import { Page, Card, prio } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

export default async function DashboardPage() {
  const data = await getRepository();
  const [kpis, acciones, funnel, demanda] = await Promise.all([
    data.getKpis(),
    data.getAcciones(),
    data.getFunnel(),
    data.getDemanda(),
  ]);

  // Demanda real por hora: normalizamos por el máximo y calculamos el pico.
  const maxD = Math.max(1, ...demanda);
  const totalD = demanda.reduce((a, b) => a + b, 0);
  const peakH = totalD ? demanda.indexOf(Math.max(...demanda)) : -1;
  const picoTxt = peakH >= 0
    ? `Pico ${peakH}-${(peakH + 1) % 24}h → mejor horario para pautar ADS.`
    : "Sin actividad todavía — se llena a medida que escriben al bot.";

  return (
    <Page>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.k} className="p-4"><div className="text-xs text-zinc-500">{k.k}</div><div className="mt-1 font-mono text-2xl font-bold">{k.v}</div>{k.d && <div className={"mt-0.5 text-[11px] font-semibold " + (k.warn ? "text-warn" : "text-brand-400")}>{k.d}</div>}</Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 font-semibold">Embudo de conversión</div>
          <div className="space-y-2.5">
            {funnel.map((f) => (
              <div key={f.k} className="flex items-center gap-3"><div className="w-20 shrink-0 text-xs text-zinc-400 sm:w-24">{f.k}</div>
                <div className="h-7 flex-1 overflow-hidden rounded-md bg-white/3"><div className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-brand-600 to-brand-300 pr-2 font-mono text-[11px] font-bold text-ink-950" style={{ width: Math.max(f.pct, 7) + "%" }}>{f.v.toLocaleString("es-AR")}</div></div>
                <div className="w-10 text-right font-mono text-[11px] text-brand-300">{f.pct}%</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between"><div className="font-semibold">Demanda · 24h</div><I.Trending className="h-4 w-4 text-brand-400" /></div>
          <div className="flex h-28 items-end gap-1">{demanda.map((v, i) => <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand-600/30 to-brand-400" style={{ height: Math.max(2, (v / maxD) * 100) + "%" }} title={`${i}:00 · ${v}`} />)}</div>
          <div className="mt-2 text-[10px] text-zinc-600">{picoTxt}</div>
        </Card>
      </div>
      <div className="mt-4">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between"><div className="font-semibold">Handoff · por atender</div><Link href="/acciones" className="cursor-pointer text-[11px] text-brand-300">ver todo</Link></div>
          <div className="space-y-2">
            {acciones.slice(0, 5).map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-lg border border-line bg-ink-850 px-3 py-2">
                <span className={"pill " + prio[h.priority]}>{h.tipo}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-semibold">{h.lead}</div><div className="truncate text-[11px] text-zinc-500">{h.detalle}</div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
