import * as I from "@/components/icons";
import { Page, Card } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

export default async function AnclasPage() {
  const anclas = await (await getRepository()).getAnclas();
  return (
    <Page>
      <div className="mb-3 flex justify-end"><button className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-400 px-3 py-2 text-xs font-semibold text-ink-950"><I.Building className="h-4 w-4" /> Cargar propiedad ancla</button></div>
      <Card className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
        <thead className="border-b border-line bg-ink-850 text-left text-xs text-zinc-500"><tr><th className="px-4 py-2.5">Tipo</th><th className="px-4 py-2.5">Propiedad ancla</th><th className="px-4 py-2.5">Precio</th><th className="px-4 py-2.5">ADS (variante)</th><th className="px-4 py-2.5">Leads</th><th className="px-4 py-2.5">Visitas</th><th className="px-4 py-2.5">Publicada en</th><th className="px-4 py-2.5">A/B</th></tr></thead>
        <tbody>{anclas.map((c) => (
          <tr key={c.variante} className="hoverable border-b border-line/60">
            <td className="px-4 py-3 font-semibold">{c.tipo}</td><td className="px-4 py-3 text-zinc-300">{c.prop}</td><td className="px-4 py-3 font-mono text-zinc-400">{c.precio}</td>
            <td className="px-4 py-3"><span className="font-mono text-[11px] text-brand-300">{c.variante}</span></td>
            <td className="px-4 py-3 font-mono">{c.leads}</td><td className="px-4 py-3 font-mono text-ok">{c.visitas}</td>
            <td className="px-4 py-3"><div className="flex gap-1">{c.tokko && <span className="pill bg-white/5 text-zinc-300">Tokko</span>}{c.web && <span className="pill bg-brand-400/10 text-brand-300">Web propia</span>}</div></td>
            <td className="px-4 py-3"><span className={"pill " + (c.estado === "ganadora" ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn")}>{c.estado}</span></td>
          </tr>
        ))}</tbody>
      </table></Card>
    </Page>
  );
}
