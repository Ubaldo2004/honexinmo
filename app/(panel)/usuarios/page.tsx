import { Page, Card } from "@/components/panel/ui";
import { getSessionContext } from "@/lib/auth";
import { createClient as createAdmin } from "@supabase/supabase-js";
import UsuariosClient from "./UsuariosClient";

export default async function UsuariosPage() {
  const ctx = await getSessionContext();
  const canManage = ctx?.rol === "administrador" || ctx?.rol === "super_admin";

  if (!canManage) {
    return (
      <Page>
        <Card className="p-6 text-sm text-zinc-400">Solo el administrador puede gestionar usuarios.</Card>
      </Page>
    );
  }

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  let q = admin.from("usuarios").select("id, nombre, rol, tokko_vendedor_id");
  if (ctx?.inmobiliariaId) q = q.eq("inmobiliaria_id", ctx.inmobiliariaId);
  const [{ data: usuarios }, authList] = await Promise.all([q, admin.auth.admin.listUsers()]);
  const emailById = new Map((authList.data?.users ?? []).map((u) => [u.id, u.email ?? null]));

  return (
    <Page>
      <UsuariosClient
        usuarios={(usuarios ?? []).map((u) => ({
          id: u.id as string,
          nombre: u.nombre as string,
          rol: u.rol as string,
          email: emailById.get(u.id as string) ?? null,
          tokko: (u.tokko_vendedor_id as string) ?? null,
        }))}
      />
    </Page>
  );
}
