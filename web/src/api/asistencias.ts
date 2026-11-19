import { pedir } from './cliente';

/** Las cuatro formas en que aparece un estudiante en la lista de P2. */
export type EstadoRegistro = 'Asistencia' | 'Retardo' | 'Pendiente' | 'Falta';
export const ESTADOS: EstadoRegistro[] = ['Asistencia', 'Retardo', 'Pendiente', 'Falta'];

/** Una fila de GET /api/asistencias. Faltas y pendientes no tienen lectura: id, hora y dispositivo son null. */
export interface Registro {
  id: number | null;
  fecha: string;
  hora: string | null;
  estado: EstadoRegistro;
  estudiante: { id: number; matricula: string; nombre: string; apellidos: string; activo: boolean };
  clase: { id: number; materia: string; dia_semana: number; hora_inicio: string };
  grupo: { id: number; nombre: string };
  dispositivo: { id: number; nombre_ubicacion: string } | null;
}

export interface Pagina<T> {
  datos: T[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export interface OpcionesFiltros {
  grupos: Array<{ id: number; nombre: string; ciclo_escolar: string }>;
  clases: Array<{
    id: number;
    materia: string;
    dia_semana: number;
    hora_inicio: string;
    tolerancia_min: number;
    grupo: { id: number; nombre: string };
  }>;
}

/** Los filtros de P2 tal como viajan a la API (y en la dirección de la página). */
export interface FiltrosP2 {
  id_grupo?: string;
  id_clase?: string;
  q?: string;
  estado?: EstadoRegistro;
  desde?: string;
  hasta?: string;
}

export const POR_PAGINA = 20;

/** Arma la consulta, sin los filtros vacíos. */
export function consulta(filtros: FiltrosP2, extra: Record<string, string | number> = {}): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...filtros, ...extra })) {
    if (valor !== undefined && valor !== '') parametros.set(clave, String(valor));
  }
  return parametros.toString();
}

export const obtenerOpcionesFiltros = (senal?: AbortSignal) =>
  pedir<OpcionesFiltros>('/api/asistencias/filtros', { senal });

export const listarRegistros = (filtros: FiltrosP2, pagina: number, senal?: AbortSignal) =>
  pedir<Pagina<Registro>>(`/api/asistencias?${consulta(filtros, { pagina, por_pagina: POR_PAGINA })}`, { senal });

export const rutaExportar = (filtros: FiltrosP2, formato: 'pdf' | 'xlsx') =>
  `/api/asistencias/exportar?${consulta(filtros, { formato })}`;
