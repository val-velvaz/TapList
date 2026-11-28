import { pedir } from './cliente';

/** Conteo de P3 (ver «Indicadores» en el README). Un pendiente no cuenta en esperados, faltas ni porcentaje. */
export interface Conteo {
  sesiones: number;
  esperados: number;
  asistencias: number;
  retardos: number;
  faltas: number;
  pendientes: number;
  porcentaje_asistencia: number | null;
}

/** GET /api/estadisticas */
export interface Estadisticas {
  periodo: { desde: string; hasta: string };
  /** Inscritos en la fecha `periodo.hasta` en los grupos elegidos. */
  estudiantes_en_grupo: number;
  filtros: { grupo: { id: number; nombre: string } | null; clase: { id: number; materia: string } | null };
  resumen: Conteo;
  /** Solo las semanas con al menos una sesión; `semana` es el lunes, 'YYYY-MM-DD'. */
  por_semana: Array<Conteo & { semana: string }>;
  por_clase: Array<Conteo & { clase: { id: number; materia: string }; grupo: { id: number; nombre: string } }>;
  estudiantes_con_mas_faltas: Array<{
    estudiante: { id: number; matricula: string; nombre: string; apellidos: string; activo: boolean };
    esperados: number;
    asistencias: number;
    retardos: number;
    faltas: number;
    pendientes: number;
    porcentaje_asistencia: number | null;
  }>;
}

/** Los filtros de P3 tal como viajan a la API (y en la dirección de la página). */
export interface FiltrosP3 {
  id_grupo: string;
  id_clase: string;
  desde: string;
  hasta: string;
}

/** Máximo de días del periodo que acepta la API. */
export const MAX_DIAS_PERIODO = 366;

function consulta(filtros: FiltrosP3, extra: Record<string, string> = {}): string {
  const parametros = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...filtros, ...extra })) if (valor) parametros.set(clave, valor);
  return parametros.toString();
}

export const obtenerEstadisticas = (filtros: FiltrosP3, senal?: AbortSignal) =>
  pedir<Estadisticas>(`/api/estadisticas?${consulta(filtros)}`, { senal });

export const rutaExportarEstadisticas = (filtros: FiltrosP3, formato: 'pdf' | 'xlsx') =>
  `/api/estadisticas/exportar?${consulta(filtros, { formato })}`;
