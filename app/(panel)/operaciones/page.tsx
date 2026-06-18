import { Page } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";
import OperacionesClient from "./OperacionesClient";

export default async function OperacionesPage() {
  const operaciones = await (await getRepository()).getOperaciones();
  return (
    <Page>
      <OperacionesClient operaciones={operaciones} />
    </Page>
  );
}
