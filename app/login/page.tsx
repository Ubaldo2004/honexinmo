"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as I from "@/components/icons";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("No pudimos entrar. Revisá email y contraseña.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  function quick(e: string) {
    setEmail(e);
    setPassword("Honex1234!");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink-950 px-4 text-[#e7e3da]">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <I.Mark className="h-9 w-9" />
          <div>
            <div className="font-display text-lg font-bold leading-none">honexinmobiliaria</div>
            <div className="text-[11px] text-zinc-500">panel interno</div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label className="text-xs text-zinc-500">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/60"
              placeholder="vos@inmobiliaria.com" />
          </div>
          <div>
            <label className="text-xs text-zinc-500">Contraseña</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/60"
              placeholder="••••••••" />
          </div>
          {error && <div className="rounded-lg bg-bad/10 px-3 py-2 text-xs text-bad">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full cursor-pointer rounded-lg bg-brand-400 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-brand-300 disabled:opacity-60">
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="mt-4 rounded-lg border border-line bg-ink-900/60 p-3 text-[11px] text-zinc-500">
          <div className="mb-1.5 font-semibold text-zinc-400">Usuarios demo (clic para autocompletar):</div>
          {[
            ["super@honex.test", "super admin · ve todo"],
            ["bot@honexinmo.com", "bottelegram · recibe los leads (Norte)"],
            ["ubaldo@honexinmo.com", "Ubaldo · vendedor (Norte)"],
            ["admin@sur.test", "admin · Inmobiliaria Sur"],
          ].map(([e, d]) => (
            <button key={e} type="button" onClick={() => quick(e)}
              className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left hover:bg-white/5">
              <span className="font-mono text-zinc-300">{e}</span>
              <span className="text-zinc-600">{d}</span>
            </button>
          ))}
          <div className="mt-1.5 px-1.5 text-zinc-600">contraseña: <span className="font-mono">Honex1234!</span></div>
        </div>
      </div>
    </div>
  );
}
