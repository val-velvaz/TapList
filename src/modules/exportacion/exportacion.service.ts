import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { HttpError } from '../../utils/HttpError.js';
import type { FiltrosExportarAsistencias } from '../asistencias/asistencias.schemas.js';
import { listarAsistencias } from '../asistencias/asistencias.service.js';
import type { UsuarioSesion } from '../auth/auth.types.js';
import type { FiltrosEstadisticas } from '../estadisticas/estadisticas.schemas.js';
import { calcularEstadisticas, type Conteo } from '../estadisticas/estadisticas.service.js';
import { aMomentoLocal } from '../lecturas/tiempo.js';
import type { Archivo, Encabezado, Formato, Tabla } from './exportacion.tipos.js';
import { generarPdf } from './pdf.js';
import { generarXlsx } from './xlsx.js';

/*
 * Exportación de P2 y P3 (RF-06). Los datos salen de las MISMAS funciones que
 * los endpoints JSON (listarAsistencias y calcularEstadisticas), así que los
 * filtros, el aislamiento entre docentes y los totales son idénticos por
 * construcción. Nunca incluye UID (RNF-06): esas funciones no lo leen.
 */

/** 'Núñez Peña / D01' → 'Nunez-Pena-D01': solo ASCII, para nombres de archivo. */
export function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function nombreArchivo(partes: Array<string | undefined>, formato: Formato): string {
  return `${partes.filter(Boolean).join('_').slice(0, 120)}.${formato}`;
}

function textoPeriodo(desde?: string, hasta?: string): string | undefined {
  if (desde && hasta) return `${desde}_a_${hasta}`;
  if (desde) return `desde_${desde}`;
  if (hasta) return `hasta_${hasta}`;
  return undefined;
}

function generadoEl(): string {
  const ahora = aMomentoLocal(new Date(), env.ZONA_HORARIA_ESCUELA);
  return `${ahora.fecha} ${ahora.hora.slice(0, 5)} (${env.ZONA_HORARIA_ESCUELA})`;
}

async function generar(
  formato: Formato,
  encabezado: Encabezado,
  hojas: Array<{ nombre: string; tablas: Tabla[]; conEncabezado?: boolean }>,
  totales: Array<[string, number | string]>,
): Promise<Buffer> {
  if (formato === 'xlsx') {
    return generarXlsx(
      hojas.map((h, i) => ({
        nombre: h.nombre,
        encabezado: i === 0 || h.conEncabezado ? encabezado : undefined,
        tablas: h.tablas,
        totales: i === 0 ? totales : undefined,
      })),
    );
  }
  return generarPdf(encabezado, hojas.flatMap((h) => h.tablas), totales);
}

/** Nombres de los filtros elegidos (ya verificados como del docente). */
async function nombresDeFiltros(f: { id_grupo?: number; id_clase?: number; id_estudiante?: number }) {
  const { rows } = await pool.query<{ grupo: string | null; materia: string | null; estudiante: string | null; matricula: string | null }>(
    `SELECT (SELECT nombre FROM grupo WHERE id_grupo = $1) AS grupo,
            (SELECT materia FROM clase WHERE id_clase = $2) AS materia,
            (SELECT apellidos || ' ' || nombre FROM estudiante WHERE id_estudiante = $3) AS estudiante,
            (SELECT matricula FROM estudiante WHERE id_estudiante = $3) AS matricula`,
    [f.id_grupo ?? null, f.id_clase ?? null, f.id_estudiante ?? null],
  );
  return rows[0]!;
}

// ---------------------------------------------------------------------------
// Lista de asistencias (P2)
// ---------------------------------------------------------------------------
export async function exportarAsistencias(usuario: UsuarioSesion, filtros: FiltrosExportarAsistencias): Promise<Archivo> {
  const maximo = env.EXPORTACION_MAX_FILAS;
  const pagina = await listarAsistencias(usuario.id, { ...filtros, pagina: 1, por_pagina: maximo });
  if (pagina.total > maximo) {
    throw new HttpError(
      422,
      `La exportación tendría ${pagina.total} filas y el máximo es ${maximo}. Acota el periodo o los filtros.`,
    );
  }

  const nombres = await nombresDeFiltros(filtros);
  const asistencias = pagina.datos.filter((a) => a.estado === 'Asistencia').length;
  const retardos = pagina.datos.filter((a) => a.estado === 'Retardo').length;

  const encabezado: Encabezado = {
    titulo: 'Lista de asistencias',
    datos: [
      ['Docente', `${usuario.nombre} ${usuario.apellidos}`],
      ['Grupo', nombres.grupo ?? 'Todos'],
      ['Clase', nombres.materia ?? 'Todas'],
      ['Estudiante', nombres.estudiante ? `${nombres.estudiante} (${nombres.matricula})` : 'Todos'],
      ['Estado', filtros.estado ?? 'Todos'],
      ['Desde', filtros.desde ?? 'Sin límite'],
      ['Hasta', filtros.hasta ?? 'Sin límite'],
      ['Generado', generadoEl()],
    ],
  };
  const tabla: Tabla = {
    columnas: [
      { titulo: 'Fecha', ancho: 62 },
      { titulo: 'Hora', ancho: 48 },
      { titulo: 'Estado', ancho: 62 },
      { titulo: 'Matrícula', ancho: 70 },
      { titulo: 'Apellidos', ancho: 130 },
      { titulo: 'Nombre', ancho: 100 },
      { titulo: 'Grupo', ancho: 60 },
      { titulo: 'Materia', ancho: 120 },
      { titulo: 'Lector', ancho: 68 },
    ],
    filas: pagina.datos.map((a) => [
      a.fecha,
      a.hora,
      a.estado,
      a.estudiante.matricula,
      a.estudiante.apellidos,
      a.estudiante.nombre,
      a.grupo.nombre,
      a.clase.materia,
      a.dispositivo.nombre_ubicacion,
    ]),
  };
  const totales: Array<[string, number]> = [
    ['Total de registros', pagina.total],
    ['Asistencias', asistencias],
    ['Retardos', retardos],
  ];

  return {
    formato: filtros.formato,
    nombre: nombreArchivo(
      [
        'asistencias',
        nombres.grupo ? aSlug(nombres.grupo) : undefined,
        nombres.materia ? aSlug(nombres.materia) : undefined,
        nombres.matricula ? aSlug(nombres.matricula) : undefined,
        filtros.estado?.toLowerCase(),
        textoPeriodo(filtros.desde, filtros.hasta) ?? 'todo',
      ],
      filtros.formato,
    ),
    contenido: await generar(filtros.formato, encabezado, [{ nombre: 'Asistencias', tablas: [tabla] }], totales),
  };
}

// ---------------------------------------------------------------------------
// Estadísticas (P3)
// ---------------------------------------------------------------------------
const COLUMNAS_CONTEO: Tabla['columnas'] = [
  { titulo: 'Sesiones', ancho: 62, alinear: 'right' },
  { titulo: 'Esperados', ancho: 66, alinear: 'right' },
  { titulo: 'Asistencias', ancho: 72, alinear: 'right' },
  { titulo: 'Retardos', ancho: 62, alinear: 'right' },
  { titulo: 'Faltas', ancho: 56, alinear: 'right' },
  { titulo: '% asistencia', ancho: 78, alinear: 'right' },
];
const valoresConteo = (c: Conteo) => [c.sesiones, c.esperados, c.asistencias, c.retardos, c.faltas, c.porcentaje_asistencia];

export async function exportarEstadisticas(
  usuario: UsuarioSesion,
  filtros: FiltrosEstadisticas & { formato: Formato },
): Promise<Archivo> {
  const est = await calcularEstadisticas(usuario.id, filtros);

  const encabezado: Encabezado = {
    titulo: 'Estadísticas de asistencia',
    datos: [
      ['Docente', `${usuario.nombre} ${usuario.apellidos}`],
      ['Grupo', est.filtros.grupo?.nombre ?? 'Todos'],
      ['Clase', est.filtros.clase?.materia ?? 'Todas'],
      ['Periodo', `${est.periodo.desde} a ${est.periodo.hasta}`],
      ['Generado', generadoEl()],
      ['Faltas', 'Solo cuentan los días con al menos un registro, sin el día de alta ni el de baja del estudiante'],
    ],
  };

  const resumen: Tabla = {
    titulo: 'Resumen',
    columnas: [{ titulo: 'Periodo', ancho: 150 }, ...COLUMNAS_CONTEO],
    filas: [[`${est.periodo.desde} a ${est.periodo.hasta}`, ...valoresConteo(est.resumen)]],
  };
  const porClase: Tabla = {
    titulo: 'Por clase',
    columnas: [{ titulo: 'Grupo', ancho: 60 }, { titulo: 'Clase', ancho: 150 }, ...COLUMNAS_CONTEO],
    filas: est.por_clase.map((c) => [c.grupo.nombre, c.clase.materia, ...valoresConteo(c)]),
  };
  const porSemana: Tabla = {
    titulo: 'Por semana',
    columnas: [{ titulo: 'Semana (lunes)', ancho: 90 }, ...COLUMNAS_CONTEO],
    filas: est.por_semana.map((s) => [s.semana, ...valoresConteo(s)]),
  };
  const masFaltas: Tabla = {
    titulo: 'Estudiantes con más faltas',
    columnas: [
      { titulo: 'Matrícula', ancho: 70 },
      { titulo: 'Apellidos', ancho: 130 },
      { titulo: 'Nombre', ancho: 100 },
      { titulo: 'Esperados', ancho: 66, alinear: 'right' },
      { titulo: 'Asistencias', ancho: 72, alinear: 'right' },
      { titulo: 'Retardos', ancho: 62, alinear: 'right' },
      { titulo: 'Faltas', ancho: 56, alinear: 'right' },
      { titulo: '% asistencia', ancho: 78, alinear: 'right' },
    ],
    filas: est.estudiantes_con_mas_faltas.map((e) => [
      e.estudiante.matricula,
      e.estudiante.apellidos,
      e.estudiante.nombre,
      e.esperados,
      e.asistencias,
      e.retardos,
      e.faltas,
      e.porcentaje_asistencia,
    ]),
  };
  const totales: Array<[string, number | string]> = [
    ['Sesiones', est.resumen.sesiones],
    ['Esperados', est.resumen.esperados],
    ['Asistencias', est.resumen.asistencias],
    ['Retardos', est.resumen.retardos],
    ['Faltas', est.resumen.faltas],
    ['% asistencia', est.resumen.porcentaje_asistencia ?? '—'],
  ];

  return {
    formato: filtros.formato,
    nombre: nombreArchivo(
      [
        'estadisticas',
        est.filtros.grupo ? aSlug(est.filtros.grupo.nombre) : undefined,
        est.filtros.clase ? aSlug(est.filtros.clase.materia) : undefined,
        textoPeriodo(est.periodo.desde, est.periodo.hasta),
      ],
      filtros.formato,
    ),
    contenido: await generar(
      filtros.formato,
      encabezado,
      [
        { nombre: 'Resumen', tablas: [resumen, porClase] },
        { nombre: 'Por semana', tablas: [porSemana] },
        { nombre: 'Más faltas', tablas: [masFaltas] },
      ],
      totales,
    ),
  };
}
