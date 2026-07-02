import Link from "next/link";
import * as I from "@/components/icons";
import { Page, Card } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

// Sección Seguimiento: los leads post-visita, con lo que salió del análisis de la visita
// (si le gustó, prob de cierre, qué busca ahora, próximo paso) y si el bot ya mandó el seguimiento.
const GUSTO: Record<string, { t: string; c: string }> = {
  si: { t: "Le gustó", c: "text-ok bg-ok/10 border-ok/30" },
  no: { t: "No le gustó", c: "text-bad bg-bad/10 border-bad/30" },
  dudoso: { t: "Dudoso", c: "text-warn bg-warn/10 border-warn/30" },
};

function fechaCorta(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", weekday: "short", day: "2-digit", month: "2-digit" });
}

export default async function SeguimientoPage() {
  const items = await (await getRepository()).getSeguimientos();
  return (
    <Page>
      <div className="mb-3 text-sm text-zinc-400">
        <span className="font-mono text-brand-300">{items.length}</span> en seguimiento
      </div>

      {items.length === 0 ? (
        <Card className="px-4 py-12 text-center text-sm text-zinc-500">
          No hay leads en seguimiento todavía.<br />
          <span className="text-xs text-zinc-600">Entran acá cuando se analiza la visita de un cliente.</span>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((s) => {
            const g = s.leGusto ? GUSTO[s.leGusto] : null;
            return (
              <Card key={s.leadId} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{s.lead}</div>
                    {s.prop && <div className="truncate text-[12px] text-zinc-500">{s.prop}</div>}
                  </div>
                  {typeof s.prob === "number" && (
                    <span className="shrink-0 rounded-full bg-sky-400/15 px-2 py-0.5 font-mono text-[11px] text-sky-300">{s.prob}% cierre</span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {g && <span className={"rounded-full border px-2 py-0.5 text-[11px] font-medium " + g.c}>{g.t}</span>}
                  <span className={"rounded-full border px-2 py-0.5 text-[11px] " + (s.seguimientoEnviado ? "border-ok/30 bg-ok/10 text-ok" : "border-line bg-white/5 text-zinc-400")}>
                    {s.seguimientoEnviado ? "seguimiento enviado" : "seguimiento pendiente"}
                  </span>
                  {s.fecha && <span className="text-[11px] text-zinc-600">visita {fechaCorta(s.fecha)}</span>}
                </div>

                {s.buscaAhora && (
                  <div className="mt-2 text-[13px]"><span className="text-zinc-500">Busca ahora: </span><span className="text-zinc-300">{s.buscaAhora}</span></div>
                )}
                {s.siguiente && (
                  <div className="mt-2 rounded-lg border border-brand-400/30 bg-brand-400/10 p-2 text-[12px]">
                    <span className="font-semibold text-brand-300">Próximo paso: </span><span className="text-zinc-200">{s.siguiente}</span>
                  </div>
                )}

                {s.convId && (
                  <Link href={`/chats?conv=${s.convId}`} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand-400/15 px-3 py-1.5 text-xs font-semibold text-brand-200 hover:bg-brand-400/25">
                    Abrir chat <I.ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}
