import { pool } from '../../db/pool.js';
import { ORDEN_ES } from '../../db/orden.js';
import { HttpError } from '../../utils/HttpError.js';
import { condicionesBusquedaEstudiante } from '../../utils/busqueda.js';
import { armarPagina, type Pagina } from '../../utils/validacion.js';
import type { FiltrosAsistencias } from './asistencias.schemas.js';
import { cteRegistros, type EstadoRegistro } from './registros.js';

// Toda consulta de este módulo se limita a las clases del docente
// (clase.id_docente). Ninguna toca credencial_nfc: la pantalla P2 no
// necesita el UID, ni siquiera enmascarado (RNF-06).

export interface AsistenciaPublica {
  id: number;
  /** Fecha del día de la clase, 'YYYY-MM-DD'. */
  fecha: string;
  /** Hora local de la lectura, 'HH:MM:SS'. */
  hora: string;
  estado: 'Asistencia' | 'Retardo';
  estudiante: { id: number; matricula: string; nombre: string; apellidos: string; activo: boolean };
  clase: { id: number; materia: string; dia_semana: number; hora_inicio: string };
  grupo: { id: number; nombre: string };
  dispositivo: { id: number; nombre_ubicacion: string };
}

/**
 * Una fila de la lista de P2. Si el estudiante registró, es una asistencia
 * con todos sus datos. Si no (Falta o Pendiente), no hay lectura: `id`, `hora`
 * y `dispositivo` son null.
 */
export type RegistroPublico =
  | AsistenciaPublica
  | (Omit<AsistenciaPublica, 'id' | 'hora' | 'estado' | 'dispositivo'> & {
      id: null;
      hora: null;
      estado: Extract<EstadoRegistro, 'Falta' | 'Pendiente'>;
      dispositivo: null;
    });

interface FilaAsistencia {
  id_asistencia: number;
  fecha: string;
  hora: string;
  estado: 'Asistencia' | 'Retardo';
  id_estudiante: number;
  matricula: string;
  nombre: string;
  apellidos: string;
  estudiante_activo: boolean;
  id_clase: number;
  materia: string;
  dia_semana: number;
  hora_inicio: string;
  id_grupo: number;
  grupo_nombre: string;
  id_dispositivo: number;
  nombre_ubicacion: string;
  id_docente: number;
}

const SELECT_ASISTENCIA = `
  SELECT a.id_asistencia, to_char(a.fecha, 'YYYY-MM-DD') AS fecha, to_char(a.hora, 'HH24:MI:SS') AS hora, a.estado,
         e.id_estudiante, e.matricula, e.nombre, e.apellidos, e.activo AS estudiante_activo,
         c.id_clase, c.materia, c.dia_semana, to_char(c.hora_inicio, 'HH24:MI') AS hora_inicio, c.id_docente,
         g.id_grupo, g.nombre AS grupo_nombre,
         d.id_dispositivo, d.nombre_ubicacion
    FROM asistencia a
    JOIN clase c       ON c.id_clase = a.id_clase
    JOIN grupo g       ON g.id_grupo = c.id_grupo
    JOIN estudiante e  ON e.id_estudiante = a.id_estudiante
    JOIN dispositivo d ON d.id_dispositivo = a.id_dispositivo`;

function aAsistenciaPublica(f: FilaAsistencia): AsistenciaPublica {
  return {
    id: f.id_asistencia,
    fecha: f.fecha,
    hora: f.hora,
    estado: f.estado,
    estudiante: {
      id: f.id_estudiante,
      matricula: f.matricula,
      nombre: f.nombre,
      apellidos: f.apellidos,
      activo: f.estudiante_activo,
    },
    clase: { id: f.id_clase, materia: f.materia, dia_semana: f.dia_semana, hora_inicio: f.hora_inicio },
    grupo: { id: f.id_grupo, nombre: f.grupo_nombre },
    dispositivo: { id: f.id_dispositivo, nombre_ubicacion: f.nombre_ubicacion },
  };
}

/**
 * Un filtro que apunta a algo que el docente no imparte responde 404, igual
 * que si no existiera, para no revelar que existe (en lugar de 403).
 */
export async function verificarFiltrosPropios(
  idDocente: number,
  filtros: Pick<FiltrosAsistencias, 'id_clase' | 'id_grupo' | 'id_estudiante'>,
): Promise<void> {
  const verificar = async (sql: string, id: number, mensaje: string) => {
    const { rowCount } = await pool.query(sql, [id, idDocente]);
    if (!rowCount) throw new HttpError(404, mensaje);
  };
  if (filtros.id_clase) {
    await verificar('SELECT 1 FROM clase WHERE id_clase = $1 AND id_docente = $2', filtros.id_clase, 'La clase no existe');
  }
  if (filtros.id_grupo) {
    await verificar(
      'SELECT 1 FROM clase WHERE id_grupo = $1 AND id_docente = $2 LIMIT 1',
      filtros.id_grupo,
      'El grupo no existe',
    );
  }
  if (filtros.id_estudiante) {
    // Un estudiante es "suyo" si hoy pertenece a un grupo donde el docente
    // imparte alguna clase, o si tiene al menos una asistencia en una de sus
    // clases (p. ej. un estudiante que cambió de grupo conserva su historial).
    await verificar(
      `SELECT 1 FROM estudiante e
        WHERE e.id_estudiante = $1
          AND (EXISTS (SELECT 1 FROM clase c WHERE c.id_grupo = e.id_grupo AND c.id_docente = $2)
               OR EXISTS (SELECT 1 FROM asistencia a JOIN clase c ON c.id_clase = a.id_clase
                           WHERE a.id_estudiante = e.id_estudiante AND c.id_docente = $2))`,
      filtros.id_estudiante,
      'El estudiante no existe',
    );
  }
}

type FilaRegistro = Omit<FilaAsistencia, 'id_asistencia' | 'hora' | 'estado' | 'id_dispositivo' | 'nombre_ubicacion'> & {
  id_asistencia: number | null;
  hora: string | null;
  estado: EstadoRegistro;
  id_dispositivo: number | null;
  nombre_ubicacion: string | null;
};

function aRegistroPublico(f: FilaRegistro): RegistroPublico {
  if (f.estado === 'Asistencia' || f.estado === 'Retardo') return aAsistenciaPublica(f as FilaAsistencia);
  return {
    id: null,
    fecha: f.fecha,
    hora: null,
    estado: f.estado,
    estudiante: {
      id: f.id_estudiante,
      matricula: f.matricula,
      nombre: f.nombre,
      apellidos: f.apellidos,
      activo: f.estudiante_activo,
    },
    clase: { id: f.id_clase, materia: f.materia, dia_semana: f.dia_semana, hora_inicio: f.hora_inicio },
    grupo: { id: f.id_grupo, nombre: f.grupo_nombre },
    dispositivo: null,
  };
}

/**
 * P2: registros de las clases del docente (asistencias, retardos, faltas y
 * pendientes; ver registros.ts), de la sesión más reciente a la más antigua.
 * Dentro de una sesión, primero las lecturas, de la más reciente a la más
 * antigua, y después quien no ha registrado, por apellidos.
 *
 * Los filtros de grupo, clase y fechas eligen las sesiones; los de estudiante,
 * búsqueda y estado eligen filas dentro de ellas, así que una falta siempre se
 * calcula con la sesión completa.
 */
export async function listarAsistencias(
  idDocente: number,
  filtros: FiltrosAsistencias,
  ahora: Date = new Date(),
): Promise<Pagina<RegistroPublico>> {
  await verificarFiltrosPropios(idDocente, filtros);

  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => `$${parametros.push(valor)}`;
  const cte = cteRegistros(
    { idDocente, idGrupo: filtros.id_grupo, idClase: filtros.id_clase, desde: filtros.desde, hasta: filtros.hasta, ahora },
    parametro,
  );

  const condiciones: string[] = [];
  if (filtros.id_estudiante) condiciones.push(`r.id_estudiante = ${parametro(filtros.id_estudiante)}`);
  if (filtros.estado) condiciones.push(`r.estado = ${parametro(filtros.estado)}`);
  if (filtros.q) condiciones.push(...condicionesBusquedaEstudiante(filtros.q, 'e', parametro));
  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const { rows: conteo } = await pool.query<{ total: string }>(
    `WITH ${cte}
     SELECT count(*) AS total
       FROM registros r
       JOIN estudiante e ON e.id_estudiante = r.id_estudiante
     ${donde}`,
    parametros,
  );
  const total = Number(conteo[0]?.total ?? 0);

  const limite = parametro(filtros.por_pagina);
  const salto = parametro((filtros.pagina - 1) * filtros.por_pagina);
  const { rows } = await pool.query<FilaRegistro>(
    `WITH ${cte}
     SELECT a.id_asistencia, to_char(r.fecha, 'YYYY-MM-DD') AS fecha, to_char(a.hora, 'HH24:MI:SS') AS hora, r.estado,
            e.id_estudiante, e.matricula, e.nombre, e.apellidos, e.activo AS estudiante_activo,
            c.id_clase, c.materia, c.dia_semana, to_char(c.hora_inicio, 'HH24:MI') AS hora_inicio, c.id_docente,
            g.id_grupo, g.nombre AS grupo_nombre,
            d.id_dispositivo, d.nombre_ubicacion
       FROM registros r
       JOIN estudiante e ON e.id_estudiante = r.id_estudiante
       JOIN clase c ON c.id_clase = r.id_clase
       JOIN grupo g ON g.id_grupo = c.id_grupo
       LEFT JOIN asistencia a ON a.id_asistencia = r.id_asistencia
       LEFT JOIN dispositivo d ON d.id_dispositivo = a.id_dispositivo
     ${donde}
     ORDER BY r.fecha DESC, c.hora_inicio DESC, c.id_clase DESC,
              a.hora DESC NULLS LAST, a.id_asistencia DESC,
              e.apellidos ${ORDEN_ES}, e.nombre ${ORDEN_ES}, e.id_estudiante
     LIMIT ${limite} OFFSET ${salto}`,
    parametros,
  );

  return armarPagina(rows.map(aRegistroPublico), total, filtros.pagina, filtros.por_pagina);
}

/** Grupos y clases que imparte el docente, para los selectores de filtros de P2. */
export async function filtrosDelDocente(idDocente: number) {
  const { rows } = await pool.query<{
    id_clase: number;
    materia: string;
    dia_semana: number;
    hora_inicio: string;
    tolerancia_min: number;
    id_grupo: number;
    grupo_nombre: string;
    ciclo_escolar: string;
  }>(
    `SELECT c.id_clase, c.materia, c.dia_semana, to_char(c.hora_inicio, 'HH24:MI') AS hora_inicio, c.tolerancia_min,
            g.id_grupo, g.nombre AS grupo_nombre, g.ciclo_escolar
       FROM clase c
       JOIN grupo g ON g.id_grupo = c.id_grupo
      WHERE c.id_docente = $1
      ORDER BY g.ciclo_escolar ${ORDEN_ES} DESC, g.nombre ${ORDEN_ES}, c.dia_semana, c.hora_inicio, c.id_clase`,
    [idDocente],
  );

  const grupos = new Map<number, { id: number; nombre: string; ciclo_escolar: string }>();
  for (const f of rows) grupos.set(f.id_grupo, { id: f.id_grupo, nombre: f.grupo_nombre, ciclo_escolar: f.ciclo_escolar });

  return {
    grupos: [...grupos.values()],
    clases: rows.map((f) => ({
      id: f.id_clase,
      materia: f.materia,
      dia_semana: f.dia_semana,
      hora_inicio: f.hora_inicio,
      tolerancia_min: f.tolerancia_min,
      grupo: { id: f.id_grupo, nombre: f.grupo_nombre },
    })),
  };
}

/**
 * Una asistencia con el mismo formato que la lista, más el docente de su
 * clase. La usa el aviso en tiempo real para saber a quién enviarla.
 */
export async function obtenerAsistencia(
  idAsistencia: number,
): Promise<{ asistencia: AsistenciaPublica; idDocente: number } | null> {
  const { rows } = await pool.query<FilaAsistencia>(`${SELECT_ASISTENCIA} WHERE a.id_asistencia = $1`, [idAsistencia]);
  const fila = rows[0];
  return fila ? { asistencia: aAsistenciaPublica(fila), idDocente: fila.id_docente } : null;
}

/**
 * Asistencias de las clases del docente con id mayor que `despuesDe`, en orden,
 * creadas en la última hora y como máximo `limite`. Las reenvía el SSE al
 * reconectarse (Last-Event-ID).
 */
export async function asistenciasDesde(idDocente: number, despuesDe: number, limite: number): Promise<AsistenciaPublica[]> {
  const { rows } = await pool.query<FilaAsistencia>(
    `${SELECT_ASISTENCIA}
      WHERE c.id_docente = $1 AND a.id_asistencia > $2 AND a.created_at > now() - interval '1 hour'
      ORDER BY a.id_asistencia
      LIMIT $3`,
    [idDocente, despuesDe, limite],
  );
  return rows.map(aAsistenciaPublica);
}
