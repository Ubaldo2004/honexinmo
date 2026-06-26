"use client";

import { useEffect, useRef, useState } from "react";
import * as I from "@/components/icons";
import { F, estadoPill, anclaData, anclaLabel, type AnclaProp } from "@/components/panel/ui";
import type { Conversacion, MensajeHilo, Resultado } from "@/lib/data/types";
import { enviarMensaje, crearChat, asignarVendedor, asignarOperador, corregirUltimoMensaje, marcarLeido, reactivarBot } from "./actions";

type AnalisisChat = {
  resumen?: string;
  temperatura?: string;
  busca?: string;
  objeciones?: string[];
  sugerencia?: string;
  siguiente?: string;
};

const TEMP_PILL: Record<string, { c: string; t: string }> = {
  caliente: { c: "bg-bad/15 text-bad", t: "🔥 caliente" },
  tibio: { c: "bg-warn/15 text-warn", t: "🌤 tibio" },
  frio: { c: "bg-sky-400/15 text-sky-300", t: "❄️ frío" },
};

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
  vendedores,
  operadores,
  initialId,
}: {
  conversaciones: Conversacion[];
  hilos: Record<string, MensajeHilo[]>;
  resultados: Resultado[];
  vendedores: string[];
  operadores: string[];
  initialId?: string;
}) {
  const initialConv = conversaciones.find((c) => c.id === initialId) ?? conversaciones[0];
  const [convList, setConvList] = useState<Conversacion[]>(
    initialConv ? conversaciones.map((c) => (c.id === initialConv.id ? { ...c, unread: 0 } : c)) : conversaciones
  );
  const [conv, setConv] = useState<Conversacion | undefined>(
    initialConv ? { ...initialConv, unread: 0 } : undefined
  );
  const [extra, setExtra] = useState<Record<string, MensajeHilo[]>>({});
  const [tomadas, setTomadas] = useState<Record<string, boolean>>({});
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [nuevo, setNuevo] = useState("");
  const [creando, setCreando] = useState(false);
  const [asignando, setAsignando] = useState(false);
  const [ficha, setFicha] = useState<AnclaProp | null>(null);
  const [correcciones, setCorrecciones] = useState<Record<string, string>>({});
  const [corrigiendo, setCorrigiendo] = useState(false);
  const [corrText, setCorrText] = useState("");
  const [guardandoCorr, setGuardandoCorr] = useState(false);
  const [reactivando, setReactivando] = useState(false);
  const [analisis, setAnalisis] = useState<Record<string, AnalisisChat>>({}); // por conversación
  const [analizando, setAnalizando] = useState(false);
  const [mobileChatAbierto, setMobileChatAbierto] = useState(false); // en celular: lista vs chat
  const [mobileInfo, setMobileInfo] = useState(false); // en celular: hoja con info del cliente
  const bottomRef = useRef<HTMLDivElement>(null);

  const hilo = conv ? [...(hilos[conv.id] ?? []), ...(extra[conv.id] ?? [])] : [];

  // Índice del último mensaje del bot (no resultados) → es el que se puede corregir.
  let lastBotIdx = -1;
  for (let i = hilo.length - 1; i >= 0; i--) {
    const m = hilo[i];
    if (m.who === "bot" && m.agent === "bottelegram" && m.card !== "resultados" && m.card !== "fotos") { lastBotIdx = i; break; }
  }
  const correccion = conv ? correcciones[conv.id] : undefined;
  const lastBotTexto = lastBotIdx >= 0 ? (correccion ?? hilo[lastBotIdx].t) : "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [hilo.length, conv?.id]);

  // Al abrir una conversación se marca como leída → resetea el contador de sin-leer.
  function marcarLeidoLocal(cid: string) {
    setConvList((prev) => prev.map((c) => (c.id === cid ? { ...c, unread: 0 } : c)));
    setConv((c) => (c && c.id === cid ? { ...c, unread: 0 } : c));
    marcarLeido(cid).catch(() => {});
  }
  function abrirConv(c: Conversacion) {
    setConv(c);
    setMobileChatAbierto(true);
    setMobileInfo(false);
    if (c.unread > 0) marcarLeidoLocal(c.id);
  }
  // El chat abierto al cargar ya arranca en 0 (arriba); acá solo avisamos al server.
  useEffect(() => {
    if (initialConv && initialConv.unread > 0) marcarLeido(initialConv.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setMobileChatAbierto(true);
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

  async function asignarOp(operador: string) {
    if (!conv) return;
    const cid = conv.id;
    setAsignando(true);
    const res = await asignarOperador(cid, operador);
    setAsignando(false);
    if (!res.ok) {
      alert(res.error ?? "No se pudo asignar");
      return;
    }
    setConv((c) => (c ? { ...c, asignado: operador, estado: "handoff", reason: `Tomado por ${operador}` } : c));
    setConvList((prev) => prev.map((c) => (c.id === cid ? { ...c, asignado: operador, estado: "handoff" } : c)));
  }

  async function reactivar() {
    if (!conv || reactivando) return;
    const cid = conv.id;
    setReactivando(true);
    if (conv.estado !== "bot") {
      const res = await reactivarBot(cid);
      if (!res.ok) { alert(res.error ?? "No se pudo reactivar el bot"); setReactivando(false); return; }
    }
    setConv((c) => (c ? { ...c, estado: "bot", reason: undefined, asignado: "bot" } : c));
    setConvList((prev) => prev.map((c) => (c.id === cid ? { ...c, estado: "bot", asignado: "bot" } : c)));
    setTomadas((p) => ({ ...p, [cid]: false }));
    setReactivando(false);
  }

  async function analizarChat() {
    if (!conv || analizando) return;
    const cid = conv.id;
    setAnalizando(true);
    try {
      const res = await fetch("/api/analizar-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversacionId: cid }),
      });
      const j = await res.json();
      if (!j.ok) { alert(j.error ?? "No se pudo analizar"); return; }
      setAnalisis((p) => ({ ...p, [cid]: j.analisis as AnalisisChat }));
    } catch {
      alert("No se pudo analizar la conversación");
    } finally {
      setAnalizando(false);
    }
  }

  function abrirCorregir() {
    setCorrText(lastBotTexto);
    setCorrigiendo(true);
  }
  async function guardarCorreccion() {
    if (!conv) return;
    const t = corrText.trim();
    if (!t || guardandoCorr) return;
    setGuardandoCorr(true);
    const res = await corregirUltimoMensaje(conv.id, t);
    setGuardandoCorr(false);
    if (!res.ok) { alert(res.error ?? "No se pudo corregir"); return; }
    setCorrecciones((p) => ({ ...p, [conv.id]: t }));
    setConvList((prev) => prev.map((c) => (c.id === conv.id ? { ...c, last: t } : c)));
    setCorrigiendo(false);
  }

  const tomada = conv?.estado === "bot" && conv && tomadas[conv.id];
  const muestraComposer =
    !!conv && (conv.estado === "visita" || conv.estado === "seguimiento" || conv.estado === "handoff" || !!tomada);

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_290px]">
      {/* lista */}
      <div className={(mobileChatAbierto ? "hidden " : "flex ") + "min-h-0 flex-col border-r border-line md:flex"}>
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
            <button key={c.id} onClick={() => abrirConv(c)} className={"hoverable flex w-full items-center gap-3 border-b border-line/60 px-3 py-3 text-left " + (conv?.id === c.id ? "bg-brand-400/8" : "")}>
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
      <div className={(mobileChatAbierto ? "flex " : "hidden ") + "min-h-0 flex-col bg-ink-950 md:flex"}>
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
              <div className="flex items-center gap-3">
                <button onClick={() => { setMobileChatAbierto(false); setMobileInfo(false); }} aria-label="Volver a chats" className="-ml-1 cursor-pointer text-xl leading-none text-zinc-400 hover:text-white md:hidden">←</button>
                <button onClick={() => setMobileInfo(true)} className="flex items-center gap-3 text-left lg:pointer-events-none">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white/5 font-mono text-xs">{conv.nombre.slice(0, 2)}</div>
                  <div><div className="flex items-center gap-2 text-sm font-semibold">{conv.nombre}<span className="rounded-full border border-brand-400/50 bg-brand-400/15 px-2.5 py-1 text-[12px] font-semibold text-brand-200 lg:hidden">ⓘ Ver info</span></div><div className="font-mono text-[11px] text-zinc-500">{conv.tel || "—"}</div></div>
                </button></div>
              <span className={"pill " + (estadoPill[conv.estado]?.c || "")}>{estadoPill[conv.estado]?.t}</span>
            </div>
            {conv.estado !== "bot" && conv.reason && <div className={"flex items-center gap-2 border-b px-4 py-2 text-xs " + (conv.estado === "operacion" ? "border-line bg-white/3 text-zinc-400" : conv.estado === "visita" ? "border-warn/30 bg-warn/10 text-warn" : conv.estado === "seguimiento" ? "border-sky-400/30 bg-sky-400/10 text-sky-300" : "border-bad/30 bg-bad/10 text-bad")}><I.Alert className="h-4 w-4" /> {conv.reason}</div>}
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
              {hilo.length === 0 && (
                <div className="grid h-full place-items-center text-center text-xs text-zinc-600">
                  Conversación vacía. Escribí abajo y tu mensaje va a aparecer acá (y se guarda).
                </div>
              )}
              {hilo.map((m, i) => {
                const txt = i === lastBotIdx && correccion ? correccion : m.t;
                return (
                <div key={i} className={"flex " + (m.who === "in" ? "justify-start" : "justify-end")}>
                  <div className={"max-w-[85%] " + (m.system ? "w-full" : "")}>
                    {(() => {
                      const label = m.who === "in" ? conv.nombre : m.agent;
                      return label ? <div className={"mb-0.5 text-[10px] font-semibold " + (m.who === "in" ? "pl-1 text-zinc-400" : "pr-1 text-right text-brand-400/80")}>{label}</div> : null;
                    })()}
                    {m.system ? <div className="flex items-center gap-2 rounded-lg border border-line bg-ink-900 px-3 py-1.5 text-[11px] text-zinc-400"><I.Search className="h-3.5 w-3.5 text-brand-400 animate-live" /> {txt}</div> :
                      m.card === "fotos" ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {(m.fotos ?? []).map((u, k) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <a key={k} href={u} target="_blank" rel="noopener noreferrer" className="block"><img src={u} alt="foto de la propiedad" className="h-24 w-full rounded-lg object-cover" /></a>
                          ))}
                        </div>
                      ) :
                      <div className={"whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-snug " + (m.who === "in" ? "rounded-bl-sm bg-ink-800" : "rounded-br-sm bg-brand-600/80 text-white")}>{txt}
                        {m.card === "resultados" && <div className="mt-2 space-y-1">{resultados.map((r) => <div key={r.t} className="flex items-center gap-2 rounded-lg border border-line bg-black/30 px-2 py-1.5"><span className="grid h-7 w-7 place-items-center rounded bg-brand-400/15 font-mono text-[10px] font-bold text-brand-300">{r.match}</span><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{r.t}</div><div className="text-[10px] text-zinc-500">{r.zona} · {r.src}</div></div><span className="font-mono text-[11px] text-brand-300">{r.precio}</span></div>)}</div>}
                      </div>}
                    <div className={"mt-0.5 text-[9px] text-zinc-600 " + (m.who === "in" ? "" : "text-right")}>{m.ts}</div>
                  </div>
                </div>
                );
              })}
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
                    className="min-w-0 flex-1 rounded-lg border border-line bg-ink-900 px-3 py-2 text-base outline-none placeholder:text-zinc-600 focus:border-brand-400/60"
                  />
                  <button onClick={send} disabled={sending || !text.trim()} className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-400 px-3 py-2 text-sm font-semibold text-ink-950 disabled:opacity-50"><I.Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button>
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

      {/* contexto — columna en desktop; hoja full-screen en celular al tocar el header */}
      <div className={(mobileInfo ? "fixed inset-0 z-40 flex" : "hidden") + " min-h-0 flex-col overflow-y-auto border-l border-line bg-ink-900 p-4 lg:static lg:z-auto lg:flex"}>
        {conv && (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Contexto del lead</div>
            <div className="mt-3 space-y-3 text-sm">
              <F l="Asignado a"><span className={conv.asignado === "bot" ? "text-brand-300" : ""}>{conv.asignado}</span></F>
              <F l="Mood"><span className="capitalize">{conv.mood || "—"}</span></F>
              <F l="Score"><span className="font-mono text-brand-300">{conv.score}</span></F>
              <F l="Propiedad ancla">
                {(() => {
                  if (!conv.ancla) return <span className="text-zinc-500">—</span>;
                  const d = anclaData(conv.ancla);
                  if (!d) return <span>{conv.ancla}</span>;
                  return (
                    <button onClick={() => setFicha(d)} className="cursor-pointer rounded-md border border-brand-400/40 bg-brand-400/10 px-2 py-1 text-xs font-medium text-brand-200 transition hover:bg-brand-400/20">
                      {anclaLabel(conv.ancla)} ↗
                    </button>
                  );
                })()}
              </F>
              <F l="Vino de"><span className="font-mono text-[11px] text-zinc-400">{conv.origen || "—"}</span></F>
              {conv.criteriosBusqueda && (
                <div>
                  <div className="text-zinc-500">Búsqueda pedida</div>
                  <div className="mt-0.5 text-[13px] leading-snug text-zinc-300">{conv.criteriosBusqueda}</div>
                </div>
              )}
              {conv.disponibilidad && (
                <div>
                  <div className="text-zinc-500">Disponibilidad</div>
                  <div className="mt-0.5 rounded-md border border-brand-400/30 bg-brand-400/10 px-2 py-1 text-[13px] text-brand-200">🗓 {conv.disponibilidad}</div>
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">🧠 Analista</div>
                <button
                  onClick={analizarChat}
                  disabled={analizando}
                  className="cursor-pointer rounded-md border border-brand-400/50 bg-brand-400/15 px-2.5 py-1 text-[11px] font-semibold text-brand-200 transition hover:bg-brand-400/25 disabled:opacity-50"
                >
                  {analizando ? "Analizando…" : analisis[conv.id] ? "↻ Re-analizar" : "Analizar chat"}
                </button>
              </div>
              {(() => {
                const an = analisis[conv.id];
                if (!an) return null;
                const temp = an.temperatura ? TEMP_PILL[an.temperatura] : undefined;
                return (
                  <div className="space-y-2.5 text-[13px]">
                    {temp && <span className={"pill " + temp.c}>{temp.t}</span>}
                    {an.resumen && <div className="leading-snug text-zinc-300">{an.resumen}</div>}
                    {an.busca && (
                      <div><div className="text-[11px] text-zinc-500">Qué busca</div><div className="leading-snug text-zinc-300">{an.busca}</div></div>
                    )}
                    {an.objeciones && an.objeciones.length > 0 && (
                      <div>
                        <div className="text-[11px] text-zinc-500">Objeciones / dudas</div>
                        <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-zinc-300">{an.objeciones.map((o, i) => <li key={i}>{o}</li>)}</ul>
                      </div>
                    )}
                    {an.sugerencia && (
                      <div className="rounded-lg border border-brand-400/30 bg-brand-400/10 p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-brand-300">💬 Respondé algo así</span>
                          <button onClick={() => { navigator.clipboard?.writeText(an.sugerencia ?? ""); }} className="cursor-pointer text-[10px] text-zinc-400 hover:text-brand-200">copiar</button>
                        </div>
                        <div className="leading-snug text-brand-100">{an.sugerencia}</div>
                      </div>
                    )}
                    {an.siguiente && (
                      <div><div className="text-[11px] text-zinc-500">Próximo paso</div><div className="leading-snug text-zinc-300">{an.siguiente}</div></div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Acciones</div>
              {!(conv.estado === "bot" && !tomadas[conv.id]) && (
                <button
                  onClick={reactivar}
                  disabled={reactivando}
                  className="mb-2 flex w-full items-center justify-center gap-2 rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-xs font-semibold text-ok transition hover:bg-ok/20 disabled:opacity-50"
                >
                  🤖 {reactivando ? "Reactivando…" : "Reactivar el bot"}
                </button>
              )}
              {!corrigiendo ? (
                <button
                  onClick={abrirCorregir}
                  disabled={lastBotIdx < 0}
                  title={lastBotIdx < 0 ? "Todavía no hay un mensaje del bot para corregir" : ""}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-xs font-medium text-zinc-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  ✏️ Corregir último mensaje del bot
                </button>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={corrText}
                    onChange={(e) => setCorrText(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-xs outline-none focus:border-brand-400/60"
                  />
                  <div className="flex items-center gap-2">
                    <button onClick={guardarCorreccion} disabled={guardandoCorr || !corrText.trim()} className="rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-semibold text-ink-950 hover:bg-brand-300 disabled:opacity-50">{guardandoCorr ? "Guardando…" : "Guardar corrección"}</button>
                    <button onClick={() => setCorrigiendo(false)} className="text-xs text-zinc-400 hover:text-zinc-200">cancelar</button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Derivar a vendedor</div>
              {vendedores.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-ink-850 px-3 py-2 text-[11px] text-zinc-500">
                  Ningún agente con disponibilidad ahora mismo. Cargá horarios libres en <span className="text-brand-300">Agenda</span>.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {vendedores.map((v) => {
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
              )}
            </div>

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pasar a un operador</div>
              {operadores.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line bg-ink-850 px-3 py-2 text-[11px] text-zinc-500">No hay operadores cargados.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {operadores.map((o) => {
                    const ya = conv.asignado === o;
                    return (
                      <button
                        key={o}
                        onClick={() => asignarOp(o)}
                        disabled={asignando || ya}
                        className={
                          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 " +
                          (ya
                            ? "border-ok/40 bg-ok/10 text-ok"
                            : "border-sky-400/50 bg-sky-400/15 text-sky-200 hover:bg-sky-400/25")
                        }
                      >
                        {ya ? `✓ Lo tiene ${o}` : `Pasar a ${o}`}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button onClick={() => setMobileInfo(false)} className="mt-5 w-full rounded-xl border border-brand-400/40 bg-brand-400/15 px-4 py-3 text-sm font-bold text-brand-200 hover:bg-brand-400/25 lg:hidden">✕ Cerrar info</button>
          </>
        )}
      </div>

      {ficha && <FichaModal prop={ficha} onClose={() => setFicha(null)} />}
    </div>
  );
}

function FichaModal({ prop, onClose }: { prop: AnclaProp; onClose: () => void }) {
  const precio = prop.precio != null ? `${prop.moneda || "USD"} ${Number(prop.precio).toLocaleString("es-AR")}` : "Consultar";
  const tags = [
    prop.ambientes ? `${prop.ambientes} amb` : null,
    prop.dormitorios ? `${prop.dormitorios} dorm` : null,
    prop.banos ? `${prop.banos} baños` : null,
    prop.sup_cubierta ? `${prop.sup_cubierta} m² cub` : null,
    prop.sup_total ? `${prop.sup_total} m² tot` : null,
    prop.cocheras ? `${prop.cocheras} cochera` : null,
  ].filter(Boolean) as string[];
  const extra: [string, string][] = [];
  if (prop.direccion) extra.push(["Dirección", prop.direccion]);
  if (prop.antiguedad != null) extra.push(["Antigüedad", `${prop.antiguedad} años`]);
  if (prop.expensas) extra.push(["Expensas", String(prop.expensas)]);
  if (prop.condicion) extra.push(["Estado", prop.condicion]);
  if (prop.orientacion) extra.push(["Orientación", prop.orientacion]);
  if (prop.disposicion) extra.push(["Disposición", prop.disposicion]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-ink-950" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-40 bg-gradient-to-br from-ink-800 to-ink-900">
          {prop.foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={prop.foto} alt={prop.tipo || "propiedad"} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-xs text-zinc-600">📷 sin foto</div>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-[11px] text-zinc-200">📍 {prop.origen === "propia" ? "Propia" : "Red Tokko"}</span>
        </div>
        <div className="p-4">
          <div className="text-base font-semibold text-zinc-100">{prop.tipo || "Propiedad"}</div>
          <div className="text-xs text-zinc-500">{prop.ubicacion || ""}</div>
          <div className="mt-2 font-mono text-xl font-bold text-brand-300">{precio}</div>
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((t, i) => <span key={i} className="rounded-md border border-line bg-ink-850 px-2 py-1 text-[11px] text-zinc-400">{t}</span>)}
            </div>
          )}
          {extra.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
              {extra.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><span className="text-zinc-500">{k}</span><span className="text-right text-zinc-300">{v}</span></div>
              ))}
            </div>
          )}
          {prop.url ? (
            <a href={prop.url} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg border border-brand-400/40 bg-brand-400/10 py-2 text-center text-xs font-semibold text-brand-200 transition hover:bg-brand-400/20">
              Ver ficha en Tokko ↗
            </a>
          ) : (
            <div className="mt-3 rounded-lg border border-line bg-ink-900 px-3 py-2 text-[11px] text-zinc-500">
              📷 Foto y link a Tokko: pendientes del cambio en el motor (n8n).
            </div>
          )}
          <button onClick={onClose} className="mt-3 w-full cursor-pointer rounded-lg border border-line py-2 text-xs text-zinc-300 hover:bg-white/5">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
