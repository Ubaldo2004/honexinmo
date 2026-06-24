import Link from "next/link";
import * as I from "@/components/icons";
import { Page, Card, prio } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

export default async function AccionesPage() {
  const acciones = await (await getRepository()).getAcciones();
  return (
    <Page>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-ink-850 text-left text-xs text-zinc-500"><tr><th className="px-4 py-2.5">Tipo</th><th className="px-4 py-2.5">Lead</th><th className="px-4 py-2.5">Detalle</th><th className="px-4 py-2.5">Prioridad</th><th className="px-4 py-2.5">Cuándo</th><th className="px-4 py-2.5"></th></tr></thead>
          <tbody>{acciones.map((h) => (
            <tr key={h.id} className="hoverable border-b border-line/60">
              <td className="px-4 py-3"><span className={"pill " + (h.tipo === "Coordinar visita" ? "bg-warn/10 text-warn" : h.tipo === "Operación" ? "bg-white/8 text-zinc-300" : "bg-bad/10 text-bad")}>{h.tipo}</span></td>
              <td className="px-4 py-3 font-semibold">{h.lead}</td><td className="px-4 py-3 text-zinc-400">{h.detalle}</td>
              <td className="px-4 py-3"><span className={"pill " + prio[h.priority]}>{h.priority}</span></td><td className="px-4 py-3 text-xs text-zinc-600">{h.t}</td>
              <td className="px-4 py-3 text-right"><Link href={`/chats?conv=${h.id}`} className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-brand-400/15 px-3 py-1.5 text-xs font-semibold text-brand-200 hover:bg-brand-400/25">Abrir <I.ArrowRight className="h-3.5 w-3.5" /></Link></td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </Page>
  );
}
