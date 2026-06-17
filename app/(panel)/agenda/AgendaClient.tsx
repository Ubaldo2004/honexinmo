"use client";

import { useState } from "react";
import { Card } from "@/components/panel/ui";
import { toggleDisponibilidad } from "./actions";

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const FRANJAS = ["mañana", "tarde"];

type Vend = { id: string; nombre: string; rol: string };

export default function AgendaClient({
  vendedores,
  slots,
  currentUserId,
  esAdmin,
}: {
  vendedores: Vend[];
  slots: string[];
  currentUserId: string;
  esAdmin: boolean;
}) {
  const [set, setSet] = useState<Set<string>>(new Set(slots));
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(uid: string, dia: string, franja: string) {
    const key = `${uid}|${dia}|${franja}`;
    const activar = !set.has(key);
    setBusy(key);
    setSet((prev) => {
      const n = new Set(prev);
      if (activar) n.add(key); else n.delete(key);
      return n;
    });
    const res = await toggleDisponibilidad(uid, dia, franja, activar);
    setBusy(null);
    if (!res.ok) {
      setSet((prev) => {
        const n = new Set(prev);
        if (activar) n.delete(key); else n.add(key);
        return n;
      });
      alert(res.error ?? "No se pudo guardar");
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-zinc-400">
        <span className="font-semibold text-zinc-200">Agenda de vendedores.</span> Marcá los días y franjas en que cada
        vendedor está libre para hacer visitas. Después el sistema lo cruza con la disponibilidad del cliente para
        asignar el recorrido. <span className="text-zinc-500">Tocá una celda para marcar <span className="text-ok">libre</span>.</span>
      </Card>

      {vendedores.length === 0 ? (
        <Card className="px-4 py-10 text-center text-sm text-zinc-500">No hay vendedores cargados en la inmobiliaria.</Card>
      ) : (
        vendedores.map((v) => {
          const editable = esAdmin || v.id === currentUserId;
          return (
            <Card key={v.id} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-semibold">
                  {v.nombre}{" "}
                  <span className="text-[11px] font-normal text-zinc-500">· {v.rol === "agente_visitas" ? "agente de visitas" : v.rol}</span>
                </div>
                {!editable && <span className="text-[11px] text-zinc-600">solo lectura</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-xs">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left text-zinc-500"></th>
                      {FRANJAS.map((f) => <th key={f} className="px-2 py-1 text-center capitalize text-zinc-500">{f}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {DIAS.map((d) => (
                      <tr key={d} className="border-t border-line/50">
                        <td className="px-2 py-1.5 capitalize text-zinc-300">{d}</td>
                        {FRANJAS.map((f) => {
                          const key = `${v.id}|${d}|${f}`;
                          const on = set.has(key);
                          return (
                            <td key={f} className="px-2 py-1.5 text-center">
                              <button
                                onClick={() => editable && toggle(v.id, d, f)}
                                disabled={!editable || busy === key}
                                className={
                                  "h-7 w-20 rounded-md border text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 " +
                                  (on ? "border-ok/40 bg-ok/15 text-ok" : "border-line text-zinc-500 hover:bg-white/5")
                                }
                              >
                                {on ? "libre ✓" : "—"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
