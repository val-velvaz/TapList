import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import {
  cerrarConexionesTiempoReal,
  conexionesAbiertas,
} from '../src/modules/asistencias/asistencias.tiempoReal.js';
import { hashearContrasena } from '../src/utils/contrasena.js';
import { CLAVE_DISPOSITIVO, CONTRASENA_ADMIN, CORREO_ADMIN, ID_DISPOSITIVO } from './datos.js';

const app = crearApp();
let servidor: Server;
let urlBase: string;

// ---------------------------------------------------------------------------
// Datos propios de este archivo, para que los totales no dependan de otras
// pruebas. El docente A imparte A1 (lunes 07:00) y A2 (miércoles 09:00) al
// grupo GA y A3 (martes 10:00) al grupo GC; el docente B imparte B1 (lunes
// 07:00) al grupo GB. El docente C solo se usa para probar el cierre de sesión.
// ---------------------------------------------------------------------------
const sufijo = randomBytes(3).toString('hex');
const CONTRASENA = `Docente#${sufijo}`;
const ids = {} as Record<
  'docenteA' | 'docenteB' | 'docenteC' | 'GA' | 'GB' | 'GC' | 'A1' | 'A2' | 'A3' | 'B1' | 'EA1' | 'EA2' | 'EC1' | 'EB1',
  number
>;
const uids = {} as Record<'EA1' | 'EA2' | 'EB1', string>;
const cookies = {} as Record<'A' | 'B' | 'C' | 'admin', string>;
/** Ids de las asistencias insertadas para el docente A, en orden de inserción. */
let asistenciasA: number[] = [];

async function insertar<T extends Record<string, unknown>>(sql: string, valores: unknown[]): Promise<T> {
  return (await pool.query<T>(sql, valores)).rows[0]!;
}

async function crearDocente(nombre: string): Promise<number> {
  const fila = await insertar<{ id_usuario: number }>(
    `INSERT INTO usuario (nombre, apellidos, correo, contrasena_hash, rol)
     VALUES ($1, 'Prueba', $2, $3, 'Docente') RETURNING id_usuario`,
    [nombre, `docente.${nombre.toLowerCase()}.${sufijo}@academicos.udg.mx`, await hashearContrasena(CONTRASENA)],
  );
  return fila.id_usuario;
}

async function iniciarSesion(correo: string, contrasena: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ correo, contrasena });
  expect(res.status).toBe(200);
  return res.headers['set-cookie']![0]!.split(';')[0]!;
}

const correoDocente = (nombre: string) => `docente.${nombre.toLowerCase()}.${sufijo}@academicos.udg.mx`;

beforeAll(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});

  ids.docenteA = await crearDocente('A');
  ids.docenteB = await crearDocente('B');
  ids.docenteC = await crearDocente('C');

  const grupo = async (nombre: string) =>
    (await insertar<{ id_grupo: number }>(
      `INSERT INTO grupo (nombre, nivel_grado, ciclo_escolar) VALUES ($1, 'Pruebas', '2026-B') RETURNING id_grupo`,
      [`${nombre}-${sufijo}`],
    )).id_grupo;
  ids.GA = await grupo('GA');
  ids.GB = await grupo('GB');
  ids.GC = await grupo('GC');

  const clase = async (idGrupo: number, idDocente: number, materia: string, dia: number, hora: string) =>
    (await insertar<{ id_clase: number }>(
      `INSERT INTO clase (id_grupo, id_docente, materia, dia_semana, hora_inicio, tolerancia_min)
       VALUES ($1, $2, $3, $4, $5, 10) RETURNING id_clase`,
      [idGrupo, idDocente, materia, dia, hora],
    )).id_clase;
  ids.A1 = await clase(ids.GA, ids.docenteA, 'Materia A1', 1, '07:00');
  ids.A2 = await clase(ids.GA, ids.docenteA, 'Materia A2', 3, '09:00');
  ids.A3 = await clase(ids.GC, ids.docenteA, 'Materia A3', 2, '10:00');
  ids.B1 = await clase(ids.GB, ids.docenteB, 'Materia B1', 1, '07:00');

  const estudiante = async (clave: string, idGrupo: number, nombre: string) =>
    (await insertar<{ id_estudiante: number }>(
      `INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo)
       VALUES ($1, $2, 'Prueba', $3, $4) RETURNING id_estudiante`,
      [`${clave}${sufijo}`.toUpperCase(), nombre, `${clave.toLowerCase()}.${sufijo}@alumnos.udg.mx`, idGrupo],
    )).id_estudiante;
  ids.EA1 = await estudiante('EAUNO', ids.GA, 'Alumna A1');
  ids.EA2 = await estudiante('EADOS', ids.GA, 'Alumno A2');
  ids.EC1 = await estudiante('ECUNO', ids.GC, 'Alumna C1');
  ids.EB1 = await estudiante('EBUNO', ids.GB, 'Alumno B1');

  for (const clave of ['EA1', 'EA2', 'EB1'] as const) {
    uids[clave] = randomBytes(4).toString('hex').toUpperCase();
    await pool.query('INSERT INTO credencial_nfc (uid, id_estudiante) VALUES ($1, $2)', [uids[clave], ids[clave]]);
  }

  const asistencia = async (idEstudiante: number, idClase: number, fecha: string, hora: string, estado: string) =>
    (await insertar<{ id_asistencia: number }>(
      `INSERT INTO asistencia (id_estudiante, id_clase, id_dispositivo, fecha, hora, estado)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id_asistencia`,
      [idEstudiante, idClase, ID_DISPOSITIVO, fecha, hora, estado],
    )).id_asistencia;
  asistenciasA = [
    await asistencia(ids.EA1, ids.A1, '2026-10-05', '07:03', 'Asistencia'),
    await asistencia(ids.EA2, ids.A1, '2026-10-05', '07:20', 'Retardo'),
    await asistencia(ids.EC1, ids.A3, '2026-10-06', '10:02', 'Asistencia'),
    await asistencia(ids.EA1, ids.A2, '2026-10-07', '09:05', 'Asistencia'),
    await asistencia(ids.EA1, ids.A1, '2026-10-12', '07:15', 'Retardo'),
    await asistencia(ids.EA2, ids.A1, '2026-10-12', '07:01', 'Asistencia'),
  ];
  await asistencia(ids.EB1, ids.B1, '2026-10-05', '07:02', 'Asistencia');

  cookies.A = await iniciarSesion(correoDocente('A'), CONTRASENA);
  cookies.B = await iniciarSesion(correoDocente('B'), CONTRASENA);
  cookies.C = await iniciarSesion(correoDocente('C'), CONTRASENA);
  cookies.admin = await iniciarSesion(CORREO_ADMIN, CONTRASENA_ADMIN);

  servidor = app.listen(0);
  urlBase = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  cerrarConexionesTiempoReal();
  await new Promise((listo) => servidor.close(listo));
  vi.restoreAllMocks();
  await cerrarPool();
});

const consultar = (cookie: string, query: Record<string, string | number> = {}) =>
  request(app).get('/api/asistencias').set('Cookie', cookie).query(query);

/** Todas las claves de un objeto JSON, a cualquier profundidad. */
function claves(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(claves);
  if (valor && typeof valor === 'object') {
    return Object.entries(valor).flatMap(([k, v]) => [k, ...claves(v)]);
  }
  return [];
}

describe('Control de acceso (RF-09)', () => {
  it.each(['/api/asistencias', '/api/asistencias/filtros', '/api/asistencias/eventos'])(
    '%s: Administrador 403 y sin sesión 401',
    async (ruta) => {
      expect((await request(app).get(ruta).set('Cookie', cookies.admin)).status).toBe(403);
      expect((await request(app).get(ruta)).status).toBe(401);
    },
  );
});

describe('Lista de asistencias (P2)', () => {
  it('el docente A ve solo las de sus clases, de la más reciente a la más antigua', async () => {
    const res = await consultar(cookies.A);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pagina: 1, por_pagina: 20, total: 6, total_paginas: 1 });
    expect(res.body.datos.map((a: { id: number }) => a.id)).toEqual([
      asistenciasA[4], // 10-12 07:15
      asistenciasA[5], // 10-12 07:01
      asistenciasA[3], // 10-07
      asistenciasA[2], // 10-06
      asistenciasA[1], // 10-05 07:20
      asistenciasA[0], // 10-05 07:03
    ]);
    expect(res.body.datos[0]).toEqual({
      id: asistenciasA[4],
      fecha: '2026-10-12',
      hora: '07:15:00',
      estado: 'Retardo',
      estudiante: { id: ids.EA1, matricula: `EAUNO${sufijo}`.toUpperCase(), nombre: 'Alumna A1', apellidos: 'Prueba', activo: true },
      clase: { id: ids.A1, materia: 'Materia A1', dia_semana: 1, hora_inicio: '07:00' },
      grupo: { id: ids.GA, nombre: `GA-${sufijo}` },
      dispositivo: { id: ID_DISPOSITIVO, nombre_ubicacion: 'Módulo X, aula 101' },
    });
  });

  it('el docente B solo ve la suya', async () => {
    const res = await consultar(cookies.B);
    expect(res.body.total).toBe(1);
    expect(res.body.datos[0].clase.id).toBe(ids.B1);
  });

  it('sin UID: ninguna clave ni valor relacionado con la credencial (RNF-06)', async () => {
    const res = await consultar(cookies.A);
    expect(claves(res.body).filter((k) => /uid|credencial/i.test(k))).toEqual([]);
    const texto = JSON.stringify(res.body);
    for (const uid of Object.values(uids)) expect(texto).not.toContain(uid);
  });

  it('pagina con total y total_paginas', async () => {
    const pagina1 = await consultar(cookies.A, { por_pagina: 4 });
    expect(pagina1.body).toMatchObject({ total: 6, total_paginas: 2 });
    expect(pagina1.body.datos).toHaveLength(4);

    const pagina2 = await consultar(cookies.A, { por_pagina: 4, pagina: 2 });
    expect(pagina2.body.datos.map((a: { id: number }) => a.id)).toEqual([asistenciasA[1], asistenciasA[0]]);

    const pagina3 = await consultar(cookies.A, { por_pagina: 4, pagina: 3 });
    expect(pagina3.body).toMatchObject({ datos: [], total: 6, total_paginas: 2 });
  });

  it('filtra por clase, grupo, estudiante, estado y rango de fechas (ambas incluidas)', async () => {
    const total = async (query: Record<string, string | number>) => (await consultar(cookies.A, query)).body.total;

    expect(await total({ id_clase: ids.A1 })).toBe(4);
    expect(await total({ id_grupo: ids.GC })).toBe(1);
    expect(await total({ id_grupo: ids.GA })).toBe(5);
    expect(await total({ id_estudiante: ids.EA1 })).toBe(3);
    expect(await total({ estado: 'Retardo' })).toBe(2);
    expect(await total({ desde: '2026-10-06', hasta: '2026-10-07' })).toBe(2);
    expect(await total({ desde: '2026-10-12', hasta: '2026-10-12' })).toBe(2);
    expect(await total({ desde: '2026-10-07' })).toBe(3);
    expect(await total({ hasta: '2026-10-05' })).toBe(2);
    expect(await total({ id_clase: ids.A1, estado: 'Asistencia' })).toBe(2);
    expect(await total({ id_clase: ids.A3, id_grupo: ids.GA })).toBe(0); // combinación sin resultados
  });

  it('un filtro sobre algo ajeno responde 404, igual que si no existiera', async () => {
    const ajenos: Array<[string, number]> = [
      ['id_clase', ids.B1],
      ['id_grupo', ids.GB],
      ['id_estudiante', ids.EB1],
    ];
    for (const [campo, idAjeno] of ajenos) {
      const ajeno = await consultar(cookies.A, { [campo]: idAjeno });
      const inexistente = await consultar(cookies.A, { [campo]: 999_999 });
      expect(ajeno.status).toBe(404);
      expect(ajeno.body).toEqual(inexistente.body);
    }
  });

  it('valida los parámetros con 400', async () => {
    const res = await consultar(cookies.A, { estado: 'Falta', desde: '2026-02-30', por_pagina: 0 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.detalles).sort()).toEqual(['desde', 'estado', 'por_pagina']);

    const rango = await consultar(cookies.A, { desde: '2026-10-12', hasta: '2026-10-05' });
    expect(rango.status).toBe(400);
    expect(rango.body.detalles).toEqual({ hasta: 'hasta no puede ser anterior a desde' });
  });
});

describe('Filtros del docente', () => {
  it('lista solo los grupos y clases que imparte', async () => {
    const a = await request(app).get('/api/asistencias/filtros').set('Cookie', cookies.A).expect(200);
    expect(a.body.grupos.map((g: { id: number }) => g.id).sort()).toEqual([ids.GA, ids.GC].sort());
    expect(a.body.clases.map((c: { id: number }) => c.id).sort()).toEqual([ids.A1, ids.A2, ids.A3].sort());
    expect(a.body.clases).toContainEqual({
      id: ids.A1,
      materia: 'Materia A1',
      dia_semana: 1,
      hora_inicio: '07:00',
      tolerancia_min: 10,
      grupo: { id: ids.GA, nombre: `GA-${sufijo}` },
    });

    const b = await request(app).get('/api/asistencias/filtros').set('Cookie', cookies.B).expect(200);
    expect(b.body).toEqual({
      grupos: [{ id: ids.GB, nombre: `GB-${sufijo}`, ciclo_escolar: '2026-B' }],
      clases: [expect.objectContaining({ id: ids.B1 })],
    });
  });
});

// ---------------------------------------------------------------------------
// Tiempo real (SSE)
// ---------------------------------------------------------------------------
interface EventoSse {
  evento: string;
  id?: string;
  datos: unknown;
}

interface Flujo {
  status: number;
  eventos: EventoSse[];
  terminado: boolean;
  asistencias(): Array<{ id: number; estudiante: { id: number } }>;
  esperar(condicion: (eventos: EventoSse[]) => boolean, ms?: number): Promise<void>;
  cerrar(): void;
}

/** Abre GET /api/asistencias/eventos con fetch y va interpretando el flujo SSE. */
async function abrirFlujo(cookie: string, cabeceras: Record<string, string> = {}): Promise<Flujo> {
  const control = new AbortController();
  const res = await fetch(`${urlBase}/api/asistencias/eventos`, {
    headers: { Cookie: cookie, ...cabeceras },
    signal: control.signal,
  });
  const flujo: Flujo = {
    status: res.status,
    eventos: [],
    terminado: false,
    asistencias: () =>
      flujo.eventos.filter((e) => e.evento === 'asistencia').map((e) => e.datos as { id: number; estudiante: { id: number } }),
    async esperar(condicion, ms = 5000) {
      const limite = Date.now() + ms;
      while (!condicion(flujo.eventos)) {
        if (Date.now() > limite) throw new Error(`No llegó el evento esperado: ${JSON.stringify(flujo.eventos)}`);
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    cerrar: () => control.abort(),
  };
  if (res.status !== 200 || !res.body) {
    await res.body?.cancel();
    return flujo;
  }

  void (async () => {
    const decodificador = new TextDecoder();
    let pendiente = '';
    try {
      for await (const trozo of res.body!) {
        pendiente += decodificador.decode(trozo, { stream: true });
        let fin: number;
        while ((fin = pendiente.indexOf('\n\n')) !== -1) {
          const bloque = pendiente.slice(0, fin);
          pendiente = pendiente.slice(fin + 2);
          const campos: Record<string, string> = {};
          for (const linea of bloque.split('\n')) {
            if (linea.startsWith(':')) continue; // comentario (latido)
            const separador = linea.indexOf(': ');
            if (separador > 0) campos[linea.slice(0, separador)] = linea.slice(separador + 2);
          }
          if (campos.event) {
            flujo.eventos.push({ evento: campos.event, id: campos.id, datos: JSON.parse(campos.data ?? 'null') });
          }
        }
      }
    } catch {
      // abortado por cerrar()
    }
    flujo.terminado = true;
  })();

  await flujo.esperar((e) => e.some((x) => x.evento === 'conectado'));
  return flujo;
}

/** Lectura NFC del ESP32 un lunes a las 07:05, dentro de A1 y B1. */
async function leerUnLunes(uid: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T07:05:00-06:00'));
  try {
    return await request(app)
      .post('/api/dispositivo/lecturas')
      .set('X-Dispositivo-Id', String(ID_DISPOSITIVO))
      .set('X-Dispositivo-Clave', CLAVE_DISPOSITIVO)
      .send({ uid });
  } finally {
    vi.useRealTimers();
  }
}

async function esperarSinConexiones(idDocente: number): Promise<void> {
  const limite = Date.now() + 3000;
  while (conexionesAbiertas(idDocente) > 0) {
    if (Date.now() > limite) throw new Error('Las conexiones SSE no se cerraron');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('Aviso en tiempo real (SSE)', () => {
  it('entrega cada asistencia solo al docente de la clase, en menos de 5 segundos (RNF-01)', async () => {
    const flujoA = await abrirFlujo(cookies.A);
    const flujoB = await abrirFlujo(cookies.B);
    try {
      const inicio = performance.now();
      expect((await leerUnLunes(uids.EA1)).body).toEqual({ resultado: 'ASISTENCIA', duplicado: false });
      await flujoA.esperar(() => flujoA.asistencias().length === 1);
      const latencia = performance.now() - inicio;

      expect(latencia).toBeLessThan(5000);
      expect(flujoA.asistencias()[0]).toMatchObject({
        estudiante: { id: ids.EA1 },
        clase: { id: ids.A1 },
        fecha: '2026-11-09',
        hora: '07:05:00',
        estado: 'Asistencia',
      });
      // El id del evento es el de la asistencia, para Last-Event-ID.
      const evento = flujoA.eventos.find((e) => e.evento === 'asistencia')!;
      expect(evento.id).toBe(String(flujoA.asistencias()[0]!.id));
      expect(JSON.stringify(flujoA.eventos)).not.toContain(uids.EA1);

      // Una lectura en la clase de B le llega solo a B.
      await leerUnLunes(uids.EB1);
      await flujoB.esperar(() => flujoB.asistencias().length === 1);
      expect(flujoB.asistencias()[0]!.estudiante.id).toBe(ids.EB1);
      await new Promise((r) => setTimeout(r, 300));
      expect(flujoA.asistencias()).toHaveLength(1);
    } finally {
      flujoA.cerrar();
      flujoB.cerrar();
    }
  });

  it('una lectura duplicada no envía evento', async () => {
    const flujo = await abrirFlujo(cookies.A);
    try {
      expect((await leerUnLunes(uids.EA1)).body.duplicado).toBe(true); // ya se registró en la prueba anterior
      await leerUnLunes(uids.EA2); // nueva: sirve de marca de que el duplicado ya pasó
      await flujo.esperar(() => flujo.asistencias().length >= 1);
      await new Promise((r) => setTimeout(r, 200));
      expect(flujo.asistencias().map((a) => a.estudiante.id)).toEqual([ids.EA2]);
    } finally {
      flujo.cerrar();
    }
  });

  it('varias pestañas del mismo docente reciben el evento', async () => {
    await pool.query('DELETE FROM asistencia WHERE id_clase = $1 AND fecha = $2', [ids.B1, '2026-11-09']);
    const pestanas = await Promise.all([abrirFlujo(cookies.B), abrirFlujo(cookies.B)]);
    try {
      await leerUnLunes(uids.EB1);
      for (const pestana of pestanas) await pestana.esperar(() => pestana.asistencias().length === 1);
    } finally {
      for (const pestana of pestanas) pestana.cerrar();
    }
  });

  it(`la conexión número ${env.SSE_MAX_CONEXIONES_DOCENTE + 1} del mismo docente recibe 429`, async () => {
    await esperarSinConexiones(ids.docenteA);
    const abiertos: Flujo[] = [];
    try {
      for (let i = 0; i < env.SSE_MAX_CONEXIONES_DOCENTE; i++) abiertos.push(await abrirFlujo(cookies.A));
      expect(abiertos.every((f) => f.status === 200)).toBe(true);
      expect((await abrirFlujo(cookies.A)).status).toBe(429);
      // Otro docente no se ve afectado.
      const otro = await abrirFlujo(cookies.B);
      expect(otro.status).toBe(200);
      otro.cerrar();
    } finally {
      for (const f of abiertos) f.cerrar();
    }
    // Al cerrar las pestañas se liberan los lugares.
    await esperarSinConexiones(ids.docenteA);
    const despues = await abrirFlujo(cookies.A);
    expect(despues.status).toBe(200);
    despues.cerrar();
  });

  it('al reconectarse con Last-Event-ID reenvía lo que llegó mientras tanto, en orden y solo lo suyo', async () => {
    const desde = asistenciasA[3]!;
    const flujo = await abrirFlujo(cookies.A, { 'Last-Event-ID': String(desde) });
    try {
      const reenviadas = flujo.asistencias().map((a) => a.id);
      // Llegan antes de «conectado», en orden ascendente, todas posteriores y del docente A.
      expect(reenviadas).toEqual([...reenviadas].sort((x, y) => x - y));
      expect(reenviadas.every((id) => id > desde)).toBe(true);
      expect(reenviadas).toEqual(expect.arrayContaining([asistenciasA[4], asistenciasA[5]]));
      expect(reenviadas).not.toContain(asistenciasA[3]);
      const indiceConectado = flujo.eventos.findIndex((e) => e.evento === 'conectado');
      expect(flujo.eventos.slice(0, indiceConectado).every((e) => e.evento === 'asistencia')).toBe(true);
      const { rows } = await pool.query('SELECT 1 FROM asistencia a JOIN clase c USING (id_clase) WHERE a.id_asistencia = ANY($1) AND c.id_docente <> $2', [
        reenviadas,
        ids.docenteA,
      ]);
      expect(rows).toEqual([]);
    } finally {
      flujo.cerrar();
    }
  });

  it('si la cuenta se desactiva, el siguiente latido envía sesion_terminada y cierra el flujo', async () => {
    const flujo = await abrirFlujo(cookies.C);
    try {
      await pool.query('UPDATE usuario SET activo = false WHERE id_usuario = $1', [ids.docenteC]);
      await flujo.esperar((e) => e.some((x) => x.evento === 'sesion_terminada'), env.SSE_LATIDO_SEGUNDOS * 1000 + 3000);
      await flujo.esperar(() => flujo.terminado);
      expect(conexionesAbiertas(ids.docenteC)).toBe(0);
      // EventSource reintentaría: ya recibe 401 y deja de reconectarse.
      expect((await abrirFlujo(cookies.C)).status).toBe(401);
    } finally {
      flujo.cerrar();
      await pool.query('UPDATE usuario SET activo = true WHERE id_usuario = $1', [ids.docenteC]);
    }
  });
});
