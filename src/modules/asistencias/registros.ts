import { env } from '../../config/env.js';

/*
 * Registros de asistencia de las clases de un docente: una fila por estudiante
 * esperado en cada sesión, con uno de cuatro estados. Lo usan la lista de P2,
 * las estadísticas de P3 y sus exportaciones, así que las cuatro cuentan igual
 * por construcción.
 *
 *  - Sesión: un par (clase, fecha) en el que al menos una credencial registró
 *    asistencia («hubo clase si alguien registró»).
 *  - Esperados en una sesión: los inscritos en el grupo ese día según
 *    inscripcion_grupo, sin contar el día del alta ni el de la baja o cambio de
 *    grupo (desde < fecha < hasta), más quien sí registró ese día.
 *  - Estado:
 *      Asistencia / Retardo  el estudiante registró (tabla asistencia).
 *      Pendiente             no ha registrado y la ventana de registro de la
 *                            clase sigue abierta: todavía puede llegar.
 *      Falta                 no registró y la ventana ya cerró.
 *
 * La ventana de registro cierra en hora_inicio + max(MINUTOS_MAX_REGISTRO,
 * tolerancia_min), la misma regla con la que el endpoint de lecturas acepta
 * una lectura (ver lecturas/tiempo.ts). Ese último minuto todavía cuenta: los
 * segundos de una lectura se truncan, así que 08:00:59 es el minuto 08:00.
 * Todo se calcula en ZONA_HORARIA_ESCUELA, con la hora que se pasa en `ahora`
 * (no con el reloj de PostgreSQL), para que las pruebas puedan fijarla.
 */

export type EstadoRegistro = 'Asistencia' | 'Retardo' | 'Falta' | 'Pendiente';
export const ESTADOS_REGISTRO = ['Asistencia', 'Retardo', 'Falta', 'Pendiente'] as const;

export interface AlcanceRegistros {
  idDocente: number;
  idGrupo?: number;
  idClase?: number;
  /** Fechas del día de la clase, 'YYYY-MM-DD', ambas incluidas. */
  desde?: string;
  hasta?: string;
  /** El momento actual. Decide si una ausencia es Pendiente o Falta. */
  ahora: Date;
}

/**
 * Las CTE (sin el WITH) que definen `clases` y `registros`.
 * `registros` tiene: id_clase, fecha, id_estudiante, id_asistencia (NULL si no
 * registró) y estado.
 *
 * @param parametro agrega un valor a la lista de parámetros y devuelve su marcador ($n)
 */
export function cteRegistros(alcance: AlcanceRegistros, parametro: (valor: unknown) => string): string {
  const filtrosClase = [`c.id_docente = ${parametro(alcance.idDocente)}`];
  if (alcance.idGrupo) filtrosClase.push(`c.id_grupo = ${parametro(alcance.idGrupo)}`);
  if (alcance.idClase) filtrosClase.push(`c.id_clase = ${parametro(alcance.idClase)}`);

  const filtrosFecha: string[] = [];
  if (alcance.desde) filtrosFecha.push(`a.fecha >= ${parametro(alcance.desde)}::date`);
  if (alcance.hasta) filtrosFecha.push(`a.fecha <= ${parametro(alcance.hasta)}::date`);

  const ahora = parametro(alcance.ahora.toISOString());
  const zona = parametro(env.ZONA_HORARIA_ESCUELA);
  const minutosMax = parametro(env.MINUTOS_MAX_REGISTRO);

  return `
reloj AS (
  -- Minuto actual en la hora local de la escuela.
  SELECT date_trunc('minute', ${ahora}::timestamptz AT TIME ZONE ${zona}) AS minuto
),
clases AS (
  SELECT c.id_clase, c.id_grupo, c.materia, c.hora_inicio, c.tolerancia_min
    FROM clase c
   WHERE ${filtrosClase.join(' AND ')}
),
sesiones AS (
  SELECT DISTINCT a.id_clase, a.fecha
    FROM asistencia a
    JOIN clases c ON c.id_clase = a.id_clase
   ${filtrosFecha.length ? `WHERE ${filtrosFecha.join(' AND ')}` : ''}
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
registros AS (
  SELECT e.id_clase, e.fecha, e.id_estudiante, a.id_asistencia,
         CASE
           WHEN a.estado IS NOT NULL THEN a.estado
           -- Cierre de la ventana: el último minuto en que se acepta una lectura.
           WHEN (e.fecha + c.hora_inicio) + make_interval(mins => greatest(${minutosMax}::int, c.tolerancia_min))
                >= r.minuto THEN 'Pendiente'
           ELSE 'Falta'
         END AS estado
    FROM esperados e
    JOIN clases c ON c.id_clase = e.id_clase
    CROSS JOIN reloj r
    LEFT JOIN asistencia a
      ON a.id_clase = e.id_clase AND a.fecha = e.fecha AND a.id_estudiante = e.id_estudiante
)`;
}
