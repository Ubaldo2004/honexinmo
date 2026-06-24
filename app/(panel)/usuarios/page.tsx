import * as I from "@/components/icons";
import { Page, Card } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

export default async function UsuariosPage() {
  const roles = await (await getRepository()).getRoles();
  return (
    <Page>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{roles.map((r) => (
        <Card key={r.r} className="p-5"><div className="flex items-center gap-2 font-display text-lg font-bold"><I.Users className="h-5 w-5 text-brand-400" /> {r.r}</div><div className="mt-2 text-sm text-zinc-400">{r.d}</div></Card>
      ))}</div>
    </Page>
  );
}
