// Implementación MOCK del repositorio. Lee de seed-data.ts.
// Es swappable por una implementación Supabase sin tocar la UI (ver index.ts).

import type {
  HonexRepository,
  Pieza,
  Kpi,
  FunnelStep,
  Conversacion,
  MensajeHilo,
  Resultado,
  Accion,
  Lead,
  Busqueda,
  Ancla,
  Operacion,
  Visita,
  VisitaItem,
  SeguimientoItem,
  Rol,
} from "./types";
import {
  PIEZAS,
  KPIS,
  FUNNEL,
  DEMANDA,
  CONVERSACIONES,
  HILO,
  RESULTADOS,
  ACCIONES,
  LEADS,
  BUSQUEDAS,
  ANCLAS,
  OPERACIONES,
  VISITA,
  ROLES,
} from "./seed-data";

export class MockRepository implements HonexRepository {
  async getPiezas(): Promise<Pieza[]> {
    return PIEZAS;
  }
  async getKpis(): Promise<Kpi[]> {
    return KPIS;
  }
  async getFunnel(): Promise<FunnelStep[]> {
    return FUNNEL;
  }
  async getDemanda(): Promise<number[]> {
    return DEMANDA;
  }
  async getConversaciones(): Promise<Conversacion[]> {
    return CONVERSACIONES;
  }
  async getConversacion(id: string): Promise<Conversacion | null> {
    return CONVERSACIONES.find((c) => c.id === id) ?? null;
  }
  // En el mock el hilo es el mismo para todas las conversaciones (ilustrativo).
  async getHilosByConversacion(): Promise<Record<string, MensajeHilo[]>> {
    return Object.fromEntries(CONVERSACIONES.map((c) => [c.id, HILO]));
  }
  async getResultados(): Promise<Resultado[]> {
    return RESULTADOS;
  }
  async getAcciones(): Promise<Accion[]> {
    return ACCIONES;
  }
  async getLeads(): Promise<Lead[]> {
    return LEADS.map((l, i) => ({ id: String(i), ...l }));
  }
  async getBusquedas(): Promise<Busqueda[]> {
    return BUSQUEDAS;
  }
  async getAnclas(): Promise<Ancla[]> {
    return ANCLAS;
  }
  async getOperaciones(): Promise<Operacion[]> {
    return OPERACIONES;
  }
  async getVisita(): Promise<Visita> {
    return VISITA;
  }
  async getVisitas(): Promise<VisitaItem[]> {
    return [];
  }
  async getSeguimientos(): Promise<SeguimientoItem[]> {
    return [];
  }
  async getRoles(): Promise<Rol[]> {
    return ROLES;
  }
}
