import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { extractText } from 'unpdf';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import { hashearContrasena } from '../src/utils/contrasena.js';
import { ID_DISPOSITIVO } from './datos.js';

/*
 * =============================================================================
 * Faltas y pendientes con el reloj fijo (MINUTOS_MAX_REGISTRO = 60)
 * =============================================================================
 * Docente P, grupo GP, inscritos desde el 1 de septiembre:
 *   S1 Núñez Peña Ana · S2 Álvarez Ruiz Bruno · S3 Ochoa Luna Carla · S4 Zamora Díaz Diego
 *
 * Clases de P:
 *   CP  lunes 08:00, tolerancia 10   → la ventana de registro cierra a las 09:00
 *   CL  lunes 23:30, tolerancia 10   → cierra a las 00:30 del martes
 *   CT  martes 10:00, tolerancia 75  → cierra a las 11:15 (la tolerancia es mayor que 60)
 * El docente Q imparte CQ al mismo grupo: no debe ver nada de P.
 *
 * Lunes 9 de noviembre, CP: solo S1 registró → S2, S3 y S4 tienen Falta.
 * Lunes 16 de noviembre, CP, con el reloj avanzando:
 *   07:40  nadie ha registrado: todavía no hay sesión ese día.
 *   07:56  S1 registra (07:55, Asistencia) → S2, S3 y S4 Pendiente.
 *   08:30  S2 registra (08:20, Retardo)    → S3 y S4 Pendiente.
 *   09:00:59 el último minuto de la ventana: siguen Pendiente.
 *   09:01  la ventana cerró                 → S3 y S4 Falta.
 * En cada momento, P2, P3 y las exportaciones deben dar los mismos totales.
 * =============================================================================
 */

const app = crearApp();
const sufijo = randomBytes(3).toString('hex');
const CONTRASENA = `Docente#${sufijo}`;
const ids = {} as Record<string, number>;
const cookies = {} as Record<'P' | 'Q', string>;

const ESTUDIANTES: Array<[string, string, string]> = [
  ['S1', 'Ana', 'Núñez Peña'],
  ['S2', 'Bruno', 'Álvarez Ruiz'],
  ['S3', 'Carla', 'Ochoa Luna'],
  ['S4', 'Diego', 'Zamora Díaz'],
];

async function uno<T extends Record<string, unknown>>(sql: string, valores: unknown[]): Promise<T> {
  return (await pool.query<T>(sql, valores)).rows[0]!;
}

async function iniciarSesion(correo: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ correo, contrasena: CONTRASENA });
  expect(res.status).toBe(200);
  return res.headers['set-cookie']![0]!.split(';')[0]!;
}

async function registrar(estudiante: string, clase: string, fecha: string, hora: string, estado: 'Asistencia' | 'Retardo') {
  await pool.query(
    `INSERT INTO asistencia (id_estudiante, id_clase, id_dispositivo, fecha, hora, estado)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [ids[estudiante], ids[clase], ID_DISPOSITIVO, fecha, hora, estado],
  );
}

/**
 * Fija el reloj de la API en una hora local de la escuela (UTC−6 en noviembre)
 * y vuelve a iniciar sesión, porque el JWT vence a las 8 horas del reloj fijo.
 */
async function fijarReloj(local: string): Promise<void> {
  vi.setSystemTime(new Date(`${local}-06:00`));
  if (ids.docenteP) {
    cookies.P = await iniciarSesion(`faltas.p.${sufijo}@academicos.udg.mx`);
    cookies.Q = await iniciarSesion(`faltas.q.${sufijo}@academicos.udg.mx`);
  }
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  await fijarReloj('2026-11-16T07:00:00');

  for (const d of ['P', 'Q']) {
    ids[`docente${d}`] = (
      await uno<{ id_usuario: number }>(
        `INSERT INTO usuario (nombre, apellidos, correo, contrasena_hash, rol)
         VALUES ($1, 'Faltas', $2, $3, 'Docente') RETURNING id_usuario`,
        [`Docente ${d}`, `faltas.${d.toLowerCase()}.${sufijo}@academicos.udg.mx`, await hashearContrasena(CONTRASENA)],
      )
    ).id_usuario;
  }
  ids.GP = (
    await uno<{ id_grupo: number }>(
      `INSERT INTO grupo (nombre, nivel_grado, ciclo_escolar) VALUES ($1, 'Pruebas', '2026-B') RETURNING id_grupo`,
      [`GP-${sufijo}`],
    )
  ).id_grupo;

  const clases: Array<[string, string, number, string, number]> = [
    ['CP', 'docenteP', 1, '08:00', 10],
    ['CL', 'docenteP', 1, '23:30', 10],
    ['CT', 'docenteP', 2, '10:00', 75],
    ['CQ', 'docenteQ', 1, '08:00', 10],
  ];
  for (const [clave, docente, dia, hora, tolerancia] of clases) {
    ids[clave] = (
      await uno<{ id_clase: number }>(
        `INSERT INTO clase (id_grupo, id_docente, materia, dia_semana, hora_inicio, tolerancia_min)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_clase`,
        [ids.GP, ids[docente], `Materia ${clave}`, dia, hora, tolerancia],
      )
    ).id_clase;
  }

  for (const [clave, nombre, apellidos] of ESTUDIANTES) {
    ids[clave] = (
      await uno<{ id_estudiante: number }>(
        `INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo)
         VALUES ($1, $2, $3, $4, $5) RETURNING id_estudiante`,
        [`F${clave}${sufijo}`.toUpperCase(), nombre, apellidos, `f${clave.toLowerCase()}.${sufijo}@alumnos.udg.mx`, ids.GP],
      )
    ).id_estudiante;
  }
  // El trigger los inscribió con la fecha real de hoy; el escenario empieza en septiembre.
  await pool.query(`UPDATE inscripcion_grupo SET desde = '2026-09-01' WHERE id_grupo = $1`, [ids.GP]);

  await registrar('S1', 'CP', '2026-11-09', '07:58', 'Asistencia');
  // Q también tuvo clase con el grupo: sus registros no deben aparecer para P.
  await registrar('S3', 'CQ', '2026-11-09', '08:01', 'Asistencia');

  cookies.P = await iniciarSesion(`faltas.p.${sufijo}@academicos.udg.mx`);
  cookies.Q = await iniciarSesion(`faltas.q.${sufijo}@academicos.udg.mx`);
});

afterAll(async () => {
  vi.useRealTimers();
  await cerrarPool();
});

type Fila = {
  id: number | null;
  fecha: string;
  hora: string | null;
  estado: string;
  estudiante: { id: number; apellidos: string };
  clase: { id: number };
  dispositivo: unknown;
};

async function listaP2(cookie: string, query: Record<string, string | number>): Promise<Fila[]> {
  const res = await request(app).get('/api/asistencias').set('Cookie', cookie).query({ por_pagina: 100, ...query });
  expect(res.status).toBe(200);
  expect(res.body.total).toBe(res.body.datos.length);
  return res.body.datos;
}

const estadisticas = (query: Record<string, string | number>) =>
  request(app).get('/api/estadisticas').set('Cookie', cookies.P).query(query);

/** [clave del estudiante, estado] de cada fila, en el orden de la lista. */
const comoClaves = (filas: Fila[]) =>
  filas.map((f) => [ESTUDIANTES.find(([c]) => ids[c] === f.estudiante.id)?.[0], f.estado]);

const cuenta = (filas: Fila[], estado: string) => filas.filter((f) => f.estado === estado).length;

function binario(res: NodeJS.ReadableStream, fin: (error: Error | null, cuerpo: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => fin(null, Buffer.concat(partes)));
}
const descargar = (ruta: string, query: Record<string, string | number>) =>
  request(app).get(ruta).set('Cookie', cookies.P).query(query).buffer(true).parse(binario as never);

async function filasXlsx(contenido: Buffer, hoja: string): Promise<unknown[][]> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido as unknown as ArrayBuffer);
  const filas: unknown[][] = [];
  libro.getWorksheet(hoja)!.eachRow((f) => filas.push((f.values as unknown[]).slice(1)));
  return filas;
}
const valorDe = (filas: unknown[][], etiqueta: string) => filas.find((f) => f[0] === etiqueta)?.[1];

/**
 * Comprueba que P2, P3 y las cuatro exportaciones den los mismos totales en
 * el periodo, y devuelve los totales para que cada prueba los compare.
 */
async function totalesCoinciden(periodo: { desde: string; hasta: string }) {
  const filas = await listaP2(cookies.P, periodo);
  const p2 = {
    asistencias: cuenta(filas, 'Asistencia'),
    retardos: cuenta(filas, 'Retardo'),
    faltas: cuenta(filas, 'Falta'),
    pendientes: cuenta(filas, 'Pendiente'),
  };
  const sesiones = new Set(filas.map((f) => `${f.clase.id}|${f.fecha}`)).size;

  const p3 = (await estadisticas(periodo).expect(200)).body;
  expect(p3.resumen).toMatchObject({ ...p2, sesiones, esperados: p2.asistencias + p2.retardos + p2.faltas });

  // Exportación de P2: mismos totales.
  const xlsxP2 = await filasXlsx((await descargar('/api/asistencias/exportar', { ...periodo, formato: 'xlsx' })).body, 'Asistencias');
  expect([
    valorDe(xlsxP2, 'Total de registros'),
    valorDe(xlsxP2, 'Asistencias'),
    valorDe(xlsxP2, 'Retardos'),
    valorDe(xlsxP2, 'Faltas'),
    valorDe(xlsxP2, 'Pendientes'),
  ]).toEqual([filas.length, p2.asistencias, p2.retardos, p2.faltas, p2.pendientes]);
  const pdfP2 = (await extractText(new Uint8Array((await descargar('/api/asistencias/exportar', { ...periodo, formato: 'pdf' })).body), { mergePages: true })).text;
  expect(pdfP2).toContain(`Faltas: ${p2.faltas}`);
  expect(pdfP2).toContain(`Pendientes: ${p2.pendientes}`);

  // Exportación de P3: mismos totales.
  const xlsxP3 = await filasXlsx((await descargar('/api/estadisticas/exportar', { ...periodo, formato: 'xlsx' })).body, 'Resumen');
  expect([valorDe(xlsxP3, 'Faltas'), valorDe(xlsxP3, 'Pendientes'), valorDe(xlsxP3, 'Esperados')]).toEqual([
    p3.resumen.faltas,
    p3.resumen.pendientes,
    p3.resumen.esperados,
  ]);
  const pdfP3 = (await extractText(new Uint8Array((await descargar('/api/estadisticas/exportar', { ...periodo, formato: 'pdf' })).body), { mergePages: true })).text;
  expect(pdfP3).toContain(`Faltas: ${p3.resumen.faltas}`);
  expect(pdfP3).toContain(`Pendientes: ${p3.resumen.pendientes}`);

  return { filas, resumen: p3.resumen, estudiantes: p3.estudiantes_con_mas_faltas as Array<{ estudiante: { id: number }; faltas: number; pendientes: number }> };
}

const HOY = { desde: '2026-11-16', hasta: '2026-11-16' };
const NOVIEMBRE = { desde: '2026-11-01', hasta: '2026-11-30' };

describe('Faltas y pendientes con el reloj fijo', () => {
  it('07:40, antes de la ventana: hoy todavía no hay sesión; la del día 9 ya tiene faltas', async () => {
    await fijarReloj('2026-11-16T07:40:00');
    expect(await listaP2(cookies.P, HOY)).toEqual([]);
    expect((await estadisticas(HOY).expect(200)).body.resumen).toMatchObject({ sesiones: 0, faltas: 0, pendientes: 0 });

    const { filas, resumen } = await totalesCoinciden(NOVIEMBRE);
    expect(comoClaves(filas)).toEqual([
      ['S1', 'Asistencia'],
      ['S2', 'Falta'], // Álvarez
      ['S3', 'Falta'], // Ochoa
      ['S4', 'Falta'], // Zamora
    ]);
    expect(resumen).toMatchObject({ sesiones: 1, esperados: 4, asistencias: 1, faltas: 3, pendientes: 0, porcentaje_asistencia: 25 });
  });

  it('07:56, con la ventana abierta: quien no ha registrado aparece como Pendiente, sin hora ni lector', async () => {
    await registrar('S1', 'CP', '2026-11-16', '07:55', 'Asistencia');
    await fijarReloj('2026-11-16T07:56:00');

    const filas = await listaP2(cookies.P, HOY);
    expect(comoClaves(filas)).toEqual([
      ['S1', 'Asistencia'],
      ['S2', 'Pendiente'],
      ['S3', 'Pendiente'],
      ['S4', 'Pendiente'],
    ]);
    const pendiente = filas[1]!;
    expect(pendiente).toMatchObject({ id: null, hora: null, dispositivo: null, fecha: '2026-11-16', clase: { id: ids.CP } });
    expect(filas[0]).toMatchObject({ hora: '07:55:00', dispositivo: { id: ID_DISPOSITIVO } });
    expect(Object.keys(pendiente).sort()).toEqual(Object.keys(filas[0]!).sort());

    const { resumen } = await totalesCoinciden(HOY);
    // Un pendiente no es falta ni cuenta en el porcentaje.
    expect(resumen).toMatchObject({ sesiones: 1, esperados: 1, asistencias: 1, faltas: 0, pendientes: 3, porcentaje_asistencia: 100 });
  });

  it('08:30: las lecturas van primero, de la más reciente a la más antigua, y luego los pendientes por apellidos', async () => {
    await registrar('S2', 'CP', '2026-11-16', '08:20', 'Retardo');
    await fijarReloj('2026-11-16T08:30:00');

    const { filas, resumen, estudiantes } = await totalesCoinciden(NOVIEMBRE);
    expect(comoClaves(filas)).toEqual([
      ['S2', 'Retardo'],
      ['S1', 'Asistencia'],
      ['S3', 'Pendiente'],
      ['S4', 'Pendiente'],
      ['S1', 'Asistencia'],
      ['S2', 'Falta'],
      ['S3', 'Falta'],
      ['S4', 'Falta'],
    ]);
    expect(resumen).toMatchObject({ sesiones: 2, esperados: 6, asistencias: 2, retardos: 1, faltas: 3, pendientes: 2, porcentaje_asistencia: 50 });
    // «Más faltas» solo cuenta la falta del día 9; lo de hoy sigue pendiente.
    // Con una falta cada uno, Álvarez va primero por su retardo (regla de desempate de P3).
    expect(estudiantes.map((e) => [e.estudiante.id, e.faltas, e.pendientes])).toEqual([
      [ids.S2, 1, 0],
      [ids.S3, 1, 1],
      [ids.S4, 1, 1],
    ]);
  });

  it('09:00:59, el último minuto de la ventana: siguen pendientes', async () => {
    await fijarReloj('2026-11-16T09:00:59');
    const { resumen } = await totalesCoinciden(HOY);
    expect(resumen).toMatchObject({ faltas: 0, pendientes: 2 });
  });

  it('09:01, la ventana cerró: los pendientes pasan a Falta en P2, P3 y las exportaciones', async () => {
    await fijarReloj('2026-11-16T09:01:00');
    const hoy = await totalesCoinciden(HOY);
    expect(comoClaves(hoy.filas)).toEqual([
      ['S2', 'Retardo'],
      ['S1', 'Asistencia'],
      ['S3', 'Falta'],
      ['S4', 'Falta'],
    ]);
    expect(hoy.resumen).toMatchObject({ esperados: 4, faltas: 2, pendientes: 0, porcentaje_asistencia: 50 });

    const mes = await totalesCoinciden(NOVIEMBRE);
    expect(mes.resumen).toMatchObject({ esperados: 8, asistencias: 2, retardos: 1, faltas: 5, pendientes: 0, porcentaje_asistencia: 37.5 });
    expect(mes.estudiantes.map((e) => [e.estudiante.id, e.faltas])).toEqual([
      [ids.S3, 2], // Ochoa antes que Zamora: mismo número de faltas y de retardos
      [ids.S4, 2],
      [ids.S2, 1],
    ]);
  });

  it('una clase que cruza la medianoche sigue pendiente hasta que cierra su ventana, al día siguiente', async () => {
    await registrar('S4', 'CL', '2026-11-16', '23:25', 'Asistencia');
    const clase = { ...HOY, id_clase: ids.CL! };

    await fijarReloj('2026-11-17T00:30:00');
    expect(cuenta(await listaP2(cookies.P, clase), 'Pendiente')).toBe(3);
    expect((await estadisticas(clase).expect(200)).body.resumen).toMatchObject({ faltas: 0, pendientes: 3 });

    await fijarReloj('2026-11-17T00:31:00');
    expect(cuenta(await listaP2(cookies.P, clase), 'Falta')).toBe(3);
    expect((await estadisticas(clase).expect(200)).body.resumen).toMatchObject({ faltas: 3, pendientes: 0 });
  });

  it('si la tolerancia es mayor que MINUTOS_MAX_REGISTRO, la ventana dura lo que la tolerancia', async () => {
    await registrar('S1', 'CT', '2026-11-17', '10:05', 'Asistencia');
    const martes = { desde: '2026-11-17', hasta: '2026-11-17' };

    await fijarReloj('2026-11-17T11:15:00'); // 10:00 + 75 min: última lectura aceptada
    expect((await totalesCoinciden(martes)).resumen).toMatchObject({ faltas: 0, pendientes: 3 });

    await fijarReloj('2026-11-17T11:16:00');
    expect((await totalesCoinciden(martes)).resumen).toMatchObject({ faltas: 3, pendientes: 0 });
  });

  it('el filtro de estado acepta Falta y Pendiente', async () => {
    await fijarReloj('2026-11-17T11:10:00'); // CT abierta; lo demás, cerrado
    const faltas = await listaP2(cookies.P, { ...NOVIEMBRE, estado: 'Falta' });
    const pendientes = await listaP2(cookies.P, { ...NOVIEMBRE, estado: 'Pendiente' });
    expect(faltas.every((f) => f.estado === 'Falta')).toBe(true);
    expect(pendientes.map((f) => [f.clase.id, f.estado])).toEqual(Array(3).fill([ids.CT, 'Pendiente']));
    // Día 9: 3 · día 16 CP: 2 · día 16 CL: 3
    expect(faltas).toHaveLength(8);
  });

  it('el docente Q no ve los registros ni las faltas de las clases de P, aunque sea el mismo grupo', async () => {
    const filas = await listaP2(cookies.Q, NOVIEMBRE);
    expect(new Set(filas.map((f) => f.clase.id))).toEqual(new Set([ids.CQ]));
    // Su única sesión: CQ del día 9, donde solo registró Ochoa. Las faltas van por apellidos.
    expect(comoClaves(filas)).toEqual([
      ['S3', 'Asistencia'],
      ['S2', 'Falta'], // Álvarez
      ['S1', 'Falta'], // Núñez
      ['S4', 'Falta'], // Zamora
    ]);
  });
});

describe('Búsqueda de estudiante en P2 (q)', () => {
  const buscar = (cookie: string, q: string, extra: Record<string, string | number> = {}) =>
    listaP2(cookie, { ...NOVIEMBRE, q, ...extra });
  const estudiantesDe = (filas: Fila[]) => [...new Set(filas.map((f) => f.estudiante.id))];

  it('sin distinguir acentos ni mayúsculas, por palabras en cualquier orden', async () => {
    await fijarReloj('2026-11-18T12:00:00');
    for (const q of ['nunez', 'NÚÑEZ', 'peña ana', 'ana nunez', '  nuñez  ']) {
      expect(estudiantesDe(await buscar(cookies.P, q)), q).toEqual([ids.S1]);
    }
    expect(estudiantesDe(await buscar(cookies.P, 'alvarez'))).toEqual([ids.S2]);
  });

  it('por parte de la matrícula', async () => {
    const matricula = `FS3${sufijo}`.toUpperCase();
    expect(estudiantesDe(await buscar(cookies.P, matricula.slice(1).toLowerCase()))).toEqual([ids.S3]);
  });

  it('incluye las filas de Falta y se combina con el filtro de estado', async () => {
    const ochoa = await buscar(cookies.P, 'ochoa');
    expect(ochoa.map((f) => f.estado).sort()).toEqual(['Falta', 'Falta', 'Falta', 'Falta']);
    expect(await buscar(cookies.P, 'ochoa', { estado: 'Asistencia' })).toEqual([]);
  });

  it('los comodines % y _ se buscan como texto, y lo que no coincide da una lista vacía', async () => {
    expect(await buscar(cookies.P, '%')).toEqual([]);
    expect(await buscar(cookies.P, '_')).toEqual([]);
    expect(await buscar(cookies.P, 'inexistente')).toEqual([]);
  });

  it('solo busca dentro de las clases del docente: Q no encuentra lo de P', async () => {
    // Núñez (S1) está en el grupo de Q, pero solo tiene registros en las clases de P y una falta en CQ.
    const deQ = await buscar(cookies.Q, 'nunez');
    expect(deQ.every((f) => f.clase.id === ids.CQ)).toBe(true);
    expect(deQ.map((f) => f.estado)).toEqual(['Falta']);
  });

  it('valida q: máximo 100 caracteres', async () => {
    const res = await request(app).get('/api/asistencias').set('Cookie', cookies.P).query({ q: 'a'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.detalles).toEqual({ q: 'q es demasiado largo' });
  });
});
