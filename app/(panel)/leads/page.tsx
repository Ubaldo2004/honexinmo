import { Page } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";
import LeadsClient from "./LeadsClient";

export default async function LeadsPage() {
  const leads = await (await getRepository()).getLeads();
  return (
    <Page>
      <LeadsClient leads={leads} />
    </Page>
  );
}
