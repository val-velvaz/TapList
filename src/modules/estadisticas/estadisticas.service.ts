import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { ORDEN_ES } from '../../db/orden.js';
import { verificarFiltrosPropios } from '../asistencias/asistencias.service.js';
import { cteRegistros } from '../asistencias/registros.js';
import { aMomentoLocal } from '../lecturas/tiempo.js';
import type { FiltrosEstadisticas } from './estadisticas.schemas.js';

/**
 * Estadísticas de asistencia de P3 (RF-16), por grupo, clase y periodo.
 *
 * Se calculan sobre los mismos registros que la lista de P2 (ver
 * asistencias/registros.ts), así que los totales coinciden por construcción:
 *  - Sesión: un par (clase, fecha) del periodo, hasta hoy, en el que al menos
 *    una credencial registró asistencia.
 *  - Cada estudiante esperado en una sesión queda como Asistencia, Retardo,
 *    Falta o Pendiente (todavía puede registrar: la ventana sigue abierta).
 *  - Esperados: asistencias + retardos + faltas. Un Pendiente todavía no es
 *    falta ni asistencia, así que no cuenta en los esperados ni en el
 *    porcentaje; se informa aparte en `pendientes`.
 *  - Porcentaje de asistencia: (asistencias + retardos) / esperados × 100.
 *  - Estudiantes en el grupo: los inscritos en la fecha final del periodo
 *    (`hasta`, ya recortada a hoy) en los grupos elegidos: el grupo del
 *    filtro, el grupo de la clase del filtro o, sin filtro, todos los grupos
 *    donde el docente da clase. Inscrito en esa fecha significa
 *    desde <= hasta y (sin fecha de baja o baja posterior a hasta). Así, quien
 *    se dio de baja dentro del periodo ya no cuenta, igual que en el resto de
 *    las estadísticas a esa fecha; quien se dio de baja ese mismo día, tampoco.
 */

export interface Conteo {
  sesiones: number;
  esperados: number;
  asistencias: number;
  retardos: number;
  faltas: number;
  /** Ausentes en una sesión cuya ventana de registro sigue abierta. */
  pendientes: number;
  /** Con un decimal; null si no hubo esperados. */
  porcentaje_asistencia: number | null;
}

export interface Estadisticas {
  periodo: { desde: string; hasta: string };
  /** Estudiantes inscritos en la fecha `periodo.hasta` en los grupos elegidos. */
  estudiantes_en_grupo: number;
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
    pendientes: number;
    porcentaje_asistencia: number | null;
  }>;
}

// Conteos sobre las filas de "registros" (alias d).
const ESPERADOS = `count(*) FILTER (WHERE d.estado <> 'Pendiente')`;
const POR_ESTUDIANTE = `
  ${ESPERADOS}::int                                         AS esperados,
  count(*) FILTER (WHERE d.estado = 'Asistencia')::int      AS asistencias,
  count(*) FILTER (WHERE d.estado = 'Retardo')::int         AS retardos,
  count(*) FILTER (WHERE d.estado = 'Falta')::int           AS faltas,
  count(*) FILTER (WHERE d.estado = 'Pendiente')::int       AS pendientes,
  round(100.0 * count(*) FILTER (WHERE d.estado IN ('Asistencia', 'Retardo'))
        / nullif(${ESPERADOS}, 0), 1)::float8               AS porcentaje_asistencia`;
const CONTEO = `
  count(DISTINCT (d.id_clase, d.fecha))::int                AS sesiones,
  ${POR_ESTUDIANTE}`;

/** P3: estadísticas de las clases del docente. Un grupo o clase ajenos responden 404. */
export async function calcularEstadisticas(
  idDocente: number,
  filtros: FiltrosEstadisticas,
  ahora: Date = new Date(),
): Promise<Estadisticas> {
  await verificarFiltrosPropios(idDocente, filtros);

  // Un periodo que llega al futuro se recorta a hoy, en la zona de la escuela.
  const hoy = aMomentoLocal(ahora, env.ZONA_HORARIA_ESCUELA).fecha;
  const hasta = filtros.hasta < hoy ? filtros.hasta : hoy;

  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => `$${parametros.push(valor)}`;
  const cte = cteRegistros(
    { idDocente, idGrupo: filtros.id_grupo, idClase: filtros.id_clase, desde: filtros.desde, hasta, ahora },
    parametro,
  );
  const top = parametro(filtros.top);
  const idGrupo = parametro(filtros.id_grupo ?? null);
  const idClase = parametro(filtros.id_clase ?? null);
  const fechaFinal = parametro(hasta);

  const { rows } = await pool.query(
    `WITH ${cte}
SELECT
  (SELECT row_to_json(r) FROM (SELECT ${CONTEO} FROM registros d) r) AS resumen,
  (SELECT count(DISTINCT i.id_estudiante)::int
     FROM inscripcion_grupo i
    WHERE i.id_grupo IN (SELECT c.id_grupo FROM clases c)
      AND i.desde <= ${fechaFinal}::date
      AND (i.hasta IS NULL OR i.hasta > ${fechaFinal}::date)) AS estudiantes_en_grupo,
  (SELECT coalesce(json_agg(r ORDER BY r.semana), '[]') FROM (
     SELECT to_char(date_trunc('week', d.fecha), 'YYYY-MM-DD') AS semana, ${CONTEO}
       FROM registros d GROUP BY date_trunc('week', d.fecha)) r) AS por_semana,
  (SELECT coalesce(json_agg(r ORDER BY r.grupo->>'nombre' ${ORDEN_ES}, r.clase->>'materia' ${ORDEN_ES}, (r.clase->>'id')::int), '[]') FROM (
     SELECT json_build_object('id', c.id_clase, 'materia', c.materia) AS clase,
            json_build_object('id', g.id_grupo, 'nombre', g.nombre) AS grupo,
            ${CONTEO}
       FROM registros d
       JOIN clases c ON c.id_clase = d.id_clase
       JOIN grupo g ON g.id_grupo = c.id_grupo
      GROUP BY c.id_clase, c.materia, g.id_grupo, g.nombre) r) AS por_clase,
  (SELECT coalesce(json_agg(r ORDER BY r.faltas DESC, r.retardos DESC, r.estudiante->>'apellidos' ${ORDEN_ES}, r.estudiante->>'nombre' ${ORDEN_ES}, (r.estudiante->>'id')::int), '[]') FROM (
     SELECT json_build_object('id', e.id_estudiante, 'matricula', e.matricula, 'nombre', e.nombre,
                              'apellidos', e.apellidos, 'activo', e.activo) AS estudiante,
            ${POR_ESTUDIANTE}
       FROM registros d
       JOIN estudiante e ON e.id_estudiante = d.id_estudiante
      GROUP BY e.id_estudiante
     HAVING count(*) FILTER (WHERE d.estado = 'Falta') > 0
      ORDER BY faltas DESC, retardos DESC, e.apellidos ${ORDEN_ES}, e.nombre ${ORDEN_ES}, e.id_estudiante
      LIMIT ${top}) r) AS estudiantes_con_mas_faltas,
  (SELECT json_build_object('id', g.id_grupo, 'nombre', g.nombre) FROM grupo g WHERE g.id_grupo = ${idGrupo}::int) AS grupo,
  (SELECT json_build_object('id', c.id_clase, 'materia', c.materia) FROM clase c WHERE c.id_clase = ${idClase}::int) AS clase`,
    parametros,
  );
  const fila = rows[0];
  return {
    periodo: { desde: filtros.desde, hasta },
    estudiantes_en_grupo: fila.estudiantes_en_grupo,
    filtros: { grupo: fila.grupo, clase: fila.clase },
    resumen: fila.resumen,
    por_semana: fila.por_semana,
    por_clase: fila.por_clase,
    estudiantes_con_mas_faltas: fila.estudiantes_con_mas_faltas,
  };
}
