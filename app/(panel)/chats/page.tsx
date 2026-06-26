import { getRepository } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import ChatsClient from "./ChatsClient";

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const sp = await searchParams;
  const data = await getRepository();
  const supabase = await createClient();
  const [conversaciones, hilos, resultados, vendsRes, dispRes, opsRes] = await Promise.all([
    data.getConversaciones(),
    data.getHilosByConversacion(),
    data.getResultados(),
    // agentes de visitas del tenant (RLS scopea por inmobiliaria)
    supabase.from("usuarios").select("id, nombre").eq("rol", "agente_visitas"),
    supabase.from("disponibilidad_agente").select("usuario_id"),
    // operadores del tenant (para tomar/manejar la conversación)
    supabase.from("usuarios").select("id, nombre").eq("rol", "operador"),
  ]);
  // solo los que tienen al menos un hueco libre en su agenda (si no, no hay cuándo asignarle)
  const conDispo = new Set((dispRes.data ?? []).map((d) => d.usuario_id as string));
  const vendedores = (vendsRes.data ?? []).filter((v) => conDispo.has(v.id as string)).map((v) => v.nombre as string);
  const operadores = (opsRes.data ?? []).map((o) => o.nombre as string);

  const initialId = sp.conv ?? conversaciones[0]?.id;
  return (
    <ChatsClient
      conversaciones={conversaciones}
      hilos={hilos}
      resultados={resultados}
      vendedores={vendedores}
      operadores={operadores}
      initialId={initialId}
    />
  );
}
