import { createServer as crearServidorTcp, type Server as ServidorTcp, type Socket } from 'node:net';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { crearApp } from '../src/app.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import {
  diagnosticarDispositivo,
  type OpcionesDiagnostico,
  RUTA_LECTURAS,
  SENALES,
  senalPara,
} from '../src/desarrollo/diagnosticoDispositivo.js';
import { reiniciarLimitesDispositivo } from '../src/middleware/limiteDispositivo.js';
import { CLAVE_DISPOSITIVO, CLAVE_DISPOSITIVO_INACTIVO, ID_DISPOSITIVO, ID_DISPOSITIVO_INACTIVO, UID_ANDREA } from './datos.js';

/*
 * npm run dispositivo:diagnostico (docs/prueba-con-dispositivo.md).
 * Se levanta la API de verdad en un puerto libre y se le habla por HTTP, como
 * lo hará el ESP32. Los casos que la API no puede provocar a voluntad (429,
 * 500) usan un fetch falso.
 */

// Semilla: D01 tiene «Ingeniería de Software» los lunes a las 07:00, con 10
// minutos de tolerancia. El 9 de noviembre de 2026 es lunes; el 12, jueves (sin clases).
const LUNES_0703 = new Date('2026-11-09T07:03:00-06:00');
const JUEVES_1800 = new Date('2026-11-12T18:00:00-06:00');

let servidor: Server;
let base: string;

async function asistencias(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM asistencia');
  return rows[0]!.n;
}

const diagnosticar = (extra: Partial<OpcionesDiagnostico> = {}) =>
  diagnosticarDispositivo({ url: `${base}${RUTA_LECTURAS}`, id: String(ID_DISPOSITIVO), clave: CLAVE_DISPOSITIVO, ...extra });

/** fetch falso que responde siempre lo mismo. */
function fetchQueResponde(status: number, cuerpo: object, encabezados: Record<string, string> = {}) {
  return vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json', ...encabezados } }));
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  servidor = crearApp().listen(0, '127.0.0.1');
  await new Promise((listo) => servidor.once('listening', listo));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

beforeEach(async () => {
  vi.setSystemTime(LUNES_0703);
  reiniciarLimitesDispositivo();
  await pool.query('TRUNCATE asistencia');
});

afterAll(async () => {
  vi.useRealTimers();
  await new Promise((listo) => servidor.close(listo));
  await pool.query('TRUNCATE asistencia');
  await cerrarPool();
});

describe('modo normal: no registra nada', () => {
  it('con red, id y clave correctos dice que todo está bien y no guarda ninguna asistencia', async () => {
    // A las 07:03 del lunes la lectura de Andrea SÍ contaría: si el modo normal
    // enviara el UID, se guardaría una asistencia.
    const resultado = await diagnosticar({ uid: UID_ANDREA });
    expect(resultado.problema).toBeNull();
    expect(resultado.senal).toBeNull();
    expect(resultado.pasos.find((p) => p.titulo === 'Id y clave')?.estado).toBe('ok');
    expect(resultado.pasos.find((p) => p.titulo === 'Formato del UID')?.estado).toBe('ok');
    expect(resultado.pasos.find((p) => p.titulo === 'Lectura completa')).toMatchObject({ estado: 'omitido' });
    expect(await asistencias()).toBe(0);
  });

  it('con una clave equivocada dice que falla la clave (401)', async () => {
    const resultado = await diagnosticar({ clave: 'clave-equivocada' });
    expect(resultado.problema).toBe('clave');
    expect(resultado.pasos.find((p) => p.titulo === 'Conexión con la API')?.estado).toBe('ok');
    expect(resultado.pasos.at(-1)).toMatchObject({ titulo: 'Id y clave', estado: 'error' });
  });

  it('con un id que no existe también dice que falla la clave', async () => {
    expect((await diagnosticar({ id: '999' })).problema).toBe('clave');
  });

  it('con un dispositivo inactivo lo dice (403)', async () => {
    const resultado = await diagnosticar({ id: String(ID_DISPOSITIVO_INACTIVO), clave: CLAVE_DISPOSITIVO_INACTIVO });
    expect(resultado.problema).toBe('inactivo');
  });

  it('con un UID mal formado dice que falla el formato, pero confirma la red y la clave', async () => {
    const resultado = await diagnosticar({ uid: '12345' });
    expect(resultado.problema).toBe('uid');
    expect(resultado.pasos.find((p) => p.titulo === 'Formato del UID')?.estado).toBe('error');
    expect(resultado.pasos.find((p) => p.titulo === 'Id y clave')?.estado).toBe('ok');
  });

  it('completa la ruta si solo se da http://IP:puerto', async () => {
    const resultado = await diagnosticar({ url: base });
    expect(resultado.problema).toBeNull();
    expect(resultado.urlLecturas).toBe(`${base}${RUTA_LECTURAS}`);
    expect(resultado.pasos[0]).toMatchObject({ titulo: 'Dirección de la API', estado: 'ok' });
    expect(resultado.pasos[0]?.detalle).toContain('se agregó la ruta');
  });

  it('avisa que localhost no sirve para el ESP32 y sugiere la IP de red', async () => {
    const puerto = new URL(base).port;
    const resultado = await diagnosticar({ url: `http://localhost:${puerto}`, direccionesLocales: ['192.168.1.50'] });
    expect(resultado.problema).toBeNull();
    const aviso = resultado.pasos.find((p) => p.titulo === 'Dirección para el ESP32');
    expect(aviso?.estado).toBe('aviso');
    expect(aviso?.solucion).toContain(`http://192.168.1.50:${puerto}${RUTA_LECTURAS}`);
  });

  it('con una ruta equivocada dice que la dirección no apunta a las lecturas (404)', async () => {
    const resultado = await diagnosticar({ url: `${base}/api/lecturas` });
    expect(resultado.problema).toBe('ruta');
  });
});

describe('modo real: la petición completa del ESP32', () => {
  it('registra la asistencia y dice qué señal mostraría el lector', async () => {
    const resultado = await diagnosticar({ uid: UID_ANDREA, real: true });
    expect(resultado.problema).toBeNull();
    expect(resultado.senal).toEqual(SENALES.verde);
    expect(await asistencias()).toBe(1);

    const repetida = await diagnosticar({ uid: UID_ANDREA, real: true });
    expect(repetida.senal).toEqual(SENALES.verde);
    expect(repetida.pasos.at(-1)?.detalle).toContain('ya estaba registrada');
    expect(await asistencias()).toBe(1);
  });

  it('acepta el UID con minúsculas y dos puntos, como lo normaliza la API', async () => {
    const resultado = await diagnosticar({ uid: '04:a1:b2:c3', real: true });
    expect(resultado.problema).toBeNull();
    expect(await asistencias()).toBe(1);
  });

  it('sin clase en ese momento dice que falla la clase (rojo)', async () => {
    vi.setSystemTime(JUEVES_1800);
    const resultado = await diagnosticar({ uid: UID_ANDREA, real: true });
    expect(resultado.problema).toBe('clase');
    expect(resultado.senal).toEqual(SENALES.rojo);
    expect(await asistencias()).toBe(0);
  });

  it('con una tarjeta no vinculada dice que falla la credencial (rojo)', async () => {
    const resultado = await diagnosticar({ uid: 'DEADBEEF', real: true });
    expect(resultado.problema).toBe('credencial');
    expect(resultado.senal).toEqual(SENALES.rojo);
  });

  it('con un UID mal formado no envía la lectura', async () => {
    const resultado = await diagnosticar({ uid: '04A1B2C', real: true });
    expect(resultado.problema).toBe('uid');
    expect(resultado.pasos.find((p) => p.titulo === 'Lectura completa')?.estado).toBe('omitido');
    expect(await asistencias()).toBe(0);
  });

  it('sin UID no hace nada y pide uno', async () => {
    const falso = vi.fn();
    const resultado = await diagnosticar({ real: true, fetch: falso });
    expect(resultado.problema).toBe('configuracion');
    expect(falso).not.toHaveBeenCalled();
  });

  it('con una clave equivocada la señal es azul', async () => {
    const resultado = await diagnosticar({ uid: UID_ANDREA, real: true, clave: 'otra' });
    expect(resultado.problema).toBe('clave');
    expect(resultado.senal).toEqual(SENALES.azul);
    expect(await asistencias()).toBe(0);
  });
});

describe('la red', () => {
  it('si nada escucha en el puerto, lo dice (conexión rechazada)', async () => {
    const libre = crearApp().listen(0, '127.0.0.1');
    await new Promise((listo) => libre.once('listening', listo));
    const puerto = (libre.address() as AddressInfo).port;
    await new Promise((listo) => libre.close(listo));

    const resultado = await diagnosticar({ url: `http://127.0.0.1:${puerto}` });
    expect(resultado.problema).toBe('red');
    expect(resultado.pasos.at(-1)?.detalle).toContain('nada está escuchando');
  });

  it('si nadie contesta a tiempo, lo dice con el tiempo máximo del ESP32', async () => {
    // Un servidor que acepta la conexión y nunca contesta (como un firewall que tira los paquetes).
    const conexiones: Socket[] = [];
    const mudo: ServidorTcp = crearServidorTcp((conexion) => conexiones.push(conexion));
    mudo.listen(0, '127.0.0.1');
    await new Promise((listo) => mudo.once('listening', listo));
    try {
      const resultado = await diagnosticar({ url: `http://127.0.0.1:${(mudo.address() as AddressInfo).port}`, timeoutMs: 300, uid: UID_ANDREA, real: true });
      expect(resultado.problema).toBe('red');
      expect(resultado.senal).toEqual(SENALES.azul);
      expect(resultado.pasos.at(-1)?.detalle).toContain('Nadie contestó en 0.3 s');
    } finally {
      for (const conexion of conexiones) conexion.destroy();
      await new Promise((listo) => mudo.close(listo));
    }
  });

  it('si el nombre no existe, pide usar la IP', async () => {
    const error = new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    const resultado = await diagnosticar({ url: 'http://compu-de-valeria:3000', fetch: vi.fn(async () => Promise.reject(error)) });
    expect(resultado.problema).toBe('red');
    expect(resultado.pasos.at(-1)?.solucion).toContain('IP');
  });

  it('con 429 dice cuánto esperar', async () => {
    const resultado = await diagnosticar({ fetch: fetchQueResponde(429, { error: 'Demasiadas' }, { 'Retry-After': '42' }) });
    expect(resultado.problema).toBe('limite');
    expect(resultado.pasos.at(-1)?.detalle).toContain('42 s');
  });

  it('con un error 500 manda a ver la terminal de la API', async () => {
    const resultado = await diagnosticar({ uid: UID_ANDREA, real: true, fetch: fetchQueResponde(500, { error: 'No se pudo guardar' }) });
    expect(resultado.problema).toBe('servidor');
    expect(resultado.senal).toEqual(SENALES.azul);
  });

  it('una respuesta que no es de TapList no se toma por buena', async () => {
    const resultado = await diagnosticar({ fetch: vi.fn(async () => new Response('<html>hola</html>', { status: 200 })) });
    expect(resultado.problema).toBe('respuesta');
  });
});

describe('configuración', () => {
  it.each([
    ['una dirección que no es URL', { url: '192.168.1.50:3000' }],
    ['un id que no es número', { id: 'aula101' }],
    ['sin clave', { clave: undefined }],
  ])('con %s no envía nada', async (_caso, extra) => {
    const falso = vi.fn();
    const resultado = await diagnosticar({ ...extra, fetch: falso });
    expect(resultado.problema).toBe('configuracion');
    expect(falso).not.toHaveBeenCalled();
  });
});

describe('RNF-06', () => {
  it('ni el UID completo ni la clave aparecen en el resultado', async () => {
    const resultados = [
      await diagnosticar({ uid: UID_ANDREA }),
      await diagnosticar({ uid: UID_ANDREA, real: true }),
      await diagnosticar({ uid: UID_ANDREA, clave: 'clave-equivocada' }),
    ];
    for (const resultado of resultados) {
      const texto = JSON.stringify(resultado);
      expect(texto).not.toContain(UID_ANDREA);
      expect(texto).not.toContain(CLAVE_DISPOSITIVO);
    }
    expect(JSON.stringify(resultados[0])).toContain('****B2C3');
  });
});

describe('senalPara (misma tabla que el contrato)', () => {
  it.each<[number | null, { resultado?: string; error?: string } | undefined, typeof SENALES.verde]>([
    [200, { resultado: 'ASISTENCIA' }, SENALES.verde],
    [200, { resultado: 'RETARDO' }, SENALES.amarillo],
    [200, { resultado: 'RECHAZADA' }, SENALES.rojo],
    [400, { error: 'x' }, SENALES.rojo],
    [401, { error: 'x' }, SENALES.azul],
    [403, { error: 'x' }, SENALES.azul],
    [429, { error: 'x' }, SENALES.azul],
    [500, { error: 'x' }, SENALES.azul],
    [null, undefined, SENALES.azul],
  ])('%s %j → %j', (status, cuerpo, senal) => {
    expect(senalPara(status, cuerpo)).toEqual(senal);
  });
});
