// Motor de búsqueda REAL: pega al webhook de n8n que invoca `buscar_propiedad` (modo 1).
// El contrato es el mismo `/honex/search` — solo cambia el mock por este fetch.

import type { SearchEngine } from "./engine";
import type { SearchInput, SearchResult } from "./types";

export class HttpSearchEngine implements SearchEngine {
  constructor(private webhookUrl: string) {}

  async search(input: SearchInput): Promise<SearchResult[]> {
    const res = await fetch(this.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`/honex/search → ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    // El webhook responde un array de SearchResult (o { results: [...] }).
    return Array.isArray(data) ? data : (data.results ?? []);
  }
}
