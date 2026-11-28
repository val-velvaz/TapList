/*
 * Herramientas SOLO DE DESARROLLO para probar un lector ESP32 real contra la
 * API que corre en una computadora del equipo (ver docs/prueba-con-dispositivo.md).
 * Las usan los scripts `npm run dev:clase-ahora` y `npm run dev:vincular`.
 * Ninguna ruta de la API las expone, y todas se niegan a correr en producción.
 */
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';
import { conTransaccion } from '../db/transaccion.js';
import { reemplazarCredencial, vincularCredencial } from '../modules/estudiantes/estudiantes.service.js';
import { aMomentoLocal, horaAMinutos } from '../modules/lecturas/tiempo.js';
import { HttpError } from '../utils/HttpError.js';
import { analizarUid, enmascararUid, normalizarUid, type AnalisisUid } from '../utils/uid.js';

export const MATERIA_PRUEBA = 'Clase de prueba (dispositivo)';
export const GRUPO_PRUEBA = 'D01';
export const DOCENTE_PRUEBA = 'roberto.gomez@academicos.udg.mx';
const TOLERANCIA_PRUEBA = 10;
const MINUTOS_POR_DIA = 24 * 60;

/** Error con un mensaje para mostrar tal cual en la terminal. */
export class ErrorDesarrollo extends Error {}

/** Las herramientas de prueba nunca corren con NODE_ENV=production. */
export function exigirDesarrollo(nodeEnv: string = env.NODE_ENV): void {
  if (nodeEnv === 'production') {
    throw new ErrorDesarrollo('Esta herramienta es solo para desarrollo: se niega a correr con NODE_ENV=production.');
  }
}

/** Minutos desde la medianoche → 'HH:MM' (con vuelta al día siguiente). */
function aHora(minutos: number): string {
  const m = ((minutos % MINUTOS_POR_DIA) + MINUTOS_POR_DIA) % MINUTOS_POR_DIA;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

async function idGrupo(nombre: string): Promise<number> {
  const { rows } = await pool.query<{ id_grupo: number }>(
    'SELECT id_grupo FROM grupo WHERE nombre = $1 ORDER BY id_grupo DESC LIMIT 1',
    [nombre],
  );
  if (!rows[0]) throw new ErrorDesarrollo(`No existe el grupo ${nombre}. ¿Cargaste la semilla con npm run db:setup?`);
  return rows[0].id_grupo;
}

async function idDocente(correo: string): Promise<number> {
  const { rows } = await pool.query<{ id_usuario: number }>(
    `SELECT id_usuario FROM usuario WHERE correo = $1 AND rol = 'Docente' AND activo`,
    [correo],
  );
  if (!rows[0]) throw new ErrorDesarrollo(`No existe el docente ${correo}. ¿Cargaste la semilla con npm run db:setup?`);
  return rows[0].id_usuario;
}

export interface ClaseDePrueba {
  idClase: number;
  /** 'YYYY-MM-DD' y 'HH:MM', en la zona de la escuela. */
  fecha: string;
  horaInicio: string;
  /** Desde cuándo se aceptan lecturas, último minuto de Asistencia, primero de Retardo y último minuto de la ventana. */
  abre: string;
  asistenciaHasta: string;
  retardoDesde: string;
  cierra: string;
  /** Lecturas anteriores de la clase de prueba que se borraron para empezar de cero. */
  lecturasBorradas: number;
  /** Otras clases del grupo cuya ventana se cruza con la de prueba (la lectura podría irse a ellas). */
  choques: string[];
}

/**
 * Crea (o mueve, si ya existe) la clase de prueba del grupo D01 para que
 * empiece dentro de `minutos`, hoy, y borra sus lecturas anteriores. Así, las
 * lecturas desde ahora dan Asistencia; después de la tolerancia, Retardo; y
 * quien no registra aparece como Pendiente en la web.
 */
export async function prepararClaseAhora(opciones: { ahora?: Date; minutos?: number } = {}): Promise<ClaseDePrueba> {
  exigirDesarrollo();
  const ahora = opciones.ahora ?? new Date();
  const minutos = opciones.minutos ?? 5;
  if (!Number.isInteger(minutos) || minutos < 0 || minutos > 60) {
    throw new ErrorDesarrollo('--minutos debe ser un entero de 0 a 60.');
  }

  // Al minuto: los segundos de una lectura se truncan.
  const inicio = aMomentoLocal(new Date(ahora.getTime() + minutos * 60_000), env.ZONA_HORARIA_ESCUELA);
  const horaInicio = inicio.hora.slice(0, 5);
  const grupo = await idGrupo(GRUPO_PRUEBA);
  const docente = await idDocente(DOCENTE_PRUEBA);

  const { idClase, lecturasBorradas } = await conTransaccion(async (cliente) => {
    const { rows } = await cliente.query<{ id_clase: number }>(
      'SELECT id_clase FROM clase WHERE id_grupo = $1 AND id_docente = $2 AND materia = $3 FOR UPDATE',
      [grupo, docente, MATERIA_PRUEBA],
    );
    if (!rows[0]) {
      const { rows: nueva } = await cliente.query<{ id_clase: number }>(
        `INSERT INTO clase (id_grupo, id_docente, materia, dia_semana, hora_inicio, tolerancia_min)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_clase`,
        [grupo, docente, MATERIA_PRUEBA, inicio.diaSemana, horaInicio, TOLERANCIA_PRUEBA],
      );
      return { idClase: nueva[0]!.id_clase, lecturasBorradas: 0 };
    }
    const id = rows[0].id_clase;
    const { rowCount } = await cliente.query('DELETE FROM asistencia WHERE id_clase = $1', [id]);
    await cliente.query('UPDATE clase SET dia_semana = $2, hora_inicio = $3, tolerancia_min = $4 WHERE id_clase = $1', [
      id,
      inicio.diaSemana,
      horaInicio,
      TOLERANCIA_PRUEBA,
    ]);
    return { idClase: id, lecturasBorradas: rowCount ?? 0 };
  });

  // Ventana de la clase de prueba, en minutos desde la medianoche del día de inicio.
  const minutoInicio = horaAMinutos(horaInicio);
  const abre = minutoInicio - env.MINUTOS_ANTES_CLASE;
  const cierra = minutoInicio + Math.max(env.MINUTOS_MAX_REGISTRO, TOLERANCIA_PRUEBA);

  const { rows: otras } = await pool.query<{ materia: string; dia_semana: number; hora_inicio: string; tolerancia_min: number }>(
    `SELECT materia, dia_semana, to_char(hora_inicio, 'HH24:MI') AS hora_inicio, tolerancia_min
       FROM clase WHERE id_grupo = $1 AND id_clase <> $2`,
    [grupo, idClase],
  );
  const choques = otras
    .filter((c) => c.dia_semana === inicio.diaSemana)
    .filter((c) => {
      const suInicio = horaAMinutos(c.hora_inicio);
      const suAbre = suInicio - env.MINUTOS_ANTES_CLASE;
      const suCierra = suInicio + Math.max(env.MINUTOS_MAX_REGISTRO, c.tolerancia_min);
      return suAbre <= cierra && abre <= suCierra;
    })
    .map((c) => `${c.materia} (${c.hora_inicio})`);

  return {
    idClase,
    fecha: inicio.fecha,
    horaInicio,
    abre: aHora(abre),
    asistenciaHasta: aHora(minutoInicio + TOLERANCIA_PRUEBA),
    retardoDesde: aHora(minutoInicio + TOLERANCIA_PRUEBA + 1),
    cierra: aHora(cierra),
    lecturasBorradas,
    choques,
  };
}

export interface EstudianteDePrueba {
  matricula: string;
  nombre: string;
  /** Enmascarado (RNF-06), o null si no tiene credencial activa. */
  uid: string | null;
}

/** Los estudiantes activos del grupo de prueba, con su UID enmascarado. */
export async function estudiantesDePrueba(): Promise<EstudianteDePrueba[]> {
  exigirDesarrollo();
  const { rows } = await pool.query<{ matricula: string; nombre: string; uid: string | null }>(
    `SELECT e.matricula, e.nombre || ' ' || e.apellidos AS nombre, c.uid
       FROM estudiante e
       JOIN grupo g ON g.id_grupo = e.id_grupo
       LEFT JOIN credencial_nfc c ON c.id_estudiante = e.id_estudiante AND c.activa
      WHERE g.nombre = $1 AND e.activo
      ORDER BY e.matricula`,
    [GRUPO_PRUEBA],
  );
  return rows.map((r) => ({ ...r, uid: r.uid ? enmascararUid(r.uid) : null }));
}

export interface ResultadoVinculo {
  accion: 'vinculada' | 'reemplazada' | 'sin_cambios';
  estudiante: string;
  /** El UID enmascarado que quedó vinculado. */
  uid: string;
  analisis: AnalisisUid;
}

/**
 * Vincula la tarjeta real `uid` al estudiante de prueba `matricula`, después
 * de revisar su formato como `npm run uid:revisar`. Si el estudiante ya tiene
 * otra credencial, la reemplaza (la anterior queda en el historial). Queda en
 * la bitácora a nombre del Administrador de la semilla, como si se hubiera
 * hecho desde P4.
 *
 * Un valor inválido se rechaza siempre. Uno válido pero con avisos (p. ej.,
 * solo dígitos: ¿decimal?) se rechaza salvo con `forzar`.
 */
export async function vincularTarjetaDePrueba(datos: { uid: string; matricula: string; forzar?: boolean }): Promise<ResultadoVinculo> {
  exigirDesarrollo();
  const analisis = analizarUid(datos.uid);
  if (!analisis.valido) {
    throw new ErrorDesarrollo(`El UID no tiene un formato válido:\n  - ${analisis.problemas.join('\n  - ')}`);
  }
  if (analisis.avisos.length && !datos.forzar) {
    throw new ErrorDesarrollo(
      `El UID es válido, pero hay avisos:\n  - ${analisis.avisos.join('\n  - ')}\n` +
        'Revísalo con npm run uid:revisar. Si estás segura de que es correcto, repite el comando con --forzar.',
    );
  }
  const uid = normalizarUid(datos.uid);

  const { rows: estudiantes } = await pool.query<{ id_estudiante: number; nombre: string; activo: boolean; uid_activo: string | null }>(
    `SELECT e.id_estudiante, e.nombre || ' ' || e.apellidos AS nombre, e.activo, c.uid AS uid_activo
       FROM estudiante e
       LEFT JOIN credencial_nfc c ON c.id_estudiante = e.id_estudiante AND c.activa
      WHERE e.matricula = $1`,
    [datos.matricula],
  );
  const estudiante = estudiantes[0];
  if (!estudiante) throw new ErrorDesarrollo(`No existe un estudiante con la matrícula ${datos.matricula}.`);
  if (!estudiante.activo) throw new ErrorDesarrollo(`${estudiante.nombre} está dado de baja.`);
  if (estudiante.uid_activo === uid) {
    return { accion: 'sin_cambios', estudiante: estudiante.nombre, uid: enmascararUid(uid), analisis };
  }

  const { rows: admins } = await pool.query<{ id_usuario: number }>(
    `SELECT id_usuario FROM usuario WHERE rol = 'Administrador' AND activo ORDER BY id_usuario LIMIT 1`,
  );
  if (!admins[0]) throw new ErrorDesarrollo('No hay un Administrador activo para la bitácora. ¿Cargaste la semilla?');

  try {
    if (estudiante.uid_activo) await reemplazarCredencial(estudiante.id_estudiante, uid, admins[0].id_usuario);
    else await vincularCredencial(estudiante.id_estudiante, uid, admins[0].id_usuario);
  } catch (error) {
    // p. ej. 409: el UID ya está asignado a otro estudiante (también si fue de alguien antes).
    if (error instanceof HttpError) throw new ErrorDesarrollo(`No se pudo vincular: ${error.message}.`);
    throw error;
  }
  return {
    accion: estudiante.uid_activo ? 'reemplazada' : 'vinculada',
    estudiante: estudiante.nombre,
    uid: enmascararUid(uid),
    analisis,
  };
}
