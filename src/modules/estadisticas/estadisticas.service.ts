import { pool } from '../../db/pool.js';
import { verificarFiltrosPropios } from '../asistencias/asistencias.service.js';
import type { FiltrosEstadisticas } from './estadisticas.schemas.js';

/**
 * Estadísticas de asistencia de P3 (RF-16), por grupo, clase y periodo.
 *
 * Definiciones (ver README, «Cómo se calculan las faltas»):
 *  - Sesión: un par (clase, fecha) del periodo, hasta hoy, en el que al menos
 *    una credencial registró asistencia. Un día sin ningún registro (festivo,
 *    vacaciones, clase cancelada o lector descompuesto) no cuenta como clase,
 *    así que nunca genera faltas.
 *  - Esperados en una sesión: los estudiantes inscritos en el grupo ese día
 *    según inscripcion_grupo, sin contar el día del alta ni el de la baja o
 *    cambio de grupo (desde < fecha < hasta), más quien sí registró ese día.
 *  - Falta: un esperado sin registro en la sesión.
 *  - Porcentaje de asistencia: (asistencias + retardos) / esperados × 100.
 */

export interface Conteo {
  sesiones: number;
  esperados: number;
  asistencias: number;
  retardos: number;
  faltas: number;
  /** Con un decimal; null si no hubo esperados. */
  porcentaje_asistencia: number | null;
}

export interface Estadisticas {
  periodo: { desde: string; hasta: string };
  filtros: {
    grupo: { id: number; nombre: string } | null;
    clase: { id: number; materia: string } | null;
  };
  resumen: Conteo;
  /** Una fila por semana ISO (empieza en lunes) con al menos una sesión. */
  por_semana: Array<Conteo & { semana: string }>;
  por_clase: Array<Conteo & { clase: { id: number; materia: string }; grupo: { id: number; nombre: string } }>;
  estudiantes_con_mas_faltas: Array<{
    estudiante: { id: number; matricula: string; nombre: string; apellidos: string; activo: boolean };
    esperados: number;
    asistencias: number;
    retardos: number;
    faltas: number;
    porcentaje_asistencia: number | null;
  }>;
}

// Columnas de conteo sobre el CTE "detalle" (una fila por estudiante esperado
// en cada sesión, con estado NULL si faltó).
const CONTEO = `
  count(DISTINCT (d.id_clase, d.fecha))::int                 AS sesiones,
  count(*)::int                                              AS esperados,
  count(*) FILTER (WHERE d.estado = 'Asistencia')::int       AS asistencias,
  count(*) FILTER (WHERE d.estado = 'Retardo')::int          AS retardos,
  count(*) FILTER (WHERE d.estado IS NULL)::int              AS faltas,
  round(100.0 * count(d.estado) / nullif(count(*), 0), 1)::float8 AS porcentaje_asistencia`;

const CONSULTA = `
WITH periodo AS (
  SELECT $2::date AS desde, least($3::date, current_date) AS hasta
),
clases AS (
  SELECT c.id_clase, c.id_grupo, c.materia, c.dia_semana
    FROM clase c
   WHERE c.id_docente = $1
     AND ($4::int IS NULL OR c.id_grupo = $4)
     AND ($5::int IS NULL OR c.id_clase = $5)
),
sesiones AS (
  SELECT DISTINCT a.id_clase, a.fecha
    FROM asistencia a
    JOIN clases c ON c.id_clase = a.id_clase, periodo p
   WHERE a.fecha BETWEEN p.desde AND p.hasta
     AND extract(isodow FROM a.fecha) = c.dia_semana
),
esperados AS (
  SELECT s.id_clase, s.fecha, i.id_estudiante
    FROM sesiones s
    JOIN clases c ON c.id_clase = s.id_clase
    JOIN inscripcion_grupo i
      ON i.id_grupo = c.id_grupo
     AND i.desde < s.fecha
     AND (i.hasta IS NULL OR i.hasta > s.fecha)
  UNION
  SELECT a.id_clase, a.fecha, a.id_estudiante
    FROM asistencia a
    JOIN sesiones s ON s.id_clase = a.id_clase AND s.fecha = a.fecha
),
detalle AS (
  SELECT e.id_clase, e.fecha, e.id_estudiante, a.estado
    FROM esperados e
    LEFT JOIN asistencia a
      ON a.id_clase = e.id_clase AND a.fecha = e.fecha AND a.id_estudiante = e.id_estudiante
)
SELECT
  (SELECT json_build_object('desde', to_char(desde, 'YYYY-MM-DD'), 'hasta', to_char(hasta, 'YYYY-MM-DD')) FROM periodo) AS periodo,
  (SELECT row_to_json(r) FROM (SELECT ${CONTEO} FROM detalle d) r) AS resumen,
  (SELECT coalesce(json_agg(r ORDER BY r.semana), '[]') FROM (
     SELECT to_char(date_trunc('week', d.fecha), 'YYYY-MM-DD') AS semana, ${CONTEO}
       FROM detalle d GROUP BY date_trunc('week', d.fecha)) r) AS por_semana,
  (SELECT coalesce(json_agg(r ORDER BY r.grupo->>'nombre', r.clase->>'materia'), '[]') FROM (
     SELECT json_build_object('id', c.id_clase, 'materia', c.materia) AS clase,
            json_build_object('id', g.id_grupo, 'nombre', g.nombre) AS grupo,
            ${CONTEO}
       FROM detalle d
       JOIN clases c ON c.id_clase = d.id_clase
       JOIN grupo g ON g.id_grupo = c.id_grupo
      GROUP BY c.id_clase, c.materia, g.id_grupo, g.nombre) r) AS por_clase,
  (SELECT coalesce(json_agg(r ORDER BY r.faltas DESC, r.retardos DESC, r.estudiante->>'apellidos', r.estudiante->>'nombre'), '[]') FROM (
     SELECT json_build_object('id', e.id_estudiante, 'matricula', e.matricula, 'nombre', e.nombre,
                              'apellidos', e.apellidos, 'activo', e.activo) AS estudiante,
            count(*)::int                                        AS esperados,
            count(*) FILTER (WHERE d.estado = 'Asistencia')::int AS asistencias,
            count(*) FILTER (WHERE d.estado = 'Retardo')::int    AS retardos,
            count(*) FILTER (WHERE d.estado IS NULL)::int        AS faltas,
            round(100.0 * count(d.estado) / nullif(count(*), 0), 1)::float8 AS porcentaje_asistencia
       FROM detalle d
       JOIN estudiante e ON e.id_estudiante = d.id_estudiante
      GROUP BY e.id_estudiante
     HAVING count(*) FILTER (WHERE d.estado IS NULL) > 0
      ORDER BY faltas DESC, retardos DESC, e.apellidos, e.nombre
      LIMIT $6) r) AS estudiantes_con_mas_faltas,
  (SELECT json_build_object('id', g.id_grupo, 'nombre', g.nombre) FROM grupo g WHERE g.id_grupo = $4) AS grupo,
  (SELECT json_build_object('id', c.id_clase, 'materia', c.materia) FROM clase c WHERE c.id_clase = $5) AS clase`;

/** P3: estadísticas de las clases del docente. Un grupo o clase ajenos responden 404. */
export async function calcularEstadisticas(idDocente: number, filtros: FiltrosEstadisticas): Promise<Estadisticas> {
  await verificarFiltrosPropios(idDocente, filtros);

  const { rows } = await pool.query(CONSULTA, [
    idDocente,
    filtros.desde,
    filtros.hasta,
    filtros.id_grupo ?? null,
    filtros.id_clase ?? null,
    filtros.top,
  ]);
  const fila = rows[0];
  return {
    periodo: fila.periodo,
    filtros: { grupo: fila.grupo, clase: fila.clase },
    resumen: fila.resumen,
    por_semana: fila.por_semana,
    por_clase: fila.por_clase,
    estudiantes_con_mas_faltas: fila.estudiantes_con_mas_faltas,
  };
}
