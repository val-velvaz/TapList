import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorApi, pedir, registrarPerdidaDeSesion } from '../api/cliente';
import { rutaDeInicio } from '../sesion/tipos';
import { simularApi } from './ayudas';

afterEach(() => registrarPerdidaDeSesion(null));

async function errorDe(promesa: Promise<unknown>): Promise<ErrorApi> {
  try {
    await promesa;
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorApi);
    return error as ErrorApi;
  }
  throw new Error('Se esperaba un ErrorApi');
}

describe('pedir', () => {
  it('devuelve el JSON de una respuesta correcta y envía el cuerpo como JSON', async () => {
    const api = simularApi({ 'POST /api/x': { status: 201, cuerpo: { id: 7 } } });
    await expect(pedir('/api/x', { metodo: 'POST', cuerpo: { a: 1 } })).resolves.toEqual({ id: 7 });

    const opciones = api.mock.calls[0]![1]!;
    expect(opciones.body).toBe('{"a":1}');
    expect(opciones.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(opciones.credentials).toBe('same-origin');
  });

  it('un 204 sin cuerpo devuelve undefined', async () => {
    simularApi({ 'POST /api/auth/logout': { status: 204 } });
    await expect(pedir('/api/auth/logout', { metodo: 'POST' })).resolves.toBeUndefined();
  });

  it('usa el mensaje y los detalles de la API (400 y 409)', async () => {
    simularApi({
      'POST /api/a': { status: 400, cuerpo: { error: 'Datos inválidos', detalles: { matricula: 'La matrícula es obligatoria', otro: 5 } } },
      'POST /api/b': { status: 409, cuerpo: { error: 'La matrícula ya está registrada' } },
    });
    const invalido = await errorDe(pedir('/api/a', { metodo: 'POST', cuerpo: {} }));
    expect(invalido).toMatchObject({ status: 400, message: 'Datos inválidos', detalles: { matricula: 'La matrícula es obligatoria' } });
    expect(invalido.detalles).not.toHaveProperty('otro');

    const conflicto = await errorDe(pedir('/api/b', { metodo: 'POST', cuerpo: {} }));
    expect(conflicto).toMatchObject({ status: 409, message: 'La matrícula ya está registrada', detalles: {} });
  });

  it('si la API no manda mensaje, usa uno propio según el código', async () => {
    const casos: Array<[number, RegExp]> = [
      [403, /No tienes permiso/],
      [404, /No se encontró/],
      [409, /conflicto/],
      [429, /Demasiadas solicitudes/],
      [500, /error en el servidor/],
      [502, /error en el servidor/],
    ];
    for (const [status, mensaje] of casos) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>error del proxy</html>', { status })));
      const error = await errorDe(pedir('/api/x'));
      expect(error.status).toBe(status);
      expect(error.message).toMatch(mensaje);
    }
  });

  it('sin red: ErrorApi con status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = await errorDe(pedir('/api/x'));
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/No se pudo conectar/);
  });

  it('una petición cancelada no se convierte en error de red', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('cancelada', 'AbortError')));
    await expect(pedir('/api/x')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('avisa de la pérdida de sesión solo con un 401, y no si se pide lo contrario', async () => {
    const aviso = vi.fn();
    registrarPerdidaDeSesion(aviso);
    simularApi({
      'GET /api/401': { status: 401, cuerpo: { error: 'No autenticado' } },
      'GET /api/403': { status: 403, cuerpo: { error: 'Sin permiso' } },
      'GET /api/200': { status: 200, cuerpo: {} },
    });

    await pedir('/api/200');
    await errorDe(pedir('/api/403'));
    await errorDe(pedir('/api/401', { sinAvisoDeSesion: true }));
    expect(aviso).not.toHaveBeenCalled();

    await errorDe(pedir('/api/401'));
    expect(aviso).toHaveBeenCalledTimes(1);
  });
});

describe('rutaDeInicio', () => {
  it('acepta solo rutas internas', () => {
    expect(rutaDeInicio('Docente', '/estadisticas')).toBe('/estadisticas');
    expect(rutaDeInicio('Administrador', '/estudiantes')).toBe('/estudiantes');
    for (const externa of ['https://ejemplo.mx', '//ejemplo.mx', '/\\ejemplo.mx', 'asistencias', '', null, undefined, 3]) {
      expect(rutaDeInicio('Docente', externa)).toBe('/asistencias');
      expect(rutaDeInicio('Administrador', externa)).toBe('/estudiantes');
    }
  });
});
