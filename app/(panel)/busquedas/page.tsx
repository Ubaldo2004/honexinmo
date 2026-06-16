import { Page, Card } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";
import { BuscarClient } from "./BuscarClient";

export default async function BusquedasPage() {
  const busquedas = await (await getRepository()).getBusquedas();
  return (
    <Page>
      <BuscarClient />
      <p className="mb-4 max-w-2xl text-sm text-zinc-400">Cada búsqueda que hace el motor queda guardada (pipeline). Sirve para no re-buscar, controlar costo y alimentar el análisis.</p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-ink-850 text-left text-xs text-zinc-500"><tr><th className="px-4 py-2.5">Lead</th><th className="px-4 py-2.5">Criterios</th><th className="px-4 py-2.5">Ancla</th><th className="px-4 py-2.5">Fuentes</th><th className="px-4 py-2.5">Resultados</th><th className="px-4 py-2.5">Hora</th></tr></thead>
          <tbody>{busquedas.map((b, i) => (
            <tr key={i} className="hoverable border-b border-line/60">
              <td className="px-4 py-3 font-semibold">{b.lead}</td><td className="px-4 py-3 text-zinc-300">{b.criterios}</td>
              <td className="px-4 py-3 text-zinc-400">{b.ancla}</td><td className="px-4 py-3 text-[11px] text-zinc-500">{b.fuentes}</td>
              <td className="px-4 py-3 font-mono text-brand-300">{b.resultados}</td><td className="px-4 py-3 font-mono text-xs text-zinc-600">{b.t}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </Page>
  );
}
