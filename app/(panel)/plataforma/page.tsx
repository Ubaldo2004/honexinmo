import { Page, Card } from "@/components/panel/ui";
import { getSessionContext } from "@/lib/auth";
import { createClient as createAdmin } from "@supabase/supabase-js";
import PlataformaClient from "./PlataformaClient";

export default async function PlataformaPage() {
  const ctx = await getSessionContext();
  if (!ctx || ctx.rol !== "super_admin") {
    return (
      <Page>
        <Card className="p-6 text-sm text-zinc-400">
          🔒 Esta sección es exclusiva del <strong>Super Admin</strong> de la plataforma.
        </Card>
      </Page>
    );
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const [{ data: inmos }, { data: usuarios }, authList] = await Promise.all([
    admin.from("inmobiliarias").select("id, nombre, slug").order("creada_at"),
    admin.from("usuarios").select("id, nombre, rol, inmobiliaria_id, tokko_vendedor_id"),
    admin.auth.admin.listUsers(),
  ]);
  const emailById = new Map((authList.data?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return (
    <Page>
      <PlataformaClient
        inmobiliarias={(inmos ?? []).map((i) => ({ id: i.id as string, nombre: i.nombre as string, slug: i.slug as string }))}
        usuarios={(usuarios ?? []).map((u) => ({
          id: u.id as string, nombre: u.nombre as string, rol: u.rol as string,
          inmobiliaria_id: (u.inmobiliaria_id as string) ?? null,
          email: emailById.get(u.id as string) ?? null,
          tokko: (u.tokko_vendedor_id as string) ?? null,
        }))}
      />
    </Page>
  );
}
