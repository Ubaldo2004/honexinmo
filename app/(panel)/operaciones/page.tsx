import { Page, Card } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

export default async function OperacionesPage() {
  const operaciones = await (await getRepository()).getOperaciones();
  return (
    <Page><Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
      <thead className="border-b border-line bg-ink-850 text-left text-xs text-zinc-500"><tr><th className="px-4 py-2.5">Propiedad</th><th className="px-4 py-2.5">Cliente</th><th className="px-4 py-2.5">Colega/fuente</th><th className="px-4 py-2.5">Monto</th><th className="px-4 py-2.5">Comisión</th><th className="px-4 py-2.5">Reparto</th><th className="px-4 py-2.5">Estado</th></tr></thead>
      <tbody>{operaciones.map((o) => (
        <tr key={o.prop} className="hoverable border-b border-line/60">
          <td className="px-4 py-3 font-semibold">{o.prop}</td><td className="px-4 py-3 text-zinc-300">{o.cliente}</td><td className="px-4 py-3 text-zinc-400">{o.colega}</td>
          <td className="px-4 py-3 font-mono">{o.monto}</td><td className="px-4 py-3 font-mono text-brand-300">{o.comision}</td><td className="px-4 py-3 text-[11px] text-zinc-500">{o.split}</td>
          <td className="px-4 py-3"><span className="pill bg-white/5 text-zinc-300">{o.estado}</span></td>
        </tr>
      ))}</tbody>
    </table></Card></Page>
  );
}
