import * as I from "@/components/icons";
import { Page, Card } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

const ICONS: Record<string, (p: { className?: string }) => React.ReactNode> = { Bot: I.Bot, Search: I.Search, Brain: I.Brain };

const det: Record<string, string[]> = {
  orquestador: ["Recibe cada mensaje de WhatsApp", "Califica (particular/colega) y rutea", "Mantiene el hilo de la propiedad ancla", "Hace el seguimiento hasta que el lead diga basta"],
  motor: ["NO es un agente: es un motor de búsqueda", "Busca en toda la red (Tokko/Propia/portales)", "Rankea por match y arma la ficha", "Ya está funcionando (reuso de Tokko Finder)"],
  analista: ["El “encargado interno” que entrena al bot", "Analiza conversaciones y seguimientos", "Procesa los transcriptos de las visitas", "Saca tasa de éxito por visita + correcciones"],
};

export default async function SistemaPage() {
  const piezas = await (await getRepository()).getPiezas();
  return (
    <Page>
      <p className="mb-4 max-w-2xl text-sm text-zinc-400">Tres piezas: un <strong>bot</strong> que conversa, un <strong>motor</strong> que busca (no es agente) y un <strong>agente analista</strong> que entrena el sistema.</p>
      <div className="grid gap-4 lg:grid-cols-3">{piezas.map((a) => { const Icon = ICONS[a.icon]; return (
        <Card key={a.key} className="p-5">
          <div className="flex items-center gap-3"><div className={"grid h-11 w-11 place-items-center rounded-xl bg-white/5 " + a.color}><Icon className="h-6 w-6" /></div><div><div className="font-display text-lg font-bold">{a.nombre}</div><div className="text-[11px] text-zinc-500">{a.tipo === "motor" ? "motor (no agente)" : "agente LLM"}</div></div></div>
          <ul className="mt-4 space-y-2">{det[a.key].map((d) => <li key={d} className="flex gap-2 text-sm text-zinc-300"><I.Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> {d}</li>)}</ul>
          <div className="mt-4 rounded-lg border border-line bg-ink-850 p-2 font-mono text-[11px] text-zinc-500">{a.metric}</div>
        </Card>
      ); })}</div>
    </Page>
  );
}
