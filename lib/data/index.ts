// Selección de implementación del repositorio (por request).
// Con env de Supabase presente → SupabaseRepository (RLS scopea por tenant/rol).
// Si no → MockRepository (datos demo locales). La UI no cambia en ningún caso.

import type { HonexRepository } from "./types";
import { MockRepository } from "./mock";

const useSupabase = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

export async function getRepository(): Promise<HonexRepository> {
  if (useSupabase) {
    const [{ SupabaseRepository }, { createClient }] = await Promise.all([
      import("./supabase"),
      import("@/lib/supabase/server"),
    ]);
    return new SupabaseRepository(await createClient());
  }
  return new MockRepository();
}

export type { HonexRepository } from "./types";
export * from "./types";
