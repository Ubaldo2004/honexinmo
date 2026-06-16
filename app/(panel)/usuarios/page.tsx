import * as I from "@/components/icons";
import { Page, Card } from "@/components/panel/ui";
import { getRepository } from "@/lib/data";

export default async function UsuariosPage() {
  const roles = await (await getRepository()).getRoles();
  return (
    <Page>
      <p className="mb-4 max-w-2xl text-sm text-zinc-400">Jerarquía de <strong>4 niveles</strong> (SaaS multi-tenant): el <strong>Super Admin</strong> es de la plataforma y ve cross-tenant; los otros tres viven dentro de su inmobiliaria. Los leads se asignan <strong>automáticamente</strong> (arrancan en el bot).</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{roles.map((r) => (
        <Card key={r.r} className="p-5"><div className="flex items-center gap-2 font-display text-lg font-bold"><I.Users className="h-5 w-5 text-brand-400" /> {r.r}</div><div className="mt-2 text-sm text-zinc-400">{r.d}</div></Card>
      ))}</div>
      <Card className="mt-4 p-4 text-[12px] text-zinc-500">El panel tiene que ser <span className="text-zinc-300">mobile</span> — el operador y el agente de visitas lo usan desde el celular.</Card>
    </Page>
  );
}
