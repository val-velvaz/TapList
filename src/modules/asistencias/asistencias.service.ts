import { pool } from '../../db/pool.js';
import { HttpError } from '../../utils/HttpError.js';
import { armarPagina, type Pagina } from '../../utils/validacion.js';
import type { FiltrosAsistencias } from './asistencias.schemas.js';

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

/** P2: asistencias de las clases del docente, de la más reciente a la más antigua. */
export async function listarAsistencias(idDocente: number, filtros: FiltrosAsistencias): Promise<Pagina<AsistenciaPublica>> {
  await verificarFiltrosPropios(idDocente, filtros);

  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => `$${parametros.push(valor)}`;
  const condiciones = [`c.id_docente = ${parametro(idDocente)}`];
  if (filtros.id_clase) condiciones.push(`a.id_clase = ${parametro(filtros.id_clase)}`);
  if (filtros.id_grupo) condiciones.push(`c.id_grupo = ${parametro(filtros.id_grupo)}`);
  if (filtros.id_estudiante) condiciones.push(`a.id_estudiante = ${parametro(filtros.id_estudiante)}`);
  if (filtros.estado) condiciones.push(`a.estado = ${parametro(filtros.estado)}`);
  if (filtros.desde) condiciones.push(`a.fecha >= ${parametro(filtros.desde)}`);
  if (filtros.hasta) condiciones.push(`a.fecha <= ${parametro(filtros.hasta)}`);
  const where = `WHERE ${condiciones.join(' AND ')}`;

  const { rows: conteo } = await pool.query<{ total: string }>(
    `SELECT count(*) AS total FROM asistencia a JOIN clase c ON c.id_clase = a.id_clase ${where}`,
    parametros,
  );
  const total = Number(conteo[0]?.total ?? 0);

  const limite = parametro(filtros.por_pagina);
  const salto = parametro((filtros.pagina - 1) * filtros.por_pagina);
  const { rows } = await pool.query<FilaAsistencia>(
    `${SELECT_ASISTENCIA}
     ${where}
     ORDER BY a.fecha DESC, a.hora DESC, a.id_asistencia DESC
     LIMIT ${limite} OFFSET ${salto}`,
    parametros,
  );

  return armarPagina(rows.map(aAsistenciaPublica), total, filtros.pagina, filtros.por_pagina);
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
      ORDER BY g.ciclo_escolar DESC, g.nombre, c.dia_semana, c.hora_inicio`,
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
