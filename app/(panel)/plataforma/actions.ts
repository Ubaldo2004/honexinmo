"use server";

// Consola del SUPER ADMIN (dueño de la plataforma). TODO acá está gateado a super_admin:
// administra inmobiliarias, sus cuentas de Tokko y sus usuarios (alta para que entren).
// Usa la service key (admin API) porque crea usuarios de auth y escribe cross-tenant.

import { getSessionContext } from "@/lib/auth";
import { createClient as createAdmin } from "@supabase/supabase-js";

const admin = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

async function requireSuper() {
  const ctx = await getSessionContext();
  return ctx && ctx.rol === "super_admin" ? ctx : null;
}

// El "ID de Tokko" del vendedor es su telegram_id (el número de Telegram con el que figura
// en la tabla `vendedores` de Tokko Finder). n8n resuelve el UUID real a partir de ese telegram_id.

export async function crearInmobiliaria(nombre: string, slug: string) {
  if (!(await requireSuper())) return { ok: false as const, error: "Solo el super admin" };
  const n = nombre.trim(), s = slug.trim().toLowerCase().replace(/\s+/g, "-");
  if (!n || !s) return { ok: false as const, error: "Nombre y slug requeridos" };
  const { error } = await admin.from("inmobiliarias").insert({ nombre: n, slug: s });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function crearUsuario(
  inmobiliariaId: string,
  nombre: string,
  email: string,
  rol: string,
  password: string,
  tokkoVendedorId: string
) {
  if (!(await requireSuper())) return { ok: false as const, error: "Solo el super admin" };
  const n = nombre.trim(), e = email.trim().toLowerCase(), tk = tokkoVendedorId.trim();
  if (!n || !e || !password || password.length < 6) return { ok: false as const, error: "Nombre, email y contraseña (mín 6) requeridos" };
  if (!["administrador", "operador", "agente_visitas"].includes(rol)) return { ok: false as const, error: "Rol inválido" };

  // 1) usuario de auth (para que pueda loguearse)
  const { data: created, error: e1 } = await admin.auth.admin.createUser({ email: e, password, email_confirm: true });
  if (e1 || !created?.user) return { ok: false as const, error: e1?.message ?? "No se pudo crear el usuario" };

  // 2) perfil en `usuarios` (rol + tenant + id de Tokko). El id es el del usuario de auth.
  const { error: e2 } = await admin.from("usuarios").insert({
    id: created.user.id, nombre: n, rol, inmobiliaria_id: inmobiliariaId, tokko_vendedor_id: tk || null,
  });
  if (e2) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {}); // rollback
    return { ok: false as const, error: e2.message };
  }
  return { ok: true as const };
}

// Edita el ID de Tokko (telegram_id del vendedor) de un usuario ya creado.
export async function actualizarTokko(usuarioId: string, tokkoVendedorId: string) {
  if (!(await requireSuper())) return { ok: false as const, error: "Solo el super admin" };
  const tk = tokkoVendedorId.trim();
  const { error } = await admin.from("usuarios").update({ tokko_vendedor_id: tk || null }).eq("id", usuarioId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function eliminarUsuario(usuarioId: string) {
  if (!(await requireSuper())) return { ok: false as const, error: "Solo el super admin" };
  // borra el perfil y el usuario de auth (no puede entrar más).
  await admin.from("usuarios").delete().eq("id", usuarioId);
  const { error } = await admin.auth.admin.deleteUser(usuarioId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
