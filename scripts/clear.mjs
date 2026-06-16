// Vacía la data de negocio (deja inmobiliarias + usuarios). Para testear desde cero.
//   node scripts/clear.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALWAYS = "00000000-0000-0000-0000-000000000000";
for (const t of ["mensajes","conversaciones","busquedas","matches","visitas","operaciones","anclas","propiedades","leads"]) {
  const { error } = await db.from(t).delete().neq("id", ALWAYS);
  if (error) throw new Error(`${t}: ${error.message}`);
  console.log("vaciada:", t);
}
console.log("\n✅ Panel vacío. Inmobiliarias y usuarios intactos.");
