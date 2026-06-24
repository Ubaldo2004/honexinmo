"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/panel/ui";
import type { VisitaItem } from "@/lib/data/types";
import {
  crearVisita, urlSubida, confirmarAudio, urlReproduccion, guardarTranscripto, eliminarVisita,
} from "./actions";

type LeadOpt = { id: string; nombre: string };

function dur(s: number | null): string {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function VisitasClient({ visitas: initial, leads }: { visitas: VisitaItem[]; leads: LeadOpt[] }) {
  const [visitas, setVisitas] = useState<VisitaItem[]>(initial);
  const [leadId, setLeadId] = useState(leads[0]?.id ?? "");
  const [prop, setProp] = useState("");
  const [rec, setRec] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [segs, setSegs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const mr = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ext = useRef("webm");

  async function startRec() {
    setErr(null); setBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      chunks.current = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setBlob(new Blob(chunks.current, { type: "audio/webm" }));
        setSegs((Date.now() - startedAt.current) / 1000);
        ext.current = "webm";
      };
      startedAt.current = Date.now();
      r.start();
      mr.current = r; setRec(true);
    } catch {
      setErr("No pude acceder al micrófono. Dale permiso al navegador (y usá HTTPS).");
    }
  }
  function stopRec() { mr.current?.stop(); setRec(false); }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setBlob(f); setSegs(0); ext.current = (f.name.split(".").pop() || "m4a").toLowerCase();
    setErr(null);
  }

  async function guardar() {
    if (!blob) return;
    setBusy(true); setErr(null);
    try {
      const lead = leadId || null;
      const c = await crearVisita(lead, prop.trim());
      if (!c.ok) throw new Error(c.error);
      const u = await urlSubida(c.id, ext.current);
      if (!u.ok) throw new Error(u.error);
      const up = await createClient().storage.from("visitas-audio").uploadToSignedUrl(u.path, u.token, blob);
      if (up.error) throw new Error(up.error.message);
      const cf = await confirmarAudio(c.id, lead, u.path, segs);
      if (!cf.ok) throw new Error(cf.error);
      const nombre = leads.find((l) => l.id === leadId)?.nombre ?? "—";
      setVisitas((prev) => [{
        id: c.id, leadId: lead, lead: nombre, prop: prop.trim(), agente: "vos",
        fecha: new Date().toLocaleDateString("es-AR"), audioPath: u.path, transcripto: null,
        duracionSeg: Math.round(segs), analisis: null,
      }, ...prev]);
      setBlob(null); setProp(""); setSegs(0);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }

  const field = "w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/60";

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-zinc-400">
        <span className="font-semibold text-zinc-200">Visitas.</span> Después de mostrar la propiedad, grabá la visita
        (o subí el audio). Queda guardada como <strong>historial del cliente</strong> y habilita el seguimiento.
        La transcripción automática se conecta después.
      </Card>

      {/* Captura */}
      <Card className="p-5">
        <div className="mb-3 font-semibold">Nueva visita</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[11px] text-zinc-500">Cliente (lead)
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className={field}>
              {leads.length === 0 && <option value="">— sin leads —</option>}
              {leads.map((l) => <option key={l.id} value={l.id} className="bg-ink-900">{l.nombre}</option>)}
            </select>
          </label>
          <label className="block text-[11px] text-zinc-500">Propiedad (opcional)
            <input value={prop} onChange={(e) => setProp(e.target.value)} placeholder="Ej: Casa Fisherton" className={field} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!rec ? (
            <button onClick={startRec} disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-bad/15 px-4 py-2 text-sm font-medium text-bad transition hover:bg-bad/25 disabled:opacity-50">
              <span className="h-2.5 w-2.5 rounded-full bg-bad" /> Grabar
            </button>
          ) : (
            <button onClick={stopRec}
              className="flex items-center gap-2 rounded-lg bg-bad px-4 py-2 text-sm font-semibold text-white">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> Detener
            </button>
          )}
          <span className="text-xs text-zinc-500">o</span>
          <label className="cursor-pointer rounded-lg border border-line px-4 py-2 text-sm text-zinc-300 transition hover:bg-white/5">
            Subir archivo
            <input type="file" accept="audio/*" onChange={onFile} className="hidden" disabled={busy || rec} />
          </label>
          {blob && !rec && (
            <span className="text-xs text-ok">audio listo{segs ? ` · ${dur(segs)}` : ""} ✓</span>
          )}
        </div>

        {blob && !rec && (
          <div className="mt-4 flex items-center gap-3">
            <button onClick={guardar} disabled={busy}
              className="rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brand-300 disabled:opacity-50">
              {busy ? "Subiendo…" : "Guardar visita"}
            </button>
            <button onClick={() => { setBlob(null); setSegs(0); }} disabled={busy}
              className="text-xs text-zinc-400 hover:text-zinc-200">descartar</button>
          </div>
        )}
        {err && <div className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">{err}</div>}
      </Card>

      {/* Historial */}
      <div className="text-sm text-zinc-400">
        <span className="font-mono text-brand-300">{visitas.length}</span> visita{visitas.length === 1 ? "" : "s"} grabada{visitas.length === 1 ? "" : "s"}
      </div>
      {visitas.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-zinc-500">Todavía no hay visitas grabadas.</Card>
      ) : (
        <div className="space-y-3">
          {visitas.map((v) => <VisitaRow key={v.id} v={v} onDelete={(id) => setVisitas((p) => p.filter((x) => x.id !== id))} />)}
        </div>
      )}
    </div>
  );
}

function VisitaRow({ v, onDelete }: { v: VisitaItem; onDelete: (id: string) => void }) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [texto, setTexto] = useState(v.transcripto ?? "");
  const [savedTxt, setSavedTxt] = useState(v.transcripto ?? "");
  const [savingTxt, setSavingTxt] = useState(false);
  const [transcribiendo, setTranscribiendo] = useState(false);
  const [analisis, setAnalisis] = useState(v.analisis);
  const [analizando, setAnalizando] = useState(false);
  const [open, setOpen] = useState(false);

  async function play() {
    if (audioUrl || !v.audioPath) return;
    setLoading(true);
    const r = await urlReproduccion(v.audioPath);
    setLoading(false);
    if (r.ok) setAudioUrl(r.url);
  }
  async function saveTxt() {
    setSavingTxt(true);
    const r = await guardarTranscripto(v.id, texto);
    setSavingTxt(false);
    if (r.ok) setSavedTxt(texto.trim());
  }
  async function transcribir() {
    if (transcribiendo) return;
    setOpen(true);
    setTranscribiendo(true);
    try {
      const r = await fetch("/api/transcribir", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitaId: v.id }) });
      const j = await r.json();
      if (!j.ok) alert(j.error ?? "No se pudo transcribir");
      else { setTexto(j.texto); setSavedTxt((j.texto as string).trim()); }
    } catch { alert("Error al transcribir"); }
    setTranscribiendo(false);
  }
  async function analizar() {
    if (analizando) return;
    setAnalizando(true);
    try {
      const r = await fetch("/api/analizar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ visitaId: v.id }) });
      const j = await r.json();
      if (!j.ok) alert(j.error ?? "No se pudo analizar");
      else setAnalisis(j.analisis);
    } catch { alert("Error al analizar"); }
    setAnalizando(false);
  }
  async function borrar() {
    if (!confirm("¿Eliminar esta visita y su grabación?")) return;
    const r = await eliminarVisita(v.id, v.audioPath);
    if (r.ok) onDelete(v.id);
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{v.lead}{v.prop ? <span className="font-normal text-zinc-400"> · {v.prop}</span> : null}</div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {v.fecha} · agente {v.agente}{v.duracionSeg ? ` · ${dur(v.duracionSeg)}` : ""}
            {savedTxt ? <span className="ml-2 text-ok">transcripto ✓</span> : <span className="ml-2 text-zinc-500">sin transcripto</span>}
          </div>
        </div>
        <button onClick={borrar} className="text-[11px] text-bad/80 hover:text-bad">eliminar</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {v.audioPath ? (
          audioUrl ? (
            <audio controls src={audioUrl} className="h-9 w-full max-w-md" />
          ) : (
            <button onClick={play} disabled={loading}
              className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5 disabled:opacity-50">
              {loading ? "cargando…" : "▶ Reproducir grabación"}
            </button>
          )
        ) : <span className="text-xs text-zinc-500">sin audio</span>}
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-brand-300 hover:text-brand-200">
          {open ? "ocultar transcripto" : (savedTxt ? "ver transcripto" : "agregar transcripto")}
        </button>
        {v.audioPath && (
          <button onClick={transcribir} disabled={transcribiendo} className="rounded-md border border-brand-400/40 bg-brand-400/10 px-2.5 py-1 text-xs font-medium text-brand-200 transition hover:bg-brand-400/20 disabled:opacity-50">
            {transcribiendo ? "Transcribiendo… (puede tardar)" : "✨ Transcribir automático"}
          </button>
        )}
        {savedTxt && (
          <button onClick={analizar} disabled={analizando} className="rounded-md border border-sky-400/40 bg-sky-400/10 px-2.5 py-1 text-xs font-medium text-sky-300 transition hover:bg-sky-400/20 disabled:opacity-50">
            {analizando ? "Analizando…" : "🧠 Analizar visita"}
          </button>
        )}
      </div>

      {analisis && (
        <div className="mt-3 rounded-lg border border-sky-400/20 bg-sky-400/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-sky-300">
            🧠 Análisis del Analista
            {typeof analisis.prob === "number" && <span className="ml-auto rounded-full bg-sky-400/15 px-2 py-0.5 font-mono text-[11px]">{analisis.prob}% cierre</span>}
          </div>
          <div className="space-y-2 text-[13px]">
            {analisis.le_gusto && (
              <div><span className="text-zinc-500">¿Le gustó? </span>
                <span className={analisis.le_gusto === "si" ? "text-ok" : analisis.le_gusto === "no" ? "text-bad" : "text-warn"}>
                  {analisis.le_gusto === "si" ? "Sí 👍" : analisis.le_gusto === "no" ? "No 👎" : "Dudoso 🤔"}
                </span>
              </div>
            )}
            {analisis.positivos && analisis.positivos.length > 0 && (
              <div><div className="text-[11px] uppercase text-zinc-500">Le gustó</div><ul className="mt-0.5">{analisis.positivos.map((p, i) => <li key={i} className="text-zinc-300">· {p}</li>)}</ul></div>
            )}
            {analisis.objeciones && analisis.objeciones.length > 0 && (
              <div><div className="text-[11px] uppercase text-zinc-500">No le gustó / objeciones</div><ul className="mt-0.5">{analisis.objeciones.map((p, i) => <li key={i} className="text-zinc-300">· {p}</li>)}</ul></div>
            )}
            {analisis.busca_ahora && (
              <div><div className="text-[11px] uppercase text-zinc-500">Busca ahora</div><div className="text-zinc-300">{analisis.busca_ahora}</div></div>
            )}
            {analisis.siguiente && (
              <div className="rounded-md border border-brand-400/30 bg-brand-400/10 p-2"><div className="text-[11px] font-semibold text-brand-300">Próximo paso (seguimiento)</div><div className="text-zinc-200">{analisis.siguiente}</div></div>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="mt-3">
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5}
            placeholder="Transcripto de la visita. Tocá ✨ Transcribir automático, o escribilo/pegalo a mano."
            className="w-full rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm outline-none focus:border-brand-400/60" />
          <div className="mt-2 flex items-center gap-3">
            <button onClick={saveTxt} disabled={savingTxt || texto.trim() === savedTxt}
              className="rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-brand-300 disabled:opacity-50">
              {savingTxt ? "Guardando…" : "Guardar transcripto"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
