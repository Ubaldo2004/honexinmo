import { getRepository } from "@/lib/data";
import ChatsClient from "./ChatsClient";

export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const sp = await searchParams;
  const data = await getRepository();
  const [conversaciones, hilos, resultados] = await Promise.all([
    data.getConversaciones(),
    data.getHilosByConversacion(),
    data.getResultados(),
  ]);
  const initialId = sp.conv ?? conversaciones[0]?.id;
  return (
    <ChatsClient
      conversaciones={conversaciones}
      hilos={hilos}
      resultados={resultados}
      initialId={initialId}
    />
  );
}
