import * as I from "@/components/icons";
import { Page, Card, F } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

export default async function VisitasPage() {
  const v = await (await getRepository()).getVisita();
  return (
    <Page>
      <Card className="mb-4 p-4 text-sm text-zinc-400"><span className="font-semibold text-zinc-200">Modo laboratorio.</span> Después de cada visita se sube el <strong>transcripto/grabación</strong>. El Analista saca el perfil del comprador, qué preguntó, qué no le gustó, y arma el <strong>seguimiento personalizado</strong>. El bot queda con el contexto total que tiene el inmobiliario.</Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="font-semibold">Visita</div>
          <div className="mt-3 space-y-2 text-sm"><F l="Lead">{v.lead}</F><F l="Propiedad">{v.prop}</F><F l="Agente">{v.agente}</F><F l="Fecha">{v.fecha}</F><F l="Transcripto"><span className="text-ok">subido ✓</span></F></div>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-ink-850 p-3"><span className="text-xs text-zinc-400">Probabilidad de cierre</span><span className="font-mono text-lg font-bold text-brand-300">{v.analisis.prob}%</span></div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2 font-semibold"><I.Brain className="h-5 w-5 text-sky-300" /> Análisis del Analista</div>
          <div className="space-y-3 text-sm">
            <div><div className="text-xs font-semibold uppercase text-zinc-500">Perfil</div><div className="mt-1 text-zinc-300">{v.analisis.perfil}</div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><div className="text-xs font-semibold uppercase text-zinc-500">Preguntó</div><ul className="mt-1 space-y-1">{v.analisis.preguntas.map((p) => <li key={p} className="text-[13px] text-zinc-400">· {p}</li>)}</ul></div>
              <div><div className="text-xs font-semibold uppercase text-zinc-500">No le gustó</div><ul className="mt-1 space-y-1">{v.analisis.objeciones.map((p) => <li key={p} className="text-[13px] text-zinc-400">· {p}</li>)}</ul></div>
            </div>
            <div className="rounded-lg border border-brand-400/30 bg-brand-400/10 p-3"><div className="text-xs font-semibold text-brand-300">Próximo paso (automático)</div><div className="mt-1 text-[13px] text-zinc-200">{v.analisis.siguiente}</div></div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
