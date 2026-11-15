import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { extractText } from 'unpdf';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import { aMomentoLocal } from '../src/modules/lecturas/tiempo.js';
import { hashearContrasena } from '../src/utils/contrasena.js';
import { CONTRASENA_ADMIN, CORREO_ADMIN, ID_DISPOSITIVO } from './datos.js';

/*
 * =============================================================================
 * Datos fijos (octubre de 2026) y resultados calculados A MANO
 * =============================================================================
 * Docente E imparte:  C1 (grupo G1, lunes)   C2 (G1, miércoles)   C3 (G2, martes)
 * Docente F imparte:  F1 (G1, jueves)        F2 (G3, viernes, sin datos)
 *
 * Inscripciones (desde / hasta; ni el día de alta ni el de baja generan falta):
 *   S1 Alfa    G1 desde 09-01
 *   S2 Bravo   G1 desde 09-01
 *   S3 Charlie G1 09-01 → 10-14 (baja el miércoles 14)
 *   S4 Delta   G1 desde 10-12 (alta el lunes 12)
 *   S5 Eco     G1 09-01 → 10-19, luego G2 desde 10-19 (cambio de grupo)
 *   S6 Foxtrot G2 desde 09-01
 *   S7 Golf    G1 desde 10-26 (alta el lunes 26 y NO registra ese día)
 *   S8 Hotel   G1 09-01 → 10-07 (baja el miércoles 7 y NO registra ese día)
 *
 * Registros (A = Asistencia, R = Retardo). El lunes 19 nadie registró en C1
 * (festivo): no cuenta como sesión. Los miércoles 21 y 28, tampoco.
 *   C1 10-05: S1 A, S2 R, S3 A, S5 A, S8 A  esperados S1 S2 S3 S5 S8   → 0 faltas
 *   C1 10-12: S1 A, S4 A               esperados S1 S2 S3 S5 + S4 (registró) → faltan S2 S3 S5
 *   C1 10-26: S1 R, S2 A               esperados S1 S2 S4 (S7 no: día de alta) → falta S4
 *   C2 10-07: S2 A, S3 R               esperados S1 S2 S3 S5 (S8 no: día de baja) → faltan S1 S5
 *   C2 10-14: S1 A, S3 A               esperados S1 S2 S4 S5 + S3 (registró) → faltan S2 S4 S5
 *   C3 10-20: S6 A, S5 R               esperados S6 S5                  → 0 faltas
 *   C3 10-27: S6 A                     esperados S6 S5                  → falta S5
 *   F1 10-08: S1 A, S2 A   (de otro docente: no debe aparecer en E)
 *   C1 09-28: S1 A         (fuera del periodo)
 *
 * Totales de E: 7 sesiones, 26 esperados, 12 A, 4 R, 10 faltas → 16/26 = 61.5 %
 * =============================================================================
 */

const app = crearApp();
const sufijo = randomBytes(3).toString('hex');
const CONTRASENA = `Docente#${sufijo}`;
const ids = {} as Record<string, number>;
const uids: string[] = [];
const cookies = {} as Record<'E' | 'F' | 'admin', string>;

async function uno<T extends Record<string, unknown>>(sql: string, valores: unknown[]): Promise<T> {
  return (await pool.query<T>(sql, valores)).rows[0]!;
}

async function iniciarSesion(correo: string, contrasena: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ correo, contrasena });
  expect(res.status).toBe(200);
  return res.headers['set-cookie']![0]!.split(';')[0]!;
}

beforeAll(async () => {
  for (const d of ['E', 'F']) {
    ids[`docente${d}`] = (
      await uno<{ id_usuario: number }>(
        `INSERT INTO usuario (nombre, apellidos, correo, contrasena_hash, rol)
         VALUES ($1, 'Estadística', $2, $3, 'Docente') RETURNING id_usuario`,
        [`Docente ${d}`, `est.${d.toLowerCase()}.${sufijo}@academicos.udg.mx`, await hashearContrasena(CONTRASENA)],
      )
    ).id_usuario;
  }

  for (const g of ['G1', 'G2', 'G3']) {
    ids[g] = (
      await uno<{ id_grupo: number }>(
        `INSERT INTO grupo (nombre, nivel_grado, ciclo_escolar) VALUES ($1, 'Pruebas', '2026-B') RETURNING id_grupo`,
        [`EST-${g}-${sufijo}`],
      )
    ).id_grupo;
  }

  const clases: Array<[string, string, string, number, string]> = [
    ['C1', 'G1', 'docenteE', 1, 'C1 Lunes'],
    ['C2', 'G1', 'docenteE', 3, 'C2 Miércoles'],
    ['C3', 'G2', 'docenteE', 2, 'C3 Martes'],
    ['F1', 'G1', 'docenteF', 4, 'F1 Jueves'],
    ['F2', 'G3', 'docenteF', 5, 'F2 Viernes'],
  ];
  for (const [clave, grupo, docente, dia, materia] of clases) {
    ids[clave] = (
      await uno<{ id_clase: number }>(
        `INSERT INTO clase (id_grupo, id_docente, materia, dia_semana, hora_inicio, tolerancia_min)
         VALUES ($1, $2, $3, $4, '08:00', 10) RETURNING id_clase`,
        [ids[grupo], ids[docente], materia, dia],
      )
    ).id_clase;
  }

  // Estudiantes con su grupo y estado ACTUALES; luego se reemplazan las
  // inscripciones que crearon los triggers por las fechas del escenario.
  const estudiantes: Array<[string, string, string, boolean]> = [
    ['S1', 'Alfa', 'G1', true],
    ['S2', 'Bravo', 'G1', true],
    ['S3', 'Charlie', 'G1', false],
    ['S4', 'Delta', 'G1', true],
    ['S5', 'Eco', 'G2', true],
    ['S6', 'Foxtrot', 'G2', true],
    ['S7', 'Golf', 'G1', true],
    ['S8', 'Hotel', 'G1', false],
  ];
  for (const [clave, apellidos, grupo, activo] of estudiantes) {
    ids[clave] = (
      await uno<{ id_estudiante: number }>(
        `INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo, activo)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_estudiante`,
        [`${clave}X${sufijo}`.toUpperCase(), `Est ${clave}`, apellidos, `${clave.toLowerCase()}.${sufijo}@alumnos.udg.mx`, ids[grupo], activo],
      )
    ).id_estudiante;
    const uid = randomBytes(4).toString('hex').toUpperCase();
    uids.push(uid);
    await pool.query('INSERT INTO credencial_nfc (uid, id_estudiante, activa) VALUES ($1, $2, $3)', [uid, ids[clave], activo]);
  }
  await pool.query('DELETE FROM inscripcion_grupo WHERE id_estudiante = ANY($1)', [
    ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'].map((s) => ids[s]),
  ]);
  const inscripciones: Array<[string, string, string, string | null]> = [
    ['S1', 'G1', '2026-09-01', null],
    ['S2', 'G1', '2026-09-01', null],
    ['S3', 'G1', '2026-09-01', '2026-10-14'],
    ['S4', 'G1', '2026-10-12', null],
    ['S5', 'G1', '2026-09-01', '2026-10-19'],
    ['S5', 'G2', '2026-10-19', null],
    ['S6', 'G2', '2026-09-01', null],
    ['S7', 'G1', '2026-10-26', null],
    ['S8', 'G1', '2026-09-01', '2026-10-07'],
  ];
  for (const [s, g, desde, hasta] of inscripciones) {
    await pool.query('INSERT INTO inscripcion_grupo (id_estudiante, id_grupo, desde, hasta) VALUES ($1, $2, $3, $4)', [
      ids[s],
      ids[g],
      desde,
      hasta,
    ]);
  }

  const registros: Array<[string, string, string, 'Asistencia' | 'Retardo']> = [
    ['C1', '2026-10-05', 'S1', 'Asistencia'],
    ['C1', '2026-10-05', 'S2', 'Retardo'],
    ['C1', '2026-10-05', 'S3', 'Asistencia'],
    ['C1', '2026-10-05', 'S5', 'Asistencia'],
    ['C1', '2026-10-05', 'S8', 'Asistencia'],
    ['C1', '2026-10-12', 'S1', 'Asistencia'],
    ['C1', '2026-10-12', 'S4', 'Asistencia'],
    ['C1', '2026-10-26', 'S1', 'Retardo'],
    ['C1', '2026-10-26', 'S2', 'Asistencia'],
    ['C2', '2026-10-07', 'S2', 'Asistencia'],
    ['C2', '2026-10-07', 'S3', 'Retardo'],
    ['C2', '2026-10-14', 'S1', 'Asistencia'],
    ['C2', '2026-10-14', 'S3', 'Asistencia'],
    ['C3', '2026-10-20', 'S6', 'Asistencia'],
    ['C3', '2026-10-20', 'S5', 'Retardo'],
    ['C3', '2026-10-27', 'S6', 'Asistencia'],
    ['F1', '2026-10-08', 'S1', 'Asistencia'],
    ['F1', '2026-10-08', 'S2', 'Asistencia'],
    ['C1', '2026-09-28', 'S1', 'Asistencia'],
  ];
  for (const [clase, fecha, s, estado] of registros) {
    await pool.query(
      `INSERT INTO asistencia (id_estudiante, id_clase, id_dispositivo, fecha, hora, estado)
       VALUES ($1, $2, $3, $4, '08:05', $5)`,
      [ids[s], ids[clase], ID_DISPOSITIVO, fecha, estado],
    );
  }

  cookies.E = await iniciarSesion(`est.e.${sufijo}@academicos.udg.mx`, CONTRASENA);
  cookies.F = await iniciarSesion(`est.f.${sufijo}@academicos.udg.mx`, CONTRASENA);
  cookies.admin = await iniciarSesion(CORREO_ADMIN, CONTRASENA_ADMIN);
});

afterAll(() => cerrarPool());

const OCTUBRE = { desde: '2026-10-01', hasta: '2026-10-31' };
const estadisticas = (cookie: string, query: Record<string, string | number> = {}) =>
  request(app).get('/api/estadisticas').set('Cookie', cookie).query({ ...OCTUBRE, ...query });

const conteo = (sesiones: number, esperados: number, asistencias: number, retardos: number, faltas: number, porcentaje: number | null) => ({
  sesiones,
  esperados,
  asistencias,
  retardos,
  faltas,
  porcentaje_asistencia: porcentaje,
});

describe('Control de acceso', () => {
  it.each(['/api/estadisticas', '/api/estadisticas/exportar', '/api/asistencias/exportar'])(
    '%s: Administrador 403 y sin sesión 401',
    async (ruta) => {
      const query = { ...OCTUBRE, formato: 'xlsx' };
      expect((await request(app).get(ruta).set('Cookie', cookies.admin).query(query)).status).toBe(403);
      expect((await request(app).get(ruta).query(query)).status).toBe(401);
    },
  );
});

describe('Estadísticas (RF-16) con resultados calculados a mano', () => {
  it('resumen del docente E en octubre: 7 sesiones, 26 esperados, 12 A, 4 R, 10 faltas, 61.5 %', async () => {
    const res = await estadisticas(cookies.E);
    expect(res.status).toBe(200);
    expect(res.body.periodo).toEqual(OCTUBRE);
    expect(res.body.filtros).toEqual({ grupo: null, clase: null });
    expect(res.body.resumen).toEqual(conteo(7, 26, 12, 4, 10, 61.5));
  });

  it('por semana (lunes), sin la semana del festivo como sesión de C1', async () => {
    const res = await estadisticas(cookies.E);
    expect(res.body.por_semana).toEqual([
      { semana: '2026-10-05', ...conteo(2, 9, 5, 2, 2, 77.8) },
      { semana: '2026-10-12', ...conteo(2, 10, 4, 0, 6, 40) },
      { semana: '2026-10-19', ...conteo(1, 2, 1, 1, 0, 100) }, // solo C3 del martes 20
      { semana: '2026-10-26', ...conteo(2, 5, 2, 1, 2, 60) },
    ]);
  });

  it('por clase', async () => {
    const res = await estadisticas(cookies.E);
    const porClase = res.body.por_clase.map((c: { clase: { id: number } }) => c);
    expect(porClase).toEqual([
      { clase: { id: ids.C1, materia: 'C1 Lunes' }, grupo: { id: ids.G1, nombre: `EST-G1-${sufijo}` }, ...conteo(3, 13, 7, 2, 4, 69.2) },
      { clase: { id: ids.C2, materia: 'C2 Miércoles' }, grupo: { id: ids.G1, nombre: `EST-G1-${sufijo}` }, ...conteo(2, 9, 3, 1, 5, 44.4) },
      { clase: { id: ids.C3, materia: 'C3 Martes' }, grupo: { id: ids.G2, nombre: `EST-G2-${sufijo}` }, ...conteo(2, 4, 2, 1, 1, 75) },
    ]);
  });

  it('estudiantes con más faltas: alta, baja y cambio de grupo no suman faltas fuera de su inscripción', async () => {
    const res = await estadisticas(cookies.E);
    const fila = (s: string, esperados: number, asistencias: number, retardos: number, faltas: number, porcentaje: number) => ({
      estudiante: expect.objectContaining({ id: ids[s] }),
      esperados,
      asistencias,
      retardos,
      faltas,
      porcentaje_asistencia: porcentaje,
    });
    expect(res.body.estudiantes_con_mas_faltas).toEqual([
      fila('S5', 6, 1, 1, 4, 33.3), // cambio de grupo: faltas en G1 antes del 19 y en G2 después
      fila('S2', 5, 2, 1, 2, 60),
      fila('S4', 3, 1, 0, 2, 33.3), // alta el 12: no se le esperaba el 5 ni el 7
      fila('S1', 5, 3, 1, 1, 80), // empate con S3 (1 falta, 1 retardo): por apellidos, Alfa antes que Charlie
      fila('S3', 4, 2, 1, 1, 75), // baja el 14: no se le esperaba el 26
    ]);
    // S6 no tiene faltas: no aparece. Ninguno trae UID.
    expect(JSON.stringify(res.body)).not.toMatch(new RegExp(uids.join('|')));

    const top3 = await estadisticas(cookies.E, { top: 3 });
    expect(top3.body.estudiantes_con_mas_faltas.map((e: { estudiante: { id: number } }) => e.estudiante.id)).toEqual([
      ids.S5,
      ids.S2,
      ids.S4,
    ]);
  });

  it('filtra por grupo, por clase y por periodo', async () => {
    const g1 = await estadisticas(cookies.E, { id_grupo: ids.G1! });
    expect(g1.body.resumen).toEqual(conteo(5, 22, 10, 3, 9, 59.1));
    expect(g1.body.filtros.grupo).toEqual({ id: ids.G1, nombre: `EST-G1-${sufijo}` });

    const c3 = await estadisticas(cookies.E, { id_clase: ids.C3! });
    expect(c3.body.resumen).toEqual(conteo(2, 4, 2, 1, 1, 75));

    const semana = await estadisticas(cookies.E, { desde: '2026-10-12', hasta: '2026-10-18' });
    expect(semana.body.resumen).toEqual(conteo(2, 10, 4, 0, 6, 40));
  });

  it('un periodo que llega al futuro se recorta a hoy, en la zona de la escuela', async () => {
    const hoy = aMomentoLocal(new Date(), env.ZONA_HORARIA_ESCUELA).fecha;
    const res = await estadisticas(cookies.E, { desde: '2026-10-01', hasta: '2027-06-30' });
    expect(res.body.periodo).toEqual({ desde: '2026-10-01', hasta: hoy });
    expect(res.body.resumen).toEqual(conteo(7, 26, 12, 4, 10, 61.5));
  });

  it('sin sesiones en el periodo: todo en cero y porcentaje null', async () => {
    const res = await estadisticas(cookies.E, { desde: '2026-10-19', hasta: '2026-10-19' }); // festivo
    expect(res.body.resumen).toEqual(conteo(0, 0, 0, 0, 0, null));
    expect(res.body.por_semana).toEqual([]);
    expect(res.body.estudiantes_con_mas_faltas).toEqual([]);
  });

  it('aislamiento: el docente F solo ve su clase F1 y E recibe 404 con lo de F', async () => {
    const f = await estadisticas(cookies.F);
    // F1 10-08: esperados S1 S2 S3 S5 (S4 aún no estaba), registraron S1 y S2.
    expect(f.body.resumen).toEqual(conteo(1, 4, 2, 0, 2, 50));

    expect((await estadisticas(cookies.E, { id_clase: ids.F1! })).status).toBe(404);
    expect((await estadisticas(cookies.E, { id_grupo: ids.G3! })).status).toBe(404);
  });

  it('valida el periodo', async () => {
    const sinFechas = await request(app).get('/api/estadisticas').set('Cookie', cookies.E);
    expect(sinFechas.status).toBe(400);
    expect(Object.keys(sinFechas.body.detalles).sort()).toEqual(['desde', 'hasta']);

    expect((await estadisticas(cookies.E, { desde: '2026-10-31', hasta: '2026-10-01' })).body.detalles).toEqual({
      hasta: 'hasta no puede ser anterior a desde',
    });
    expect((await estadisticas(cookies.E, { desde: '2025-01-01', hasta: '2026-10-31' })).status).toBe(400);
    expect((await estadisticas(cookies.E, { top: 0 })).status).toBe(400);
  });
});

describe('Inscripciones automáticas (migración 004)', () => {
  it('alta, cambio de grupo y baja abren y cierran inscripciones con la fecha de hoy', async () => {
    const hoy = aMomentoLocal(new Date(), env.ZONA_HORARIA_ESCUELA).fecha;
    const { id_estudiante: id } = await uno<{ id_estudiante: number }>(
      `INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo)
       VALUES ($1, 'Trigger', 'Prueba', $2, $3) RETURNING id_estudiante`,
      [`TRG${sufijo}`.toUpperCase(), `trg.${sufijo}@alumnos.udg.mx`, ids.G3],
    );
    await pool.query('UPDATE estudiante SET id_grupo = $1 WHERE id_estudiante = $2', [ids.G2, id]);
    await pool.query('UPDATE estudiante SET activo = false WHERE id_estudiante = $1', [id]);

    const { rows } = await pool.query(
      `SELECT id_grupo, to_char(desde, 'YYYY-MM-DD') AS desde, to_char(hasta, 'YYYY-MM-DD') AS hasta
         FROM inscripcion_grupo WHERE id_estudiante = $1 ORDER BY id_inscripcion`,
      [id],
    );
    expect(rows).toEqual([
      { id_grupo: ids.G3, desde: hoy, hasta: hoy },
      { id_grupo: ids.G2, desde: hoy, hasta: hoy },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Exportación (RF-06)
// ---------------------------------------------------------------------------
const binario = (res: NodeJS.ReadableStream, listo: (err: Error | null, cuerpo: Buffer) => void) => {
  const trozos: Buffer[] = [];
  res.on('data', (t: Buffer) => trozos.push(t));
  res.on('end', () => listo(null, Buffer.concat(trozos)));
};

const descargar = (ruta: string, query: Record<string, string | number>) =>
  request(app).get(ruta).set('Cookie', cookies.E).query(query).buffer(true).parse(binario as never);

async function hojasXlsx(contenido: Buffer): Promise<Record<string, unknown[][]>> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(contenido as unknown as ArrayBuffer);
  const hojas: Record<string, unknown[][]> = {};
  libro.eachSheet((hoja) => {
    hojas[hoja.name] = [];
    hoja.eachRow((fila) => hojas[hoja.name]!.push((fila.values as unknown[]).slice(1)));
  });
  return hojas;
}

async function textoPdf(contenido: Buffer): Promise<string> {
  const { text } = await extractText(new Uint8Array(contenido), { mergePages: true });
  return text;
}

/** Valor de la fila cuya primera celda es `etiqueta`. */
const valorDe = (filas: unknown[][], etiqueta: string) => filas.find((f) => f[0] === etiqueta)?.[1];

describe('Exportación de estadísticas', () => {
  it('XLSX: mismos totales, semanas y estudiantes que el endpoint', async () => {
    const json = (await estadisticas(cookies.E, { id_grupo: ids.G1! })).body;
    const res = await descargar('/api/estadisticas/exportar', { ...OCTUBRE, id_grupo: ids.G1!, formato: 'xlsx' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="estadisticas_EST-G1-${sufijo}_2026-10-01_a_2026-10-31.xlsx"`.replace(/"/g, ''),
    );

    const hojas = await hojasXlsx(res.body);
    expect(Object.keys(hojas)).toEqual(['Resumen', 'Por semana', 'Más faltas']);
    const r = json.resumen;
    for (const [etiqueta, valor] of [
      ['Sesiones', r.sesiones],
      ['Esperados', r.esperados],
      ['Asistencias', r.asistencias],
      ['Retardos', r.retardos],
      ['Faltas', r.faltas],
      ['% asistencia', r.porcentaje_asistencia],
    ]) {
      expect(valorDe(hojas.Resumen!, etiqueta)).toBe(valor);
    }
    expect(r).toEqual(conteo(5, 22, 10, 3, 9, 59.1));

    const semanas = hojas['Por semana']!.slice(2).filter((f) => f.length > 1);
    expect(semanas).toEqual(
      json.por_semana.map((s: Record<string, unknown>) => [s.semana, s.sesiones, s.esperados, s.asistencias, s.retardos, s.faltas, s.porcentaje_asistencia]),
    );
    const masFaltas = hojas['Más faltas']!.slice(2).filter((f) => f.length > 1);
    expect(masFaltas.map((f) => f[0])).toEqual(
      json.estudiantes_con_mas_faltas.map((e: { estudiante: { matricula: string } }) => e.estudiante.matricula),
    );
    expect(masFaltas.map((f) => f[6])).toEqual(json.estudiantes_con_mas_faltas.map((e: { faltas: number }) => e.faltas));

    expect(JSON.stringify(hojas)).not.toMatch(new RegExp(uids.join('|')));
  });

  it('PDF: mismos totales que el endpoint y sin UID', async () => {
    const json = (await estadisticas(cookies.E)).body;
    const res = await descargar('/api/estadisticas/exportar', { ...OCTUBRE, formato: 'pdf' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename=estadisticas_2026-10-01_a_2026-10-31.pdf');

    const texto = await textoPdf(res.body);
    expect(texto).toContain(`Faltas: ${json.resumen.faltas}`);
    expect(texto).toContain(`Esperados: ${json.resumen.esperados}`);
    expect(texto).toContain(`% asistencia: ${json.resumen.porcentaje_asistencia}`);
    expect(texto).toContain('Periodo: 2026-10-01 a 2026-10-31');
    for (const e of json.estudiantes_con_mas_faltas) expect(texto).toContain(e.estudiante.matricula);
    expect(texto).not.toMatch(new RegExp(uids.join('|')));
  });
});

describe('Exportación de la lista de asistencias', () => {
  const filtrosC1 = { id_clase: 0, ...OCTUBRE };
  beforeAll(() => {
    filtrosC1.id_clase = ids.C1!;
  });

  it('XLSX: mismas filas y totales que GET /api/asistencias', async () => {
    const json = (await request(app).get('/api/asistencias').set('Cookie', cookies.E).query({ ...filtrosC1, por_pagina: 100 })).body;
    const res = await descargar('/api/asistencias/exportar', { ...filtrosC1, formato: 'xlsx' });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename=asistencias_C1-Lunes_2026-10-01_a_2026-10-31.xlsx');

    const filas = (await hojasXlsx(res.body)).Asistencias!;
    const inicio = filas.findIndex((f) => f[0] === 'Fecha') + 1;
    const datos = filas.slice(inicio).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(String(f[0])));
    expect(json.total).toBe(9);
    expect(datos).toHaveLength(json.total);
    expect(datos.map((f) => [f[0], f[2], f[3]])).toEqual(
      json.datos.map((a: { fecha: string; estado: string; estudiante: { matricula: string } }) => [a.fecha, a.estado, a.estudiante.matricula]),
    );
    expect(valorDe(filas, 'Total de registros')).toBe(9);
    expect(valorDe(filas, 'Asistencias')).toBe(7);
    expect(valorDe(filas, 'Retardos')).toBe(2);
    expect(valorDe(filas, 'Clase')).toBe('C1 Lunes');
    expect(JSON.stringify(filas)).not.toMatch(new RegExp(uids.join('|')));
  });

  it('PDF: mismo total y sin UID', async () => {
    const res = await descargar('/api/asistencias/exportar', { ...filtrosC1, formato: 'pdf' });
    expect(res.status).toBe(200);
    const texto = await textoPdf(res.body);
    expect(texto).toContain('Total de registros: 9');
    expect(texto).toContain('Asistencias: 7');
    expect(texto).toContain('Retardos: 2');
    expect(texto).not.toMatch(new RegExp(uids.join('|')));
  });

  it(`más de ${env.EXPORTACION_MAX_FILAS} filas: 422 con un mensaje claro, sin archivo`, async () => {
    const res = await request(app).get('/api/asistencias/exportar').set('Cookie', cookies.E).query({ formato: 'pdf' });
    expect(res.status).toBe(422);
    // Sin filtro de fechas: los 16 registros de octubre más el del 28 de septiembre.
    expect(res.body.error).toBe(`La exportación tendría 17 filas y el máximo es ${env.EXPORTACION_MAX_FILAS}. Acota el periodo o los filtros.`);
  });

  it('formato inválido u omitido: 400; filtros ajenos: 404', async () => {
    const r = (q: Record<string, string | number>) => request(app).get('/api/asistencias/exportar').set('Cookie', cookies.E).query(q);
    expect((await r({})).body.detalles).toEqual({ formato: 'formato es obligatorio (pdf o xlsx)' });
    expect((await r({ formato: 'csv' })).status).toBe(400);
    expect((await r({ formato: 'pdf', id_clase: ids.F1! })).status).toBe(404);
  });
});
