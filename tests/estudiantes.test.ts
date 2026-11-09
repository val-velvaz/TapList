import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import {
  darDeAlta,
  darDeBaja,
  reemplazarCredencial,
  vincularCredencial,
} from '../src/modules/estudiantes/estudiantes.service.js';
import {
  CLAVE_DISPOSITIVO,
  CONTRASENA_ADMIN,
  CONTRASENA_DOCENTE,
  CORREO_ADMIN,
  CORREO_DOCENTE,
  ID_DISPOSITIVO,
} from './datos.js';

const app = crearApp();
const admin = request.agent(app);
const docente = request.agent(app);

// Grupo D01 de la semilla: «Ingeniería de Software», lunes 07:00, tolerancia 10 min.
const ID_GRUPO_D01 = 1;
// Id del docente Roberto en la semilla: sirve para forzar un fallo real de la
// bitácora, cuyo trigger solo acepta usuarios con rol Administrador.
const ID_USUARIO_DOCENTE = 2;
let ID_USUARIO_ADMIN: number;

// Cada prueba usa datos propios para no depender del orden ni afectar a las
// pruebas de lecturas, que usan a los estudiantes de la semilla.
const hex = (bytes: number) => randomBytes(bytes).toString('hex').toUpperCase();
const nuevaMatricula = () => `E${hex(5)}`;
const nuevoUid = () => hex(4);

interface DatosEstudiante {
  matricula?: string;
  nombre?: string;
  apellidos?: string;
  correo?: string;
  id_grupo?: number;
  uid?: string;
}

function datosEstudiante(extra: DatosEstudiante = {}) {
  const matricula = extra.matricula ?? nuevaMatricula();
  return {
    matricula,
    nombre: 'Prueba',
    apellidos: 'Estudiante',
    correo: `${matricula.toLowerCase()}@alumnos.udg.mx`,
    id_grupo: ID_GRUPO_D01,
    ...extra,
  };
}

async function crearEstudiante(extra: DatosEstudiante = {}) {
  const res = await admin.post('/api/estudiantes').send(datosEstudiante(extra));
  expect(res.status).toBe(201);
  return res.body.estudiante as { id: number; matricula: string; credencial: { id: number } | null };
}

/** Ninguna respuesta debe incluir un UID completo (RNF-06). */
function sinUidCompleto(cuerpo: unknown, ...uids: string[]): void {
  const texto = JSON.stringify(cuerpo);
  for (const uid of uids) expect(texto).not.toContain(uid);
}

async function ultimasEntradasBitacora(n: number) {
  const { rows } = await pool.query<{ id_usuario: number; accion: string; entidad_afectada: string }>(
    'SELECT id_usuario, accion, entidad_afectada FROM bitacora ORDER BY id_bitacora DESC LIMIT $1',
    [n],
  );
  return rows.reverse();
}

async function conteoBitacora(): Promise<number> {
  return Number((await pool.query('SELECT count(*) AS n FROM bitacora')).rows[0].n);
}

/** Simula una lectura del ESP32 un lunes a las 07:05 (dentro de la clase del grupo D01). */
async function leerEnClase(uid: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-09T07:05:00-06:00'));
  try {
    const res = await request(app)
      .post('/api/dispositivo/lecturas')
      .set('X-Dispositivo-Id', String(ID_DISPOSITIVO))
      .set('X-Dispositivo-Clave', CLAVE_DISPOSITIVO)
      .send({ uid });
    return res.body as { resultado: string; motivo?: string };
  } finally {
    vi.useRealTimers();
  }
}

beforeAll(async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {}); // logs de lecturas
  const sesionAdmin = await admin.post('/api/auth/login').send({ correo: CORREO_ADMIN, contrasena: CONTRASENA_ADMIN });
  expect(sesionAdmin.status).toBe(200);
  ID_USUARIO_ADMIN = sesionAdmin.body.usuario.id;
  await docente.post('/api/auth/login').send({ correo: CORREO_DOCENTE, contrasena: CONTRASENA_DOCENTE }).expect(200);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await cerrarPool();
});

describe('Control de acceso (RF-09)', () => {
  const rutas: Array<[string, (a: ReturnType<typeof request.agent> | ReturnType<typeof request>) => request.Test]> = [
    ['GET /api/estudiantes', (a) => a.get('/api/estudiantes')],
    ['GET /api/estudiantes/1', (a) => a.get('/api/estudiantes/1')],
    ['POST /api/estudiantes', (a) => a.post('/api/estudiantes').send(datosEstudiante())],
    ['POST /api/estudiantes/1/credencial', (a) => a.post('/api/estudiantes/1/credencial').send({ uid: nuevoUid() })],
    ['PUT /api/estudiantes/1/credencial', (a) => a.put('/api/estudiantes/1/credencial').send({ uid: nuevoUid() })],
    ['POST /api/estudiantes/1/baja', (a) => a.post('/api/estudiantes/1/baja')],
    ['GET /api/grupos', (a) => a.get('/api/grupos')],
  ];

  it.each(rutas)('%s: Docente recibe 403 y sin sesión 401, sin cambios en la base', async (_ruta, hacer) => {
    const antes = await conteoBitacora();
    expect((await hacer(docente)).status).toBe(403);
    expect((await hacer(request(app))).status).toBe(401);
    expect(await conteoBitacora()).toBe(antes);
  });
});

describe('Consulta (P4)', () => {
  let idGrupo: number;

  beforeAll(async () => {
    // Grupo exclusivo para que los totales no dependan de otras pruebas.
    const { rows } = await pool.query<{ id_grupo: number }>(
      `INSERT INTO grupo (nombre, nivel_grado, ciclo_escolar) VALUES ('LISTA', 'Pruebas', '2026-B') RETURNING id_grupo`,
    );
    idGrupo = rows[0]!.id_grupo;
    await crearEstudiante({ id_grupo: idGrupo, matricula: 'L00000001', nombre: 'Ángel', apellidos: 'Pérez Ibáñez', uid: nuevoUid() });
    await crearEstudiante({ id_grupo: idGrupo, matricula: 'L00000002', nombre: 'Beatriz', apellidos: 'Gómez Ruiz', uid: nuevoUid() });
    await crearEstudiante({ id_grupo: idGrupo, matricula: 'L00000003', nombre: 'César', apellidos: 'Díaz Luna' });
    await crearEstudiante({ id_grupo: idGrupo, matricula: 'L00000004', nombre: 'Dalia', apellidos: 'Álvarez Soto' });
    const baja = await crearEstudiante({ id_grupo: idGrupo, matricula: 'L00000005', nombre: 'Elías', apellidos: 'Zúñiga Mora', uid: nuevoUid() });
    await admin.post(`/api/estudiantes/${baja.id}/baja`).expect(200);
  });

  const listar = (query: Record<string, string | number | boolean>) =>
    admin.get('/api/estudiantes').query({ id_grupo: idGrupo, ...query });

  it('pagina con total y total_paginas, ordenado por apellidos', async () => {
    const pagina1 = await listar({ por_pagina: 2 });
    expect(pagina1.status).toBe(200);
    expect(pagina1.body).toMatchObject({ pagina: 1, por_pagina: 2, total: 4, total_paginas: 2 });
    expect(pagina1.body.datos.map((e: { apellidos: string }) => e.apellidos)).toEqual(['Álvarez Soto', 'Díaz Luna']);

    const pagina2 = await listar({ por_pagina: 2, pagina: 2 });
    expect(pagina2.body.datos.map((e: { matricula: string }) => e.matricula)).toEqual(['L00000002', 'L00000001']);

    const fueraDeRango = await listar({ por_pagina: 2, pagina: 9 });
    expect(fueraDeRango.body).toMatchObject({ datos: [], total: 4, total_paginas: 2 });
  });

  it('muestra matrícula, nombre, grupo y el UID enmascarado', async () => {
    const res = await listar({ q: 'L00000001' });
    expect(res.body.datos).toEqual([
      {
        id: expect.any(Number),
        matricula: 'L00000001',
        nombre: 'Ángel',
        apellidos: 'Pérez Ibáñez',
        correo: 'l00000001@alumnos.udg.mx',
        activo: true,
        grupo: { id: idGrupo, nombre: 'LISTA', ciclo_escolar: '2026-B' },
        credencial: {
          id: expect.any(Number),
          uid_enmascarado: expect.stringMatching(/^\*{4}[0-9A-F]{4}$/),
          activa: true,
          fecha_asignacion: expect.any(String),
        },
      },
    ]);
  });

  it('busca sin distinguir mayúsculas ni acentos, por nombre, apellidos o matrícula', async () => {
    const nombres = async (q: string) =>
      (await listar({ q })).body.datos.map((e: { nombre: string }) => e.nombre);

    expect(await nombres('perez ibanez')).toEqual(['Ángel']);
    expect(await nombres('ANGEL')).toEqual(['Ángel']);
    expect(await nombres('gomez beatriz')).toEqual(['Beatriz']); // palabras en cualquier orden
    expect(await nombres('  díaz   CESAR ')).toEqual(['César']);
    expect(await nombres('diaz beatriz')).toEqual([]); // todas las palabras deben coincidir
    expect(await nombres('l0000000')).toHaveLength(4);
    expect(await nombres('%')).toEqual([]); // los comodines se buscan literalmente
  });

  it('filtra por credencial y por estado', async () => {
    const matriculas = async (query: Record<string, string>) =>
      (await listar(query)).body.datos.map((e: { matricula: string }) => e.matricula).sort();

    expect(await matriculas({ con_credencial: 'true' })).toEqual(['L00000001', 'L00000002']);
    expect(await matriculas({ con_credencial: 'false' })).toEqual(['L00000003', 'L00000004']);
    expect(await matriculas({ estado: 'inactivos' })).toEqual(['L00000005']);
    expect(await matriculas({ estado: 'todos' })).toHaveLength(5);
  });

  it('rechaza parámetros inválidos con 400 indicando cuál', async () => {
    const res = await admin.get('/api/estudiantes').query({ por_pagina: 500, estado: 'x', con_credencial: 'quizas' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.detalles).sort()).toEqual(['con_credencial', 'estado', 'por_pagina']);
  });

  it('el detalle responde 404 si no existe y 400 si el id no es válido', async () => {
    await admin.get('/api/estudiantes/999999').expect(404);
    await admin.get('/api/estudiantes/abc').expect(400);
  });

  it('GET /api/grupos lista los grupos', async () => {
    const res = await admin.get('/api/grupos').expect(200);
    expect(res.body.datos).toEqual(
      expect.arrayContaining([{ id: ID_GRUPO_D01, nombre: 'D01', nivel_grado: '5.º semestre', ciclo_escolar: '2026-B' }]),
    );
  });
});

describe('Alta (P5)', () => {
  it('sin UID: 201, queda sin credencial y deja ALTA_ESTUDIANTE en la bitácora', async () => {
    const res = await admin.post('/api/estudiantes').send(
      datosEstudiante({ matricula: ' e0000a01 ', nombre: '  José ', apellidos: 'Núñez Peña', correo: ' Jose.Nunez@Alumnos.UDG.mx' }),
    );

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/estudiantes/${res.body.estudiante.id}`);
    expect(res.body.estudiante).toMatchObject({
      matricula: 'E0000A01',
      nombre: 'José',
      apellidos: 'Núñez Peña',
      correo: 'jose.nunez@alumnos.udg.mx',
      activo: true,
      credencial: null,
    });
    expect(await ultimasEntradasBitacora(1)).toEqual([
      { id_usuario: ID_USUARIO_ADMIN, accion: 'ALTA_ESTUDIANTE', entidad_afectada: `estudiante#${res.body.estudiante.id}` },
    ]);
  });

  it('con UID: 201, credencial vinculada y enmascarada, y dos entradas en la bitácora', async () => {
    const uid = nuevoUid();
    const res = await admin.post('/api/estudiantes').send(datosEstudiante({ uid: uid.toLowerCase().match(/../g)!.join(':') }));

    expect(res.status).toBe(201);
    const { id, credencial } = res.body.estudiante;
    expect(credencial).toMatchObject({ uid_enmascarado: `****${uid.slice(-4)}`, activa: true });
    sinUidCompleto(res.body, uid);
    expect(await ultimasEntradasBitacora(2)).toEqual([
      { id_usuario: ID_USUARIO_ADMIN, accion: 'ALTA_ESTUDIANTE', entidad_afectada: `estudiante#${id}` },
      { id_usuario: ID_USUARIO_ADMIN, accion: 'VINCULAR_CREDENCIAL', entidad_afectada: `credencial_nfc#${credencial.id} → estudiante#${id}` },
    ]);
  });

  it('matrícula duplicada (aunque cambien mayúsculas o espacios): 409 con mensaje claro', async () => {
    const existente = await crearEstudiante();
    const res = await admin
      .post('/api/estudiantes')
      .send(datosEstudiante({ matricula: ` ${existente.matricula.toLowerCase()} `, correo: 'otro@alumnos.udg.mx' }));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Ya existe un estudiante con esa matrícula' });
  });

  it('con un UID ya asignado: 409 y tampoco se crea el estudiante (todo o nada)', async () => {
    const uid = nuevoUid();
    await crearEstudiante({ uid });
    const matricula = nuevaMatricula();
    const antes = await conteoBitacora();

    const res = await admin.post('/api/estudiantes').send(datosEstudiante({ matricula, uid }));

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Esa credencial ya está asignada' });
    sinUidCompleto(res.body, uid);
    expect((await pool.query('SELECT 1 FROM estudiante WHERE matricula = $1', [matricula])).rowCount).toBe(0);
    expect(await conteoBitacora()).toBe(antes);
  });

  it('grupo inexistente: 400 sobre id_grupo', async () => {
    const res = await admin.post('/api/estudiantes').send(datosEstudiante({ id_grupo: 99999 }));
    expect(res.status).toBe(400);
    expect(res.body.detalles).toEqual({ id_grupo: 'El grupo no existe' });
  });

  it('validaciones: 400 con un mensaje por campo', async () => {
    const res = await admin.post('/api/estudiantes').send({ matricula: 'ab', correo: 'no-es-correo', id_grupo: '1', uid: 'xyz' });
    expect(res.status).toBe(400);
    expect(res.body.detalles).toEqual({
      matricula: 'La matrícula debe tener de 5 a 20 letras o números',
      nombre: 'El nombre es obligatorio',
      apellidos: 'Los apellidos son obligatorios',
      correo: 'El correo no tiene un formato válido',
      id_grupo: 'id_grupo debe ser un número',
      uid: 'El UID debe ser hexadecimal de 8 a 20 caracteres',
    });
  });
});

describe('Vincular credencial (AD-06)', () => {
  it('caso feliz: 201, UID enmascarado y entrada en la bitácora', async () => {
    const estudiante = await crearEstudiante();
    const uid = nuevoUid();
    const res = await admin.post(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid });

    expect(res.status).toBe(201);
    expect(res.body.estudiante.credencial).toMatchObject({ uid_enmascarado: `****${uid.slice(-4)}`, activa: true });
    sinUidCompleto(res.body, uid);
    expect(await ultimasEntradasBitacora(1)).toEqual([
      {
        id_usuario: ID_USUARIO_ADMIN,
        accion: 'VINCULAR_CREDENCIAL',
        entidad_afectada: `credencial_nfc#${res.body.estudiante.credencial.id} → estudiante#${estudiante.id}`,
      },
    ]);
    expect((await leerEnClase(uid)).resultado).toBe('ASISTENCIA');
  });

  it('un UID asignado a otro estudiante no se puede vincular: 409', async () => {
    const uid = nuevoUid();
    await crearEstudiante({ uid });
    const otro = await crearEstudiante();

    const res = await admin.post(`/api/estudiantes/${otro.id}/credencial`).send({ uid });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Esa credencial ya está asignada' });
    sinUidCompleto(res.body, uid);
  });

  it('si ya tiene una credencial activa: 409 que sugiere reemplazar', async () => {
    const estudiante = await crearEstudiante({ uid: nuevoUid() });
    const res = await admin.post(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: nuevoUid() });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/usa reemplazar/);
  });

  it('a un estudiante dado de baja: 409; a uno inexistente: 404', async () => {
    const estudiante = await crearEstudiante();
    await admin.post(`/api/estudiantes/${estudiante.id}/baja`).expect(200);

    await admin.post(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: nuevoUid() }).expect(409);
    await admin.post('/api/estudiantes/999999/credencial').send({ uid: nuevoUid() }).expect(404);
  });

  it('dos vinculaciones simultáneas del mismo UID dejan una sola credencial', async () => {
    const uid = nuevoUid();
    const [a, b] = await Promise.all([crearEstudiante(), crearEstudiante()]);
    const respuestas = await Promise.all(
      [a!, b!].map((e) => admin.post(`/api/estudiantes/${e.id}/credencial`).send({ uid })),
    );

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await pool.query('SELECT 1 FROM credencial_nfc WHERE uid = $1', [uid])).rowCount).toBe(1);
  });

  it('dos vinculaciones simultáneas al mismo estudiante dejan una sola credencial activa', async () => {
    const estudiante = await crearEstudiante();
    const respuestas = await Promise.all([
      admin.post(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: nuevoUid() }),
      admin.post(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: nuevoUid() }),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    const { rowCount } = await pool.query('SELECT 1 FROM credencial_nfc WHERE id_estudiante = $1 AND activa', [estudiante.id]);
    expect(rowCount).toBe(1);
  });
});

describe('Reemplazar credencial', () => {
  it('desactiva la anterior (conservada en el historial), activa la nueva y registra ambas en la bitácora', async () => {
    const uidViejo = nuevoUid();
    const uidNuevo = nuevoUid();
    const estudiante = await crearEstudiante({ uid: uidViejo });
    const idViejo = estudiante.credencial!.id;

    const res = await admin.put(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: uidNuevo });

    expect(res.status).toBe(200);
    const idNuevo = res.body.estudiante.credencial.id;
    expect(res.body.estudiante.credencial).toMatchObject({ uid_enmascarado: `****${uidNuevo.slice(-4)}`, activa: true });
    sinUidCompleto(res.body, uidViejo, uidNuevo);

    const detalle = await admin.get(`/api/estudiantes/${estudiante.id}`).expect(200);
    expect(detalle.body.historial_credenciales.map((c: { id: number; activa: boolean }) => [c.id, c.activa])).toEqual([
      [idNuevo, true],
      [idViejo, false],
    ]);
    sinUidCompleto(detalle.body, uidViejo, uidNuevo);

    expect(await ultimasEntradasBitacora(1)).toEqual([
      {
        id_usuario: ID_USUARIO_ADMIN,
        accion: 'REEMPLAZAR_CREDENCIAL',
        entidad_afectada: `credencial_nfc#${idViejo} → credencial_nfc#${idNuevo} (estudiante#${estudiante.id})`,
      },
    ]);

    // La perdida queda rechazada en el aula y la nueva registra asistencia.
    expect(await leerEnClase(uidViejo)).toEqual({ resultado: 'RECHAZADA', motivo: 'CREDENCIAL_NO_VALIDA' });
    expect((await leerEnClase(uidNuevo)).resultado).toBe('ASISTENCIA');
  });

  it('una credencial reemplazada no puede volver a vincularse, ni al mismo estudiante: 409', async () => {
    const uidViejo = nuevoUid();
    const estudiante = await crearEstudiante({ uid: uidViejo });
    await admin.put(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: nuevoUid() }).expect(200);

    await admin.put(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: uidViejo }).expect(409);
    const otro = await crearEstudiante();
    await admin.post(`/api/estudiantes/${otro.id}/credencial`).send({ uid: uidViejo }).expect(409);
  });

  it('sin credencial activa: 409 que sugiere vincular', async () => {
    const estudiante = await crearEstudiante();
    const res = await admin.put(`/api/estudiantes/${estudiante.id}/credencial`).send({ uid: nuevoUid() });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/usa vincular/);
  });
});

describe('Baja lógica (AD-07)', () => {
  it('desactiva estudiante y credencial, conserva las asistencias y registra la bitácora', async () => {
    const uid = nuevoUid();
    const estudiante = await crearEstudiante({ uid });
    expect((await leerEnClase(uid)).resultado).toBe('ASISTENCIA');

    const res = await admin.post(`/api/estudiantes/${estudiante.id}/baja`);

    expect(res.status).toBe(200);
    expect(res.body.estudiante).toMatchObject({ activo: false, credencial: null });
    const { rows } = await pool.query('SELECT activa FROM credencial_nfc WHERE id_estudiante = $1', [estudiante.id]);
    expect(rows).toEqual([{ activa: false }]);
    expect((await pool.query('SELECT 1 FROM asistencia WHERE id_estudiante = $1', [estudiante.id])).rowCount).toBe(1);
    expect(await ultimasEntradasBitacora(1)).toEqual([
      {
        id_usuario: ID_USUARIO_ADMIN,
        accion: 'BAJA_ESTUDIANTE',
        entidad_afectada: `estudiante#${estudiante.id} (credencial_nfc#${estudiante.credencial!.id} desactivada)`,
      },
    ]);
  });

  it('una lectura NFC posterior a la baja sale RECHAZADA', async () => {
    const uid = nuevoUid();
    const estudiante = await crearEstudiante({ uid });
    await admin.post(`/api/estudiantes/${estudiante.id}/baja`).expect(200);

    expect(await leerEnClase(uid)).toEqual({ resultado: 'RECHAZADA', motivo: 'CREDENCIAL_NO_VALIDA' });
  });

  it('sin credencial también funciona; una segunda baja responde 409', async () => {
    const estudiante = await crearEstudiante();
    await admin.post(`/api/estudiantes/${estudiante.id}/baja`).expect(200);
    expect(await ultimasEntradasBitacora(1)).toEqual([
      { id_usuario: ID_USUARIO_ADMIN, accion: 'BAJA_ESTUDIANTE', entidad_afectada: `estudiante#${estudiante.id}` },
    ]);

    const res = await admin.post(`/api/estudiantes/${estudiante.id}/baja`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'El estudiante ya está dado de baja' });
  });
});

describe('La bitácora se revierte junto con el cambio (RNF-03)', () => {
  // Llama al servicio con el id de un Docente: el trigger de la bitácora lo
  // rechaza, así que el fallo es real (no simulado) y debe revertir todo.
  it('alta: si falla la bitácora, el estudiante no se crea', async () => {
    const matricula = nuevaMatricula();
    const antes = await conteoBitacora();

    await expect(darDeAlta(datosEstudiante({ matricula, uid: nuevoUid() }), ID_USUARIO_DOCENTE)).rejects.toThrow(/Administrador/);

    expect((await pool.query('SELECT 1 FROM estudiante WHERE matricula = $1', [matricula])).rowCount).toBe(0);
    expect(await conteoBitacora()).toBe(antes);
  });

  it('vincular: si falla la bitácora, la credencial no se guarda', async () => {
    const estudiante = await crearEstudiante();
    const uid = nuevoUid();

    await expect(vincularCredencial(estudiante.id, uid, ID_USUARIO_DOCENTE)).rejects.toThrow(/Administrador/);

    expect((await pool.query('SELECT 1 FROM credencial_nfc WHERE uid = $1', [uid])).rowCount).toBe(0);
  });

  it('reemplazar: si falla la bitácora, la credencial anterior sigue activa y la nueva no existe', async () => {
    const uidViejo = nuevoUid();
    const uidNuevo = nuevoUid();
    const estudiante = await crearEstudiante({ uid: uidViejo });

    await expect(reemplazarCredencial(estudiante.id, uidNuevo, ID_USUARIO_DOCENTE)).rejects.toThrow(/Administrador/);

    const { rows } = await pool.query('SELECT uid, activa FROM credencial_nfc WHERE id_estudiante = $1', [estudiante.id]);
    expect(rows).toEqual([{ uid: uidViejo, activa: true }]);
  });

  it('baja: si falla la bitácora, el estudiante y su credencial siguen activos', async () => {
    const estudiante = await crearEstudiante({ uid: nuevoUid() });

    await expect(darDeBaja(estudiante.id, ID_USUARIO_DOCENTE)).rejects.toThrow(/Administrador/);

    const { rows } = await pool.query(
      `SELECT e.activo, c.activa FROM estudiante e JOIN credencial_nfc c USING (id_estudiante) WHERE e.id_estudiante = $1`,
      [estudiante.id],
    );
    expect(rows).toEqual([{ activo: true, activa: true }]);
  });

  it('la bitácora nunca guarda UID', async () => {
    const { rows } = await pool.query<{ entidad_afectada: string }>('SELECT entidad_afectada FROM bitacora');
    const { rows: uids } = await pool.query<{ uid: string }>('SELECT uid FROM credencial_nfc');
    const texto = rows.map((r) => r.entidad_afectada).join('\n');
    for (const { uid } of uids) expect(texto).not.toContain(uid);
  });
});
