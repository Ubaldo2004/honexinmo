"use client";

import { useEffect, useRef, useState } from "react";
import * as I from "@/components/icons";
import { F, A, estadoPill } from "@/components/panel/ui";
import type { Conversacion, MensajeHilo, Resultado } from "@/lib/data/types";
import { enviarMensaje, crearChat, asignarVendedor } from "./actions";

// MVP: un solo vendedor. Después sale de la tabla `vendedores`/`usuarios`.
const VENDEDORES = ["Ubaldo"];

function nuevaConv(id: string, nombre: string): Conversacion {
  return {
    id, nombre, tel: "", ancla: "", origen: "panel", last: "", t: "",
    unread: 0, estado: "bot", asignado: "bot", mood: "", score: 0,
  };
}

export default function ChatsClient({
  conversaciones,
  hilos,
  resultados,
  initialId,
}: {
  conversaciones: Conversacion[];
  hilos: Record<string, MensajeHilo[]>;
  resultados: Resultado[];
  initialId?: string;
}) {
  const [convList, setConvList] = useState<Conversacion[]>(conversaciones);
  const [conv, setConv] = useState<Conversacion | undefined>(
    conversaciones.find((c) => c.id === initialId) ?? conversaciones[0]
  );
  const [extra, setExtra] = useState<Record<string, MensajeHilo[]>>({});
  const [tomadas, setTomadas] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const hilo = conv ? [...(hilos[conv.id] ?? []), ...(extra[conv.id] ?? [])] : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [hilo.length, conv?.id]);

  async function crear() {
    const nombre = nuevo.trim() || "Nuevo lead";
    setCreando(true);
    const res = await crearChat(nombre);
    setCreando(false);
    if (!res.ok || !res.conv) {
      alert(res.error ?? "No se pudo crear el chat");
      return;
    }
    const c = nuevaConv(res.conv.id, res.conv.nombre);
    setConvList((prev) => [c, ...prev]);
    setConv(c);
    setTomadas((p) => ({ ...p, [c.id]: true })); // listo para escribir al toque
    setNuevo("");
  }

  async function send() {
    if (!conv) return;
    const t = text.trim();
    if (!t || sending) return;
    const ts = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const msg: MensajeHilo = { who: "bot", agent: "Operador", t, ts };
    setExtra((prev) => ({ ...prev, [conv.id]: [...(prev[conv.id] ?? []), msg] }));
    setConvList((prev) => prev.map((c) => (c.id === conv.id ? { ...c, last: t, t: ts } : c)));
    setText("");
    setSending(true);
    const res = await enviarMensaje(conv.id, t, ts);
    setSending(false);
    if (!res.ok) console.error("No se pudo enviar:", res.error);
  }

  async function asignar(vendedor: string) {
    if (!conv) return;
    const cid = conv.id;
    setAsignando(true);
    const res = await asignarVendedor(cid, vendedor);
    setAsignando(false);
    if (!res.ok) {
      alert(res.error ?? "No se pudo asignar");
      return;
    }
    setConv((c) => (c ? { ...c, asignado: vendedor } : c));
    setConvList((prev) => prev.map((c) => (c.id === cid ? { ...c, asignado: vendedor } : c)));
  }

  const tomada = conv?.estado === "bot" && conv && tomadas[conv.id];
  const muestraComposer =
    !!conv && (conv.estado === "visita" || conv.estado === "seguimiento" || conv.estado === "handoff" || !!tomada);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_290px]">
      {/* lista */}
      <div className="hidden min-h-0 flex-col border-r border-line md:flex">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 text-xs text-zinc-500">
          <span className="flex items-center gap-2"><I.Filter className="h-4 w-4" /> {convList.length} chat{convList.length === 1 ? "" : "s"}</span>
        </div>
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") crear(); }}
            placeholder="Nombre del lead…"
            className="min-w-0 flex-1 rounded-lg border border-line bg-ink-900 px-2.5 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-brand-400/60"
          />
          <button onClick={crear} disabled={creando} className="shrink-0 cursor-pointer rounded-lg bg-brand-400 px-2.5 py-1.5 text-xs font-semibold text-ink-950 hover:bg-brand-300 disabled:opacity-50">+ Nuevo</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {convList.length === 0 && (
            <div className="px-3 py-8 text-center text-xs text-zinc-600">
              No hay chats todavía.<br />Creá uno arriba para empezar.
            </div>
          )}
          {convList.map((c) => (
            <button key={c.id} onClick={() => setConv(c)} className={"hoverable flex w-full items-center gap-3 border-b border-line/60 px-3 py-3 text-left " + (conv?.id === c.id ? "bg-brand-400/8" : "")}>
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 font-mono text-xs text-zinc-300">{c.nombre.slice(0, 2)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between"><span className="truncate text-sm font-semibold">{c.nombre}</span><span className="text-[10px] text-zinc-600">{c.t}</span></div>
                <div className="truncate text-xs text-zinc-500">{c.last || "—"}</div>
                <div className="mt-1"><span className={"pill " + (estadoPill[c.estado]?.c || "")}>{estadoPill[c.estado]?.t}</span></div>
              </div>
              {c.unread > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-brand-400 px-1 font-mono text-[10px] font-bold text-ink-950">{c.unread}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* conversación */}
      <div className="flex min-h-0 flex-col bg-ink-950">
        {!conv ? (
          <div className="grid flex-1 place-items-center p-6 text-center text-sm text-zinc-500">
            <div>
              <div className="mb-2">No hay ningún chat seleccionado.</div>
              <div className="text-xs text-zinc-600">Creá uno con “+ Nuevo” y escribí el primer mensaje.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-white/5 font-mono text-xs">{conv.nombre.slice(0, 2)}</div><div><div className="text-sm font-semibold">{conv.nombre}</div><div className="font-mono text-[11px] text-zinc-500">{conv.tel || "—"}</div></div></div>
              <span className={"pill " + (estadoPill[conv.estado]?.c || "")}>{estadoPill[conv.estado]?.t}</span>
            </div>
            {conv.estado !== "bot" && conv.reason && <div className={"flex items-center gap-2 border-b px-4 py-2 text-xs " + (conv.estado === "operacion" ? "border-line bg-white/3 text-zinc-400" : conv.estado === "visita" ? "border-warn/30 bg-warn/10 text-warn" : conv.estado === "seguimiento" ? "border-sky-400/30 bg-sky-400/10 text-sky-300" : "border-bad/30 bg-bad/10 text-bad")}><I.Alert className="h-4 w-4" /> {conv.reason}</div>}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {hilo.length === 0 && (
                <div className="grid h-full place-items-center text-center text-xs text-zinc-600">
                  Conversación vacía. Escribí abajo y tu mensaje va a aparecer acá (y se guarda).
                </div>
              )}
              {hilo.map((m, i) => (
                <div key={i} className={"flex " + (m.who === "in" ? "justify-end" : "justify-start")}>
                  <div className={"max-w-[85%] " + (m.system ? "w-full" : "")}>
                    {m.agent && <div className="mb-0.5 pl-1 text-[10px] font-semibold text-brand-400/80">{m.agent}</div>}
                    {m.system ? <div className="flex items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-[11px] text-zinc-400"><I.Search className="h-3.5 w-3.5 text-brand-400 animate-live" /> {m.t}</div> :
                      <div className={"rounded-2xl px-3 py-2 text-[13px] leading-snug " + (m.who === "in" ? "rounded-br-sm bg-brand-600/80 text-white" : "rounded-bl-sm bg-ink-800")}>{m.t}
                        {m.card === "resultados" && <div className="mt-2 space-y-1">{resultados.map((r) => <div key={r.t} className="flex items-center gap-2 rounded-lg border border-line bg-black/30 px-2 py-1.5"><span className="grid h-7 w-7 place-items-center rounded bg-brand-400/15 font-mono text-[10px] font-bold text-brand-300">{r.match}</span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{r.t}</div><div className="text-[10px] text-zinc-500">{r.zona} · {r.src}</div></div><span className="font-mono text-[11px] text-brand-300">{r.precio}</span></div>)}</div>}
                      </div>}
                    <div className={"mt-0.5 text-[9px] text-zinc-600 " + (m.who === "in" ? "text-right" : "")}>{m.ts}</div>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            <div className="border-t border-line p-3">
              {muestraComposer ? (
                <div className="flex items-center gap-2">
                  <input
                    value={text}
                    onChange={(ev) => setText(ev.target.value)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); } }}
                    placeholder="Escribí un mensaje…"
                    className="flex-1 rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none placeholder:text-zinc-600 focus:border-brand-400/60"
                  />
                  <button onClick={send} disabled={sending || !text.trim()} className="cursor-pointer rounded-lg bg-brand-400 p-2 text-ink-950 disabled:opacity-50"><I.Send className="h-4 w-4" /></button>
                </div>
              ) : conv.estado === "operacion" ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 py-2 text-xs text-zinc-500"><I.Phone className="h-4 w-4" /> Pasó a un humano (otro número). El bot quedó OFF para este lead.</div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-line bg-ink-900 px-3 py-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-2"><I.Bot className="h-4 w-4 text-brand-400" /> El bot maneja esta conversación.</span>
                  <button onClick={() => conv && setTomadas((p) => ({ ...p, [conv.id]: true }))} className="cursor-pointer rounded-md border border-brand-400/50 bg-brand-400/15 px-2.5 py-1 font-semibold text-brand-200 hover:bg-brand-400/25">Tomar y escribir</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* contexto */}
      <div className="hidden min-h-0 flex-col overflow-y-auto border-l border-line bg-ink-900 p-4 lg:flex">
        {conv && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Contexto del lead</div>
            <div className="mt-3 space-y-3 text-sm">
              <F l="Asignado a"><span className={conv.asignado === "bot" ? "text-brand-300" : ""}>{conv.asignado}</span></F>
              <F l="Mood"><span className="capitalize">{conv.mood || "—"}</span></F>
              <F l="Score"><span className="font-mono text-brand-300">{conv.score}</span></F>
              <F l="Propiedad ancla">{conv.ancla || "—"}</F>
              <F l="Vino de"><span className="font-mono text-[11px] text-zinc-400">{conv.origen || "—"}</span></F>
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Derivar a vendedor</div>
              <p className="mb-2 text-[11px] leading-snug text-zinc-600">El vendedor recibe el lead con todo el contexto. El bot sigue leyendo la conversación.</p>
              <div className="flex flex-wrap gap-2">
                {VENDEDORES.map((v) => {
                  const ya = conv.asignado === v;
                  return (
                    <button
                      key={v}
                      onClick={() => asignar(v)}
                      disabled={asignando || ya}
                      className={
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 " +
                        (ya
                          ? "border-ok/40 bg-ok/10 text-ok"
                          : "border-brand-400/50 bg-brand-400/15 text-brand-200 hover:bg-brand-400/25")
                      }
                    >
                      {ya ? `✓ Asignado a ${v}` : `Asignar a ${v}`}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
