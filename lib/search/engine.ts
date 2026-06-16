// Interfaz del motor de búsqueda. Detrás puede estar el mock (MVP) o el webhook
// real /honex/search (fase 2). La UI/bot nunca dependen de la implementación.

import type { SearchInput, SearchResult } from "./types";

export interface SearchEngine {
  search(input: SearchInput): Promise<SearchResult[]>;
}
