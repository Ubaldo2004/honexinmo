import { Page, anclaLabel } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";
import { BuscarClient } from "./BuscarClient";
import BusquedasClient, { type Grupo } from "./BusquedasClient";

export default async function BusquedasPage() {
  const busquedas = await (await getRepository()).getBusquedas();

  // Agrupar por lead (por id si está; si no, por nombre). El orden viene newest-first.
  const map = new Map<string, { lead: string; ancla: string; raw: typeof busquedas }>();
  for (const b of busquedas) {
    const key = b.leadId ?? b.lead ?? "—";
    let g = map.get(key);
    if (!g) { g = { lead: b.lead || "—", ancla: b.ancla, raw: [] }; map.set(key, g); }
    if (!g.ancla && b.ancla) g.ancla = b.ancla;
    g.raw.push(b);
  }

  const grupos: Grupo[] = [...map.values()].map((g) => {
    // marca como "repetida" la 2da+ aparición del mismo criterio dentro del lead
    const visto = new Set<string>();
    const items = g.raw.map((b) => {
      const norm = b.criterios.trim().toLowerCase();
      const repetida = visto.has(norm);
      visto.add(norm);
      return { criterios: b.criterios, t: b.t, resultados: b.resultados, repetida };
    });
    return { lead: g.lead, ancla: anclaLabel(g.ancla), items };
  });

  return (
    <Page>
      <BuscarClient />
      <BusquedasClient grupos={grupos} />
    </Page>
  );
}
