// Contexto de sesión resuelto EN EL SERVER desde el perfil del usuario.
// El tenant/rol nunca se confían del cliente: salen de `usuarios` vía RLS.
import { createClient } from "@/lib/supabase/server";

export interface SessionContext {
  userId: string;
  email: string | null;
  nombre: string;
  rol: string | null;
  inmobiliariaId: string | null;
  inmobiliariaNombre: string | null;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("usuarios")
    .select("nombre, rol, inmobiliaria_id, inmobiliarias(nombre)")
    .eq("id", user.id)
    .maybeSingle();

  const inmob = (data?.inmobiliarias as { nombre?: string } | null) ?? null;
  return {
    userId: user.id,
    email: user.email ?? null,
    nombre: data?.nombre ?? user.email ?? "Usuario",
    rol: (data?.rol as string) ?? null,
    inmobiliariaId: (data?.inmobiliaria_id as string) ?? null,
    inmobiliariaNombre:
      inmob?.nombre ?? (data?.rol === "super_admin" ? "Honex · plataforma" : null),
  };
}
