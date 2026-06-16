// Motor de búsqueda MOCKEADO con la forma EXACTA del `out` de /honex/search.
// El panel y el flujo funcionan sin el VPS. El swap al webhook real es reemplazar
// la implementación por un `fetch`, sin tocar el contrato ni el panel.

import type { SearchEngine } from "./engine";
import type { SearchInput, SearchResult } from "./types";

const SAMPLE: SearchResult[] = [
  {
    tokko_property_id: "TK-100245",
    operacion: "venta",
    tipo: "departamento",
    titulo: "2 amb · balcón al frente",
    descripcion: "2 ambientes luminoso, balcón al frente, excelente ubicación sobre Bv. Oroño.",
    precio: 92000,
    moneda: "USD",
    zona: "Centro · Oroño",
    direccion_aprox: "Bv. Oroño al 1200",
    m2: 58,
    ambientes: 2,
    dormitorios: 1,
    fotos: [
      "https://res.cloudinary.com/honex/image/upload/demo/tk-100245-1.jpg",
      "https://res.cloudinary.com/honex/image/upload/demo/tk-100245-2.jpg",
    ],
    tokko_url: "https://ficha.tokko.example/TK-100245",
    estado: "disponible",
    match_score: 96,
    posicion_ranking: 1,
  },
  {
    tokko_property_id: "TK-100871",
    operacion: "venta",
    tipo: "monoambiente",
    titulo: "Mono a estrenar",
    descripcion: "Monoambiente a estrenar con amenities en Pichincha.",
    precio: 64500,
    moneda: "USD",
    zona: "Pichincha",
    direccion_aprox: "Güemes al 2300",
    m2: 34,
    ambientes: 1,
    dormitorios: 0,
    fotos: ["https://res.cloudinary.com/honex/image/upload/demo/tk-100871-1.jpg"],
    tokko_url: "https://ficha.tokko.example/TK-100871",
    estado: "disponible",
    match_score: 88,
    posicion_ranking: 2,
  },
  {
    tokko_property_id: "TK-101533",
    operacion: "venta",
    tipo: "departamento",
    titulo: "2 amb c/ cochera",
    descripcion: "2 ambientes con cochera cubierta, sobre calle tranquila del Centro.",
    precio: 89000,
    moneda: "USD",
    zona: "Centro",
    direccion_aprox: "Mitre al 900",
    m2: 55,
    ambientes: 2,
    dormitorios: 1,
    fotos: ["https://res.cloudinary.com/honex/image/upload/demo/tk-101533-1.jpg"],
    tokko_url: "https://ficha.tokko.example/TK-101533",
    estado: "disponible",
    match_score: 81,
    posicion_ranking: 3,
  },
];

export class MockSearchEngine implements SearchEngine {
  // Ignora el input y devuelve el ejemplo: alcanza para el flujo del MVP.
  async search(_input: SearchInput): Promise<SearchResult[]> {
    return SAMPLE;
  }
}
