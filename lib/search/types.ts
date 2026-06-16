// Contrato del motor de búsqueda Tokko ("Tokko Finder").
//
// REGLA DURA: el motor NO se toca. Es una caja negra read-only que ya está
// construida, probada y corriendo. Honex lo consume vía:
//
//   POST /honex/search
//
// Este contrato es SAGRADO: el swap del mock al webhook real debe ser cambiar la
// implementación por un `fetch`, sin tocar nada del panel. No cambiar estas formas
// sin coordinar con el dueño del motor.

export interface SearchInput {
  // Multi-tenant: cada inmobiliaria tiene su propia cuenta de Tokko / inventario.
  // Va desde el día 1 aunque el motor esté mockeado, para no rehacer el contrato.
  inmobiliaria_id: string;
  operacion: string; // venta | alquiler ...
  tipo: string; // departamento | casa | mono ...
  ciudad: string;
  zona: string;
  presupuesto_min: number;
  presupuesto_max: number;
  ambientes: number;
}

export interface SearchResult {
  tokko_property_id: string;
  operacion: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  precio: number;
  moneda: string;
  zona: string;
  direccion_aprox: string;
  m2: number;
  ambientes: number;
  dormitorios: number;
  fotos: string[]; // URLs Cloudinary
  tokko_url: string;
  estado: "disponible" | "reservado" | "vendido";
  match_score: number;
  posicion_ranking: number;
}
