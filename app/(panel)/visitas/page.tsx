import { Page } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";
import VisitasClient from "./VisitasClient";

export default async function VisitasPage() {
  const repo = await getRepository();
  const [visitas, leads] = await Promise.all([repo.getVisitas(), repo.getLeads()]);
  const leadOpts = leads
    .filter((l) => l.id)
    .map((l) => ({ id: l.id as string, nombre: l.nombre }));
  return (
    <Page>
      <VisitasClient visitas={visitas} leads={leadOpts} />
    </Page>
  );
}
