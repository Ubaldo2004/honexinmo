"use server";

// Gestión de usuarios para el ADMINISTRADOR, siempre dentro de SU inmobiliaria.
// Usa la service key (admin API) porque crea/borra usuarios de auth.

import { getSessionContext } from "@/lib/auth";
import { createClient as createAdmin } from "@supabase/supabase-js";

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function requireAdmin() {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  if (ctx.rol !== "administrador" && ctx.rol !== "super_admin") return null;
  return ctx;
}

// El "ID de Tokko" del vendedor es su telegram_id (con el que figura en Tokko Finder).
export async function crearUsuario(
  nombre: string,
  email: string,
  rol: string,
  password: string,
  tokkoVendedorId: string
) {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false as const, error: "Solo el administrador" };
  if (!ctx.inmobiliariaId) return { ok: false as const, error: "Sin inmobiliaria asignada" };
  const n = nombre.trim(), e = email.trim().toLowerCase(), tk = tokkoVendedorId.trim();
  if (!n || !e || !password || password.length < 6) return { ok: false as const, error: "Nombre, email y contraseña (mín 6) requeridos" };
  if (!["administrador", "operador", "agente_visitas"].includes(rol)) return { ok: false as const, error: "Rol inválido" };

  // 1) usuario de auth (para que pueda loguearse)
  const { data: created, error: e1 } = await admin.auth.admin.createUser({ email: e, password, email_confirm: true });
  if (e1 || !created?.user) return { ok: false as const, error: e1?.message ?? "No se pudo crear el usuario" };

  // 2) perfil en `usuarios` con el tenant del admin. El id es el del usuario de auth.
  const { error: e2 } = await admin.from("usuarios").insert({
    id: created.user.id, nombre: n, rol, inmobiliaria_id: ctx.inmobiliariaId, tokko_vendedor_id: tk || null,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {}); // rollback
    return { ok: false as const, error: e2.message };
  }
  return { ok: true as const };
}

// El usuario objetivo tiene que ser de la inmobiliaria del admin (super admin no tiene tope).
async function mismoTenant(ctx: { inmobiliariaId: string | null; rol: string | null }, usuarioId: string) {
  if (ctx.rol === "super_admin") return true;
  const { data } = await admin.from("usuarios").select("inmobiliaria_id").eq("id", usuarioId).maybeSingle();
  return !!data && data.inmobiliaria_id === ctx.inmobiliariaId;
}

export async function actualizarTokko(usuarioId: string, tokkoVendedorId: string) {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false as const, error: "Solo el administrador" };
  if (!(await mismoTenant(ctx, usuarioId))) return { ok: false as const, error: "Ese usuario no es de tu inmobiliaria" };
  const tk = tokkoVendedorId.trim();
  const { error } = await admin.from("usuarios").update({ tokko_vendedor_id: tk || null }).eq("id", usuarioId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function eliminarUsuario(usuarioId: string) {
  const ctx = await requireAdmin();
  if (!ctx) return { ok: false as const, error: "Solo el administrador" };
  if (usuarioId === ctx.userId) return { ok: false as const, error: "No podés eliminarte a vos mismo" };
  if (!(await mismoTenant(ctx, usuarioId))) return { ok: false as const, error: "Ese usuario no es de tu inmobiliaria" };
  await admin.from("usuarios").delete().eq("id", usuarioId);
  const { error } = await admin.auth.admin.deleteUser(usuarioId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
