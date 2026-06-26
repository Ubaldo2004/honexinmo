"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as I from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/dashboard", t: "Dashboard", icon: I.Grid },
  { href: "/chats", t: "Chats", icon: I.Chat },
  { href: "/acciones", t: "Acciones", icon: I.Hand, warn: true },
  { href: "/busquedas", t: "Búsquedas", icon: I.Search },
  { href: "/leads", t: "Leads", icon: I.Users },
  { href: "/anclas", t: "Anclas + ADS", icon: I.Megaphone },
  { href: "/visitas", t: "Visitas", icon: I.Doc },
  { href: "/agenda", t: "Agenda", icon: I.Calendar },
  { href: "/operaciones", t: "Operaciones", icon: I.Coins },
  { href: "/usuarios", t: "Usuarios", icon: I.Settings },
];

const ROL_LABEL: Record<string, string> = {
  super_admin: "super admin",
  administrador: "administrador",
  operador: "operador",
  agente_visitas: "agente de visitas",
};

export default function PanelShell({
  children,
  nombre,
  rol,
}: {
  children: React.ReactNode;
  nombre: string;
  rol: string | null;
}) {
  const [nav, setNav] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const initials = nombre.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  // EN VIVO: refresca los datos del server cada 10s (soft refresh, sin recargar la página).
  // Chats queda afuera: tiene su propio polling y estado local que no conviene pisar.
  useEffect(() => {
    if (pathname.startsWith("/chats")) return;
    const id = setInterval(() => router.refresh(), 10000);
    return () => clearInterval(id);
  }, [pathname, router]);

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden bg-ink-950 text-[#e7e3da]">
      <aside className={"fixed z-30 flex h-full w-60 shrink-0 flex-col border-r border-line bg-ink-900 transition-transform md:static md:translate-x-0 " + (nav ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex items-center gap-2.5 px-5 py-4">
          <I.Mark className="h-8 w-8" />
          <div><div className="font-display text-base font-bold leading-none">honexinmobiliaria</div><div className="text-[10px] text-zinc-500">panel interno</div></div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = current?.href === n.href;
            return (
              <Link key={n.href} href={n.href} onClick={() => setNav(false)} className={"flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition " + (active ? "bg-brand-400/10 text-brand-300" : "text-zinc-400 hover:bg-white/3 hover:text-white")}>
                <Icon className="h-[18px] w-[18px]" /> <span className="flex-1 text-left">{n.t}</span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-400/15 font-mono text-xs text-brand-300">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-zinc-300">{nombre}</div>
              <div className="text-[11px] text-zinc-500">{rol ? ROL_LABEL[rol] ?? rol : ""}</div>
            </div>
            <button onClick={signOut} title="Cerrar sesión" className="cursor-pointer rounded-md border border-line p-1.5 text-zinc-400 hover:text-white">
              <I.Phone className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      {nav && <div onClick={() => setNav(false)} className="fixed inset-0 z-20 bg-black/50 md:hidden" />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button onClick={() => setNav(true)} className="cursor-pointer text-zinc-400 md:hidden"><I.Grid className="h-5 w-5" /></button>
            <div className="font-display text-lg font-bold">{current?.t}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-sm text-zinc-500 sm:flex"><I.Search className="h-4 w-4" /> Buscar…</div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
