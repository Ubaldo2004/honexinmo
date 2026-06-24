"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/panel/ui";
import { crearUsuario, eliminarUsuario, actualizarTokko } from "./actions";

type Usuario = { id: string; nombre: string; rol: string; email: string | null; tokko: string | null };

const ROLES: [string, string][] = [
  ["operador", "Operador"],
  ["agente_visitas", "Agente de visitas (vendedor)"],
  ["administrador", "Administrador"],
];
const ROL_LABEL = Object.fromEntries(ROLES) as Record<string, string>;
const field = "w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/60";

export default function UsuariosClient({ usuarios }: { usuarios: Usuario[] }) {
  const router = useRouter();
  const [un, setUn] = useState("");
  const [ue, setUe] = useState("");
  const [ur, setUr] = useState("operador");
  const [up, setUp] = useState("");
  const [ut, setUt] = useState("");
  const [busy, setBusy] = useState(false);

  async function crear() {
    if (busy) return;
    setBusy(true);
    const res = await crearUsuario(un, ue, ur, up, ut);
    setBusy(false);
    if (!res.ok) { alert(res.error ?? "Error"); return; }
    setUn(""); setUe(""); setUp(""); setUt(""); setUr("operador");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Usuarios de la inmobiliaria</div>
        <div className="space-y-1.5">
          {usuarios.length === 0 && <div className="text-[12px] text-zinc-600">Sin usuarios todavía. Creá uno abajo.</div>}
          {usuarios.map((u) => <UserRow key={u.id} u={u} />)}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Alta de usuario</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={un} onChange={(e) => setUn(e.target.value)} placeholder="Nombre" className={field} />
          <input value={ue} onChange={(e) => setUe(e.target.value)} placeholder="email@…" className={field} />
          <select value={ur} onChange={(e) => setUr(e.target.value)} className={field}>
            {ROLES.map(([v, t]) => <option key={v} value={v} className="bg-ink-900">{t}</option>)}
          </select>
          <input value={up} onChange={(e) => setUp(e.target.value)} type="password" placeholder="Contraseña (mín 6)" className={field} />
          <label className="block text-[11px] text-zinc-500 sm:col-span-2">Telegram ID del vendedor (con el que figura en Tokko Finder)
            <input value={ut} onChange={(e) => setUt(e.target.value)} placeholder="7174613604 (vacío si no es vendedor)" className={field} />
          </label>
        </div>
        <button onClick={crear} disabled={busy} className="mt-3 w-full rounded-lg bg-brand-400 px-3 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-300 disabled:opacity-50">
          + Crear usuario
        </button>
      </Card>
    </div>
  );
}

function UserRow({ u }: { u: Usuario }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [tk, setTk] = useState(u.tokko ?? "");
  const [busy, setBusy] = useState(false);

  async function guardarTk() {
    setBusy(true);
    const res = await actualizarTokko(u.id, tk);
    setBusy(false);
    if (!res.ok) { alert(res.error ?? "Error"); return; }
    setEditando(false); router.refresh();
  }
  async function borrar() {
    if (!confirm(`¿Eliminar a ${u.nombre}? No podrá entrar más.`)) return;
    setBusy(true);
    const res = await eliminarUsuario(u.id);
    setBusy(false);
    if (!res.ok) { alert(res.error ?? "Error"); return; }
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-line bg-ink-850 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{u.nombre}</div>
          <div className="truncate text-[11px] text-zinc-500">{u.email ?? "—"}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-zinc-400">{ROL_LABEL[u.rol] ?? u.rol}</span>
          <button onClick={borrar} disabled={busy} className="rounded-md border border-bad/40 px-2 py-1 text-[11px] text-bad hover:bg-bad/10 disabled:opacity-50">✕</button>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
        <span className="text-zinc-600">Tokko:</span>
        {editando ? (
          <>
            <input value={tk} onChange={(e) => setTk(e.target.value)} placeholder="Telegram ID del vendedor" className="min-w-0 flex-1 rounded border border-line bg-ink-900 px-2 py-1 font-mono text-[11px] outline-none focus:border-brand-400/60" />
            <button onClick={guardarTk} disabled={busy} className="rounded bg-brand-400 px-2 py-1 text-[10px] font-semibold text-ink-950 disabled:opacity-50">Guardar</button>
            <button onClick={() => { setTk(u.tokko ?? ""); setEditando(false); }} className="text-zinc-500">cancelar</button>
          </>
        ) : (
          <>
            <span className={"truncate font-mono " + (u.tokko ? "text-brand-300" : "text-zinc-600")}>{u.tokko ?? "— sin id —"}</span>
            <button onClick={() => setEditando(true)} className="shrink-0 text-brand-300 hover:text-brand-200">editar</button>
          </>
        )}
      </div>
    </div>
  );
}
