import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import PanelShell from "@/components/panel/PanelShell";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return (
    <PanelShell nombre={ctx.nombre} rol={ctx.rol} inmobiliaria={ctx.inmobiliariaNombre}>
      {children}
    </PanelShell>
  );
}
