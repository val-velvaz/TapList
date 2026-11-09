// El servidor de pruebas corre con la zona de Tokio a propósito: las fechas y
// horas deben calcularse en ZONA_HORARIA_ESCUELA (America/Mexico_City), no en
// la zona del servidor.
process.env.TZ = 'Asia/Tokyo';

import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import { type AsistenciaRegistrada, eventos } from '../src/eventos/eventos.js';
import { reiniciarLimitesDispositivo } from '../src/middleware/limiteDispositivo.js';
import {
  CLAVE_DISPOSITIVO,
  CLAVE_DISPOSITIVO_INACTIVO,
  ID_DISPOSITIVO,
  ID_DISPOSITIVO_INACTIVO,
  UID_ANDREA,
  UID_BRUNO,
  UID_CARLA,
  UID_CREDENCIAL_INACTIVA,
  UID_ESTUDIANTE_INACTIVO,
} from './datos.js';

const app = crearApp();
const URL = '/api/dispositivo/lecturas';

// Semilla: el grupo D01 tiene «Ingeniería de Software» los lunes a las 07:00
// con 10 minutos de tolerancia. El 9 de noviembre de 2026 es lunes.
const LUNES = '2026-11-09';
const enHoraEscuela = (hora: string, fecha = LUNES) => new Date(`${fecha}T${hora}-06:00`);

/** Fija el reloj del servidor (solo Date; los timers siguen reales para pg y HTTP). */
function fijarReloj(fecha: Date): void {
  vi.setSystemTime(fecha);
}

function leer(cuerpo: object, { id = ID_DISPOSITIVO, clave = CLAVE_DISPOSITIVO }: { id?: number; clave?: string } = {}) {
  return request(app).post(URL).set('X-Dispositivo-Id', String(id)).set('X-Dispositivo-Clave', clave).send(cuerpo);
}

async function registros() {
  const { rows } = await pool.query<{
    id_estudiante: number;
    id_clase: number;
    id_dispositivo: number;
    fecha: string;
    hora: string;
    estado: string;
  }>(
    `SELECT id_estudiante, id_clase, id_dispositivo, to_char(fecha, 'YYYY-MM-DD') AS fecha, hora::text AS hora, estado
       FROM asistencia ORDER BY id_asistencia`,
  );
  return rows;
}

/** Datos personales que nunca deben salir hacia el dispositivo (RNF-06). */
const DATOS_SENSIBLES = ['Andrea', 'López Torres', '220000001', UID_ANDREA, 'DEADBEEF', 'id_estudiante', 'idEstudiante'];
function sinDatosSensibles(cuerpo: unknown): void {
  const texto = JSON.stringify(cuerpo);
  for (const dato of DATOS_SENSIBLES) expect(texto).not.toContain(dato);
}

let logInfo: MockInstance<typeof console.info>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  fijarReloj(enHoraEscuela('07:05:00'));
  reiniciarLimitesDispositivo();
  await pool.query('TRUNCATE asistencia');
  // Silencia los logs y los guarda para revisar que el UID vaya enmascarado.
  logInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => cerrarPool());

describe('POST /api/dispositivo/lecturas: resultado de la lectura', () => {
  it('1. Lectura dentro de la tolerancia: ASISTENCIA y se crea el registro', async () => {
    const res = await leer({ uid: UID_ANDREA });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultado: 'ASISTENCIA', duplicado: false });
    expect(await registros()).toEqual([
      { id_estudiante: 1, id_clase: 1, id_dispositivo: ID_DISPOSITIVO, fecha: LUNES, hora: '07:05:00', estado: 'Asistencia' },
    ]);
    sinDatosSensibles(res.body);
  });

  it('2. Lectura después de la tolerancia: RETARDO', async () => {
    fijarReloj(enHoraEscuela('07:11:00'));
    const res = await leer({ uid: UID_ANDREA });

    expect(res.body).toEqual({ resultado: 'RETARDO', duplicado: false });
    expect((await registros())[0]?.estado).toBe('Retardo');
  });

  it('3. Lectura justo en el minuto límite (07:10, incluso a los 59 s): ASISTENCIA', async () => {
    fijarReloj(enHoraEscuela('07:10:00'));
    expect((await leer({ uid: UID_ANDREA })).body.resultado).toBe('ASISTENCIA');

    fijarReloj(enHoraEscuela('07:10:59'));
    expect((await leer({ uid: UID_BRUNO })).body.resultado).toBe('ASISTENCIA');
  });

  it('4. UID inexistente: RECHAZADA con CREDENCIAL_NO_VALIDA y sin registro', async () => {
    const res = await leer({ uid: 'DEADBEEF' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultado: 'RECHAZADA', motivo: 'CREDENCIAL_NO_VALIDA' });
    expect(await registros()).toEqual([]);
    sinDatosSensibles(res.body);
  });

  it('5. Credencial inactiva: RECHAZADA con CREDENCIAL_NO_VALIDA y sin registro', async () => {
    const res = await leer({ uid: UID_CREDENCIAL_INACTIVA });

    expect(res.body).toEqual({ resultado: 'RECHAZADA', motivo: 'CREDENCIAL_NO_VALIDA' });
    expect(await registros()).toEqual([]);
  });

  it('6. Estudiante inactivo con credencial activa: RECHAZADA con CREDENCIAL_NO_VALIDA y sin registro', async () => {
    const res = await leer({ uid: UID_ESTUDIANTE_INACTIVO });

    expect(res.body).toEqual({ resultado: 'RECHAZADA', motivo: 'CREDENCIAL_NO_VALIDA' });
    expect(await registros()).toEqual([]);
  });

  it('7. Lectura fuera de cualquier ventana de clase: RECHAZADA con SIN_CLASE', async () => {
    fijarReloj(enHoraEscuela('08:01:00')); // la ventana de la clase de 07:00 cierra a las 08:00
    expect((await leer({ uid: UID_ANDREA })).body).toEqual({ resultado: 'RECHAZADA', motivo: 'SIN_CLASE' });

    fijarReloj(enHoraEscuela('07:05:00', '2026-11-07')); // sábado: el grupo no tiene clases
    expect((await leer({ uid: UID_ANDREA })).body).toEqual({ resultado: 'RECHAZADA', motivo: 'SIN_CLASE' });

    expect(await registros()).toEqual([]);
  });
});

describe('Duplicados', () => {
  it('8. Segunda lectura en la misma clase y día: mismo resultado, duplicado: true y un solo registro', async () => {
    const primera = await leer({ uid: UID_ANDREA });
    // Aunque la segunda llega tarde, se responde con el estado guardado.
    fijarReloj(enHoraEscuela('07:30:00'));
    const segunda = await leer({ uid: UID_ANDREA });

    expect(primera.body).toEqual({ resultado: 'ASISTENCIA', duplicado: false });
    expect(segunda.body).toEqual({ resultado: 'ASISTENCIA', duplicado: true });
    expect(await registros()).toHaveLength(1);
    sinDatosSensibles(segunda.body);
  });

  it('9. Lecturas simultáneas de la misma credencial: un solo registro', async () => {
    const respuestas = await Promise.all(Array.from({ length: 5 }, () => leer({ uid: UID_ANDREA })));

    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(respuestas.every((r) => r.body.resultado === 'ASISTENCIA')).toBe(true);
    expect(respuestas.filter((r) => r.body.duplicado === false)).toHaveLength(1);
    expect(await registros()).toHaveLength(1);
  });
});

describe('Lecturas guardadas sin conexión (leido_en)', () => {
  it('10. Se registran con la fecha y la hora de leido_en, no con las del servidor', async () => {
    fijarReloj(enHoraEscuela('13:00:00')); // el dispositivo se reconecta a mediodía
    const res = await leer({ uid: UID_ANDREA, leido_en: '2026-11-09T07:03:00-06:00' });
    // La misma hora expresada en UTC también se acepta.
    const res2 = await leer({ uid: UID_BRUNO, leido_en: '2026-11-09T13:12:00Z' });

    expect(res.body).toEqual({ resultado: 'ASISTENCIA', duplicado: false });
    expect(res2.body).toEqual({ resultado: 'RETARDO', duplicado: false });
    expect((await registros()).map((r) => [r.fecha, r.hora, r.estado])).toEqual([
      [LUNES, '07:03:00', 'Asistencia'],
      [LUNES, '07:12:00', 'Retardo'],
    ]);
  });

  it('una lectura sin conexión que ya existía no se duplica', async () => {
    await leer({ uid: UID_ANDREA }); // en línea a las 07:05
    fijarReloj(enHoraEscuela('09:00:00'));
    const res = await leer({ uid: UID_ANDREA, leido_en: '2026-11-09T07:06:00-06:00' });

    expect(res.body).toEqual({ resultado: 'ASISTENCIA', duplicado: true });
    expect(await registros()).toHaveLength(1);
  });

  it(`11. leido_en en el futuro o con más de ${env.HORAS_MAX_LECTURA_OFFLINE} horas: 400`, async () => {
    const ahora = enHoraEscuela('07:05:00');
    const desfase = (minutos: number) => new Date(ahora.getTime() + minutos * 60_000).toISOString();

    expect((await leer({ uid: UID_ANDREA, leido_en: desfase(3) })).status).toBe(400);
    expect((await leer({ uid: UID_ANDREA, leido_en: desfase(-24 * 60 - 1) })).status).toBe(400);
    // Sin zona horaria tampoco se acepta.
    expect((await leer({ uid: UID_ANDREA, leido_en: '2026-11-09T07:05:00' })).status).toBe(400);
    expect(await registros()).toEqual([]);

    // Hasta 2 minutos de adelanto se toleran por desfase de reloj.
    expect((await leer({ uid: UID_ANDREA, leido_en: desfase(1) })).status).toBe(200);
  });
});

describe('Autenticación del dispositivo', () => {
  it('12. Sin cabeceras, con clave incorrecta o con un id inexistente: 401 con el mismo mensaje', async () => {
    const sinCabeceras = await request(app).post(URL).send({ uid: UID_ANDREA });
    const claveMala = await leer({ uid: UID_ANDREA }, { clave: 'clave-incorrecta' });
    const idInexistente = await leer({ uid: UID_ANDREA }, { id: 999 });

    for (const res of [sinCabeceras, claveMala, idInexistente]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'Dispositivo no autenticado' });
    }
    expect(await registros()).toEqual([]);
  });

  it('13. Dispositivo inactivo con su clave correcta: 403; con clave incorrecta: 401', async () => {
    const correcta = await leer({ uid: UID_ANDREA }, { id: ID_DISPOSITIVO_INACTIVO, clave: CLAVE_DISPOSITIVO_INACTIVO });
    const incorrecta = await leer({ uid: UID_ANDREA }, { id: ID_DISPOSITIVO_INACTIVO, clave: 'otra' });

    expect(correcta.status).toBe(403);
    expect(incorrecta.status).toBe(401);
    expect(await registros()).toEqual([]);
  });

  it('15. Actualiza DISPOSITIVO.ultima_conexion solo cuando el dispositivo se autentica', async () => {
    await pool.query('UPDATE dispositivo SET ultima_conexion = NULL WHERE id_dispositivo = $1', [ID_DISPOSITIVO]);
    const ultimaConexion = async () =>
      (await pool.query('SELECT ultima_conexion FROM dispositivo WHERE id_dispositivo = $1', [ID_DISPOSITIVO])).rows[0]
        ?.ultima_conexion as Date | null;

    await leer({ uid: UID_ANDREA }, { clave: 'clave-incorrecta' });
    expect(await ultimaConexion()).toBeNull();

    await leer({ uid: 'DEADBEEF' }); // incluso si la lectura se rechaza
    expect(await ultimaConexion()).toBeInstanceOf(Date);
  });

  it(`responde 429 después de ${env.DISPOSITIVO_MAX_SOLICITUDES_MINUTO} solicitudes por minuto del mismo dispositivo`, async () => {
    for (let i = 0; i < env.DISPOSITIVO_MAX_SOLICITUDES_MINUTO; i++) {
      await leer({ uid: 'DEADBEEF' }).expect(200);
    }
    await leer({ uid: UID_ANDREA }).expect(429);
  });
});

describe('Privacidad (RNF-06)', () => {
  it('14. Ninguna respuesta incluye nombre, matrícula, UID ni identificadores del estudiante', async () => {
    const respuestas = [
      await leer({ uid: UID_ANDREA }), // 1: asistencia
      await leer({ uid: 'DEADBEEF' }), // 4: rechazada
      await leer({ uid: UID_ANDREA }), // 8: duplicado
    ];
    for (const res of respuestas) {
      sinDatosSensibles(res.body);
      expect(Object.keys(res.body).sort()).toEqual(
        res.body.resultado === 'RECHAZADA' ? ['motivo', 'resultado'] : ['duplicado', 'resultado'],
      );
    }
  });

  it('los logs muestran el UID enmascarado (últimos 4 caracteres)', async () => {
    await leer({ uid: UID_CARLA });
    await leer({ uid: UID_CREDENCIAL_INACTIVA });

    const logs = logInfo.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(logs).toContain('uid=****556A');
    expect(logs).toContain('uid=****0001');
    expect(logs).not.toContain(UID_CARLA);
    expect(logs).not.toContain(UID_CREDENCIAL_INACTIVA);
  });
});

describe('Validación y errores', () => {
  it('16. UID en minúsculas, con dos puntos o con espacios se normaliza y encuentra la credencial', async () => {
    expect((await leer({ uid: '04:a1:b2:c3' })).body.resultado).toBe('ASISTENCIA');
    expect((await leer({ uid: ' 04 d4 e5 f6 ' })).body.resultado).toBe('ASISTENCIA');
    expect(await registros()).toHaveLength(2);
  });

  it('UID ausente, no hexadecimal o de longitud inválida: 400', async () => {
    for (const cuerpo of [{}, { uid: 'ZZZZZZZZ' }, { uid: '04A1B2' }, { uid: '0'.repeat(22) }, { uid: 1234 }]) {
      const res = await leer(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.detalles.uid).toBeTypeOf('string');
    }
  });

  it('si el guardado falla, responde 500 «No se pudo guardar» sin registro', async () => {
    const consultaOriginal = pool.query.bind(pool);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(pool, 'query').mockImplementation(((texto: unknown, ...resto: unknown[]) => {
      if (typeof texto === 'string' && texto.includes('INSERT INTO asistencia')) {
        return Promise.reject(new Error('Falla simulada de la base de datos'));
      }
      return (consultaOriginal as (...a: unknown[]) => unknown)(texto, ...resto);
    }) as typeof pool.query);

    const res = await leer({ uid: UID_ANDREA });
    vi.restoreAllMocks();

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'No se pudo guardar' });
    expect(await registros()).toEqual([]);
  });
});

describe('Evento y rendimiento', () => {
  it('emite asistencia:registrada una vez por registro nuevo, sin el UID', async () => {
    const recibidos: AsistenciaRegistrada[] = [];
    const oyente = (datos: AsistenciaRegistrada) => recibidos.push(datos);
    eventos.on('asistencia:registrada', oyente);
    try {
      await leer({ uid: UID_ANDREA });
      await leer({ uid: UID_ANDREA }); // duplicado: sin evento
      await leer({ uid: 'DEADBEEF' }); // rechazada: sin evento
    } finally {
      eventos.off('asistencia:registrada', oyente);
    }

    expect(recibidos).toEqual([
      {
        idAsistencia: expect.any(Number),
        idEstudiante: 1,
        idClase: 1,
        idDispositivo: ID_DISPOSITIVO,
        fecha: LUNES,
        hora: '07:05:00',
        estado: 'Asistencia',
      },
    ]);
    expect(JSON.stringify(recibidos)).not.toContain(UID_ANDREA);
  });

  it('un oyente que falla no afecta la respuesta al dispositivo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const oyente = () => {
      throw new Error('Oyente roto');
    };
    eventos.on('asistencia:registrada', oyente);
    try {
      const res = await leer({ uid: UID_ANDREA });
      expect(res.body).toEqual({ resultado: 'ASISTENCIA', duplicado: false });
    } finally {
      eventos.off('asistencia:registrada', oyente);
    }
  });

  it('responde en menos de 500 ms (RNF-01)', async () => {
    await leer({ uid: 'DEADBEEF' }); // calienta conexiones
    const inicio = performance.now();
    await leer({ uid: UID_ANDREA }).expect(200);
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});
