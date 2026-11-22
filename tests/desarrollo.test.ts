import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import {
  ErrorDesarrollo,
  exigirDesarrollo,
  MATERIA_PRUEBA,
  prepararClaseAhora,
  vincularTarjetaDePrueba,
} from '../src/desarrollo/pruebaDispositivo.js';
import { reiniciarLimitesDispositivo } from '../src/middleware/limiteDispositivo.js';
import { direccionesDeRed } from '../src/utils/red.js';
import { CLAVE_DISPOSITIVO, ID_DISPOSITIVO, UID_ANDREA, UID_BRUNO } from './datos.js';

/*
 * Herramientas de prueba con el dispositivo real (docs/prueba-con-dispositivo.md).
 * El reloj se fija un jueves por la tarde: el grupo D01 de la semilla no tiene
 * clases ese día, así que la de prueba no choca con nada. Al final se borra
 * lo que se creó, para no afectar a otros archivos de pruebas.
 */

const app = crearApp();
const JUEVES_1800 = new Date('2026-11-19T18:00:00-06:00');
const MATRICULA = `PRUEBA${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
let idEstudiantePrueba: number;

const leer = (uid: string) =>
  request(app)
    .post('/api/dispositivo/lecturas')
    .set('X-Dispositivo-Id', String(ID_DISPOSITIVO))
    .set('X-Dispositivo-Clave', CLAVE_DISPOSITIVO)
    .send({ uid });

async function lecturasDeLaClase(idClase: number) {
  const { rows } = await pool.query<{ estado: string }>('SELECT estado FROM asistencia WHERE id_clase = $1 ORDER BY id_asistencia', [idClase]);
  return rows.map((r) => r.estado);
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const { rows } = await pool.query<{ id_estudiante: number }>(
    `INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo)
     SELECT $1, 'Tarjeta', 'De Prueba', $2, id_grupo FROM grupo WHERE nombre = 'D01'
     RETURNING id_estudiante`,
    [MATRICULA, `${MATRICULA.toLowerCase()}@alumnos.udg.mx`],
  );
  idEstudiantePrueba = rows[0]!.id_estudiante;
});

beforeEach(() => {
  vi.setSystemTime(JUEVES_1800);
  reiniciarLimitesDispositivo();
});

afterAll(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await pool.query(`DELETE FROM asistencia WHERE id_clase IN (SELECT id_clase FROM clase WHERE materia = $1)`, [MATERIA_PRUEBA]);
  await pool.query('DELETE FROM clase WHERE materia = $1', [MATERIA_PRUEBA]);
  await pool.query('DELETE FROM asistencia WHERE id_estudiante = $1', [idEstudiantePrueba]);
  await pool.query('DELETE FROM credencial_nfc WHERE id_estudiante = $1', [idEstudiantePrueba]);
  await pool.query('DELETE FROM inscripcion_grupo WHERE id_estudiante = $1', [idEstudiantePrueba]);
  await pool.query('DELETE FROM estudiante WHERE id_estudiante = $1', [idEstudiantePrueba]);
  await cerrarPool();
});

describe('Solo en desarrollo', () => {
  it('se niegan a correr con NODE_ENV=production', () => {
    expect(() => exigirDesarrollo('production')).toThrow(ErrorDesarrollo);
    expect(() => exigirDesarrollo('production')).toThrow('se niega a correr con NODE_ENV=production');
    expect(() => exigirDesarrollo('development')).not.toThrow();
    expect(() => exigirDesarrollo('test')).not.toThrow();
  });
});

describe('npm run dev:clase-ahora', () => {
  it('crea la clase de D01 cinco minutos después y la ventana que verá el lector', async () => {
    const clase = await prepararClaseAhora({ ahora: JUEVES_1800 });
    expect(clase).toMatchObject({
      fecha: '2026-11-19',
      horaInicio: '18:05',
      abre: '17:50',
      asistenciaHasta: '18:15',
      retardoDesde: '18:16',
      cierra: '19:05',
      lecturasBorradas: 0,
      choques: [],
    });
    const { rows } = await pool.query(
      `SELECT c.dia_semana, to_char(c.hora_inicio, 'HH24:MI') AS hora, c.tolerancia_min, g.nombre AS grupo, u.correo
         FROM clase c JOIN grupo g USING (id_grupo) JOIN usuario u ON u.id_usuario = c.id_docente
        WHERE c.id_clase = $1`,
      [clase.idClase],
    );
    expect(rows[0]).toEqual({ dia_semana: 4, hora: '18:05', tolerancia_min: 10, grupo: 'D01', correo: 'roberto.gomez@academicos.udg.mx' });
  });

  it('con la clase lista, un lector real obtiene Asistencia y después de la tolerancia, Retardo', async () => {
    const { idClase } = await prepararClaseAhora({ ahora: JUEVES_1800 });
    expect((await leer(UID_ANDREA)).body).toEqual({ resultado: 'ASISTENCIA', duplicado: false });

    vi.setSystemTime(new Date('2026-11-19T18:16:00-06:00')); // retardoDesde
    expect((await leer(UID_BRUNO)).body).toEqual({ resultado: 'RETARDO', duplicado: false });

    vi.setSystemTime(new Date('2026-11-19T19:06:00-06:00')); // la ventana ya cerró
    expect((await leer(UID_ANDREA)).body).toEqual({ resultado: 'RECHAZADA', motivo: 'SIN_CLASE' });

    expect(await lecturasDeLaClase(idClase)).toEqual(['Asistencia', 'Retardo']);
  });

  it('correrlo otra vez mueve la misma clase y borra sus lecturas, para repetir la prueba', async () => {
    const antes = await prepararClaseAhora({ ahora: JUEVES_1800 });
    await leer(UID_ANDREA);
    const despues = await prepararClaseAhora({ ahora: new Date('2026-11-19T18:30:00-06:00'), minutos: 0 });

    expect(despues.idClase).toBe(antes.idClase);
    expect(despues).toMatchObject({ horaInicio: '18:30', lecturasBorradas: 1 });
    expect(await lecturasDeLaClase(despues.idClase)).toEqual([]);
    const { rows } = await pool.query('SELECT 1 FROM clase WHERE materia = $1', [MATERIA_PRUEBA]);
    expect(rows).toHaveLength(1);
  });

  it('avisa si se cruza con otra clase del grupo', async () => {
    // Lunes 07:00: la semilla tiene «Ingeniería de Software» de D01 a esa hora.
    const clase = await prepararClaseAhora({ ahora: new Date('2026-11-16T06:55:00-06:00') });
    expect(clase.choques).toEqual(['Ingeniería de Software (07:00)']);
    await prepararClaseAhora({ ahora: JUEVES_1800 }); // la regresa al jueves
  });

  it('valida --minutos', async () => {
    await expect(prepararClaseAhora({ ahora: JUEVES_1800, minutos: -1 })).rejects.toThrow('--minutos debe ser un entero de 0 a 60.');
    await expect(prepararClaseAhora({ ahora: JUEVES_1800, minutos: 1.5 })).rejects.toThrow(ErrorDesarrollo);
  });
});

describe('npm run dev:vincular', () => {
  const vincular = (uid: string, forzar = false) => vincularTarjetaDePrueba({ uid, matricula: MATRICULA, forzar });

  it('rechaza un UID inválido, como el decimal de 10 dígitos, sin vincular nada', async () => {
    await expect(vincular('0077705923')).rejects.toThrow('El UID no tiene un formato válido');
    await expect(vincular('0077705923', true)).rejects.toThrow('El UID no tiene un formato válido');
    const { rows } = await pool.query('SELECT 1 FROM credencial_nfc WHERE id_estudiante = $1', [idEstudiantePrueba]);
    expect(rows).toHaveLength(0);
  });

  it('un UID válido con avisos (solo dígitos) pide --forzar', async () => {
    await expect(vincular('12345678')).rejects.toThrow('repite el comando con --forzar');
  });

  it('vincula una tarjeta en el formato canónico, con bitácora, y el lector ya la reconoce', async () => {
    const { rows: antes } = await pool.query(`SELECT count(*)::int AS n FROM bitacora WHERE accion = 'VINCULAR_CREDENCIAL'`);
    const r = await vincular('c4:d5:e6:f7');
    expect(r).toMatchObject({ accion: 'vinculada', estudiante: 'Tarjeta De Prueba', uid: '****E6F7' });

    const { rows } = await pool.query('SELECT uid, activa FROM credencial_nfc WHERE id_estudiante = $1', [idEstudiantePrueba]);
    expect(rows).toEqual([{ uid: 'C4D5E6F7', activa: true }]);
    const { rows: despues } = await pool.query(`SELECT count(*)::int AS n FROM bitacora WHERE accion = 'VINCULAR_CREDENCIAL'`);
    expect(despues[0].n).toBe(antes[0].n + 1);

    await prepararClaseAhora({ ahora: JUEVES_1800 });
    expect((await leer('C4D5E6F7')).body).toEqual({ resultado: 'ASISTENCIA', duplicado: false });
  });

  it('con otra tarjeta, reemplaza la anterior, que deja de registrar', async () => {
    expect((await vincular('C4D5E6F7')).accion).toBe('sin_cambios');
    expect((await vincular('0A1B2C3D4E5F60')).accion).toBe('reemplazada');

    const { rows } = await pool.query('SELECT uid, activa FROM credencial_nfc WHERE id_estudiante = $1 ORDER BY id_credencial', [idEstudiantePrueba]);
    expect(rows).toEqual([
      { uid: 'C4D5E6F7', activa: false },
      { uid: '0A1B2C3D4E5F60', activa: true },
    ]);
    expect((await leer('C4D5E6F7')).body).toEqual({ resultado: 'RECHAZADA', motivo: 'CREDENCIAL_NO_VALIDA' });
  });

  it('no roba la tarjeta de otro estudiante y avisa si la matrícula no existe', async () => {
    await expect(vincular(UID_ANDREA)).rejects.toThrow('No se pudo vincular: Esa credencial ya está asignada.');
    await expect(vincularTarjetaDePrueba({ uid: 'C4D5E6F8', matricula: 'NOEXISTE1' })).rejects.toThrow(
      'No existe un estudiante con la matrícula NOEXISTE1.',
    );
  });
});

describe('Un solo lector que prueba seguido', () => {
  it(`${env.DISPOSITIVO_MAX_SOLICITUDES_MINUTO - 1} lecturas en el mismo minuto no se bloquean`, async () => {
    await prepararClaseAhora({ ahora: JUEVES_1800 });
    const respuestas = [];
    for (let i = 0; i < env.DISPOSITIVO_MAX_SOLICITUDES_MINUTO - 1; i++) respuestas.push((await leer(UID_ANDREA)).status);
    expect(respuestas.every((s) => s === 200)).toBe(true);
  });
});

describe('Direcciones de red', () => {
  it('solo IPv4 que no sean de loopback', () => {
    const interfaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      wlan0: [
        { address: '192.168.1.34', family: 'IPv4', internal: false },
        { address: 'fe80::1', family: 'IPv6', internal: false },
      ],
    } as unknown as Parameters<typeof direccionesDeRed>[0];
    expect(direccionesDeRed(interfaces)).toEqual(['192.168.1.34']);
  });
});
