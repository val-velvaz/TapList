import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import { conTransaccion } from '../../db/transaccion.js';
import { esViolacionLlaveForanea, esViolacionUnica } from '../../utils/erroresPg.js';
import { HttpError } from '../../utils/HttpError.js';
import { registrarEnBitacora } from '../bitacora/bitacora.service.js';
import type { DatosAlta, FiltrosConsulta } from './estudiantes.schemas.js';

export const MENSAJE_MATRICULA_DUPLICADA = 'Ya existe un estudiante con esa matrícula';
export const MENSAJE_UID_ASIGNADO = 'Esa credencial ya está asignada';
export const MENSAJE_YA_TIENE_CREDENCIAL = 'El estudiante ya tiene una credencial activa; usa reemplazar';

// En las consultas de este módulo el UID se enmascara dentro del SQL, así
// que el UID completo nunca sale de la base hacia la aplicación (RNF-06).
const UID_ENMASCARADO_SQL = `'****' || right(c.uid, 4)`;

export interface CredencialPublica {
  id: number;
  uid_enmascarado: string;
  activa: boolean;
  fecha_asignacion: string;
}

export interface EstudiantePublico {
  id: number;
  matricula: string;
  nombre: string;
  apellidos: string;
  correo: string;
  activo: boolean;
  grupo: { id: number; nombre: string; ciclo_escolar: string };
  /** La credencial activa, o null si no tiene. */
  credencial: CredencialPublica | null;
}

export interface PaginaEstudiantes {
  datos: EstudiantePublico[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

interface FilaEstudiante {
  id_estudiante: number;
  matricula: string;
  nombre: string;
  apellidos: string;
  correo: string;
  activo: boolean;
  id_grupo: number;
  grupo_nombre: string;
  ciclo_escolar: string;
  id_credencial: number | null;
  uid_enmascarado: string | null;
  credencial_activa: boolean | null;
  fecha_asignacion: Date | null;
}

const SELECT_ESTUDIANTE = `
  SELECT e.id_estudiante, e.matricula, e.nombre, e.apellidos, e.correo, e.activo,
         g.id_grupo, g.nombre AS grupo_nombre, g.ciclo_escolar,
         c.id_credencial, ${UID_ENMASCARADO_SQL} AS uid_enmascarado,
         c.activa AS credencial_activa, c.fecha_asignacion
    FROM estudiante e
    JOIN grupo g ON g.id_grupo = e.id_grupo
    LEFT JOIN credencial_nfc c ON c.id_estudiante = e.id_estudiante AND c.activa`;

function aEstudiantePublico(fila: FilaEstudiante): EstudiantePublico {
  return {
    id: fila.id_estudiante,
    matricula: fila.matricula,
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    correo: fila.correo,
    activo: fila.activo,
    grupo: { id: fila.id_grupo, nombre: fila.grupo_nombre, ciclo_escolar: fila.ciclo_escolar },
    credencial:
      fila.id_credencial === null
        ? null
        : {
            id: fila.id_credencial,
            uid_enmascarado: fila.uid_enmascarado!,
            activa: fila.credencial_activa!,
            fecha_asignacion: fila.fecha_asignacion!.toISOString(),
          },
  };
}

/** Escapa los comodines de LIKE para buscar el texto literal. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&');
}

/** P4: lista paginada con búsqueda y filtros. */
export async function listarEstudiantes(filtros: FiltrosConsulta): Promise<PaginaEstudiantes> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => `$${parametros.push(valor)}`;

  if (filtros.q) {
    // Por palabras: cada una debe aparecer en el nombre, los apellidos o la
    // matrícula, en cualquier orden ("gomez beatriz" encuentra a "Beatriz
    // Gómez Ruiz"). Sin distinguir mayúsculas (ILIKE) ni acentos (unaccent).
    for (const palabra of filtros.q.split(/\s+/).slice(0, 5)) {
      const patron = parametro(`%${escaparLike(palabra)}%`);
      condiciones.push(`unaccent(e.nombre || ' ' || e.apellidos || ' ' || e.matricula) ILIKE unaccent(${patron})`);
    }
  }
  if (filtros.id_grupo) condiciones.push(`e.id_grupo = ${parametro(filtros.id_grupo)}`);
  if (filtros.con_credencial !== undefined) {
    condiciones.push(filtros.con_credencial ? 'c.id_credencial IS NOT NULL' : 'c.id_credencial IS NULL');
  }
  if (filtros.estado !== 'todos') condiciones.push(filtros.estado === 'activos' ? 'e.activo' : 'NOT e.activo');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const desde = `
    FROM estudiante e
    LEFT JOIN credencial_nfc c ON c.id_estudiante = e.id_estudiante AND c.activa
    ${where}`;

  const { rows: conteo } = await pool.query<{ total: string }>(`SELECT count(*) AS total ${desde}`, parametros);
  const total = Number(conteo[0]?.total ?? 0);

  const limite = parametro(filtros.por_pagina);
  const salto = parametro((filtros.pagina - 1) * filtros.por_pagina);
  const { rows } = await pool.query<FilaEstudiante>(
    `${SELECT_ESTUDIANTE}
     ${where}
     ORDER BY e.apellidos, e.nombre, e.id_estudiante
     LIMIT ${limite} OFFSET ${salto}`,
    parametros,
  );

  return {
    datos: rows.map(aEstudiantePublico),
    pagina: filtros.pagina,
    por_pagina: filtros.por_pagina,
    total,
    total_paginas: Math.ceil(total / filtros.por_pagina),
  };
}

/** Un estudiante con su credencial activa, o null si no existe. */
export async function obtenerEstudiante(
  idEstudiante: number,
  cliente: Pick<PoolClient, 'query'> = pool,
): Promise<EstudiantePublico | null> {
  const { rows } = await cliente.query<FilaEstudiante>(`${SELECT_ESTUDIANTE} WHERE e.id_estudiante = $1`, [
    idEstudiante,
  ]);
  return rows[0] ? aEstudiantePublico(rows[0]) : null;
}

/** Todas las credenciales que ha tenido el estudiante, de la más reciente a la más antigua. */
export async function historialCredenciales(idEstudiante: number): Promise<CredencialPublica[]> {
  const { rows } = await pool.query<{
    id_credencial: number;
    uid_enmascarado: string;
    activa: boolean;
    fecha_asignacion: Date;
  }>(
    `SELECT c.id_credencial, ${UID_ENMASCARADO_SQL} AS uid_enmascarado, c.activa, c.fecha_asignacion
       FROM credencial_nfc c
      WHERE c.id_estudiante = $1
      ORDER BY c.fecha_asignacion DESC, c.id_credencial DESC`,
    [idEstudiante],
  );
  return rows.map((f) => ({
    id: f.id_credencial,
    uid_enmascarado: f.uid_enmascarado,
    activa: f.activa,
    fecha_asignacion: f.fecha_asignacion.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Operaciones de escritura. Todas corren en una transacción y escriben en la
// bitácora con el mismo cliente: si la bitácora falla, el cambio se revierte.
// Los duplicados los detectan los UNIQUE de la base (no un SELECT previo, que
// tendría condición de carrera) y se traducen a 409.
// ---------------------------------------------------------------------------

/**
 * Inserta una credencial activa para el estudiante. La comparten el alta con
 * UID, la vinculación y el reemplazo (y, más adelante, el modo registro).
 * Devuelve el id de la credencial nueva.
 */
export async function insertarCredencial(cliente: PoolClient, idEstudiante: number, uid: string): Promise<number> {
  try {
    const { rows } = await cliente.query<{ id_credencial: number }>(
      `INSERT INTO credencial_nfc (uid, id_estudiante, activa)
       VALUES ($1, $2, true)
       RETURNING id_credencial`,
      [uid, idEstudiante],
    );
    return rows[0]!.id_credencial;
  } catch (error) {
    // El UID es único en toda la tabla, también entre credenciales reemplazadas o dadas de baja.
    if (esViolacionUnica(error, 'uq_credencial_nfc_uid')) throw new HttpError(409, MENSAJE_UID_ASIGNADO);
    if (esViolacionUnica(error, 'uq_credencial_nfc_estudiante_activa')) {
      throw new HttpError(409, MENSAJE_YA_TIENE_CREDENCIAL);
    }
    throw error;
  }
}

/** Alta de un estudiante (P5). Con `uid`, también vincula la credencial: todo o nada. */
export async function darDeAlta(datos: DatosAlta, idUsuario: number): Promise<EstudiantePublico> {
  return conTransaccion(async (cliente) => {
    let idEstudiante: number;
    try {
      const { rows } = await cliente.query<{ id_estudiante: number }>(
        `INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id_estudiante`,
        [datos.matricula, datos.nombre, datos.apellidos, datos.correo, datos.id_grupo],
      );
      idEstudiante = rows[0]!.id_estudiante;
    } catch (error) {
      if (esViolacionUnica(error, 'uq_estudiante_matricula')) throw new HttpError(409, MENSAJE_MATRICULA_DUPLICADA);
      if (esViolacionLlaveForanea(error, 'fk_estudiante_grupo')) {
        throw new HttpError(400, 'Datos del estudiante inválidos', { id_grupo: 'El grupo no existe' });
      }
      throw error;
    }
    await registrarEnBitacora(cliente, idUsuario, 'ALTA_ESTUDIANTE', `estudiante#${idEstudiante}`);

    if (datos.uid) {
      const idCredencial = await insertarCredencial(cliente, idEstudiante, datos.uid);
      await registrarEnBitacora(
        cliente,
        idUsuario,
        'VINCULAR_CREDENCIAL',
        `credencial_nfc#${idCredencial} → estudiante#${idEstudiante}`,
      );
    }

    return (await obtenerEstudiante(idEstudiante, cliente))!;
  });
}

export const MENSAJE_ESTUDIANTE_DE_BAJA = 'El estudiante está dado de baja';

/**
 * Bloquea la fila del estudiante hasta el final de la transacción, para que
 * dos operaciones sobre el mismo estudiante (p. ej. una baja y una
 * vinculación simultáneas) se ejecuten una después de otra.
 * Lanza 404 si no existe; devuelve si está activo.
 */
async function bloquearEstudiante(cliente: PoolClient, idEstudiante: number): Promise<{ activo: boolean }> {
  const { rows } = await cliente.query<{ activo: boolean }>(
    'SELECT activo FROM estudiante WHERE id_estudiante = $1 FOR UPDATE',
    [idEstudiante],
  );
  if (!rows[0]) throw new HttpError(404, 'El estudiante no existe');
  return rows[0];
}

/** AD-06: vincula una credencial a un estudiante activo que no tiene una activa. */
export async function vincularCredencial(
  idEstudiante: number,
  uid: string,
  idUsuario: number,
): Promise<EstudiantePublico> {
  return conTransaccion(async (cliente) => {
    const { activo } = await bloquearEstudiante(cliente, idEstudiante);
    if (!activo) throw new HttpError(409, MENSAJE_ESTUDIANTE_DE_BAJA);

    const idCredencial = await insertarCredencial(cliente, idEstudiante, uid);
    await registrarEnBitacora(
      cliente,
      idUsuario,
      'VINCULAR_CREDENCIAL',
      `credencial_nfc#${idCredencial} → estudiante#${idEstudiante}`,
    );
    return (await obtenerEstudiante(idEstudiante, cliente))!;
  });
}

/**
 * Reemplaza la credencial activa (perdida o dañada) por una nueva. La anterior
 * no se borra ni se sobrescribe: queda con activa = false en el historial y su
 * UID ya no puede volver a vincularse a nadie, ni siquiera al mismo estudiante.
 */
export async function reemplazarCredencial(
  idEstudiante: number,
  uid: string,
  idUsuario: number,
): Promise<EstudiantePublico> {
  return conTransaccion(async (cliente) => {
    const { activo } = await bloquearEstudiante(cliente, idEstudiante);
    if (!activo) throw new HttpError(409, MENSAJE_ESTUDIANTE_DE_BAJA);

    const { rows } = await cliente.query<{ id_credencial: number }>(
      `UPDATE credencial_nfc SET activa = false
        WHERE id_estudiante = $1 AND activa
        RETURNING id_credencial`,
      [idEstudiante],
    );
    const anterior = rows[0];
    if (!anterior) throw new HttpError(409, 'El estudiante no tiene una credencial activa; usa vincular');

    // Primero se desactiva la anterior: el índice único parcial solo permite una activa.
    const nueva = await insertarCredencial(cliente, idEstudiante, uid);
    await registrarEnBitacora(
      cliente,
      idUsuario,
      'REEMPLAZAR_CREDENCIAL',
      `credencial_nfc#${anterior.id_credencial} → credencial_nfc#${nueva} (estudiante#${idEstudiante})`,
    );
    return (await obtenerEstudiante(idEstudiante, cliente))!;
  });
}

/**
 * AD-07: baja lógica. En una sola transacción desactiva al estudiante y su
 * credencial activa (si tiene) y escribe en la bitácora. No borra nada: las
 * asistencias anteriores se conservan, y una lectura posterior de esa
 * credencial sale RECHAZADA (RF-04).
 */
export async function darDeBaja(idEstudiante: number, idUsuario: number): Promise<EstudiantePublico> {
  return conTransaccion(async (cliente) => {
    const { activo } = await bloquearEstudiante(cliente, idEstudiante);
    if (!activo) throw new HttpError(409, 'El estudiante ya está dado de baja');

    await cliente.query('UPDATE estudiante SET activo = false WHERE id_estudiante = $1', [idEstudiante]);
    const { rows } = await cliente.query<{ id_credencial: number }>(
      `UPDATE credencial_nfc SET activa = false
        WHERE id_estudiante = $1 AND activa
        RETURNING id_credencial`,
      [idEstudiante],
    );
    const credencial = rows[0];
    await registrarEnBitacora(
      cliente,
      idUsuario,
      'BAJA_ESTUDIANTE',
      credencial
        ? `estudiante#${idEstudiante} (credencial_nfc#${credencial.id_credencial} desactivada)`
        : `estudiante#${idEstudiante}`,
    );
    return (await obtenerEstudiante(idEstudiante, cliente))!;
  });
}
