import { Page } from "@/components/panel/ui";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import AgendaClient from "./AgendaClient";

export default async function AgendaPage() {
  const ctx = await getSessionContext();
  const db = await createClient();
  const esAdmin = ctx?.rol === "administrador" || ctx?.rol === "super_admin";

  // Solo los AGENTES DE VISITAS (son los que hacen el recorrido). Un no-admin ve solo su propia agenda.
  let q = db.from("usuarios").select("id, nombre, rol").eq("rol", "agente_visitas");
  if (ctx?.inmobiliariaId) q = q.eq("inmobiliaria_id", ctx.inmobiliariaId);
  if (!esAdmin && ctx?.userId) q = q.eq("id", ctx.userId);
  const { data: vendedores } = await q;

  const ids = (vendedores ?? []).map((v) => v.id as string);
  const { data: slots } = ids.length
    ? await db.from("disponibilidad_agente").select("id, usuario_id, dia, hora_inicio, hora_fin").in("usuario_id", ids)
    : { data: [] as { id: string; usuario_id: string; dia: string; hora_inicio: string; hora_fin: string }[] };

  // Turnos (visitas) coordinados de cada agente → para que vea lo que tiene agendado.
  const nombres = (vendedores ?? []).map((v) => v.nombre as string).filter(Boolean);
  const { data: turnosRaw } = nombres.length
    ? await db.from("visitas").select("agente, fecha, lead_label, prop").in("agente", nombres).order("creada_at", { ascending: false })
    : { data: [] as { agente: string; fecha: string; lead_label: string | null; prop: string | null }[] };

  return (
    <Page>
      <AgendaClient
        vendedores={(vendedores ?? []).map((v) => ({ id: v.id as string, nombre: v.nombre as string, rol: v.rol as string }))}
        slots={(slots ?? []).map((s) => ({
          id: s.id as string,
          usuarioId: s.usuario_id as string,
          dia: s.dia as string,
          horaInicio: (s.hora_inicio as string).slice(0, 5),
          horaFin: (s.hora_fin as string).slice(0, 5),
        }))}
        turnos={(turnosRaw ?? []).map((t) => ({
          agente: t.agente as string,
          fecha: (t.fecha as string) ?? "",
          lead: (t.lead_label as string) ?? "",
          prop: (t.prop as string) ?? "",
        }))}
        currentUserId={ctx?.userId ?? ""}
      />
    </Page>
  );
}
