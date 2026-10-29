import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { cerrarPool } from '../src/db/pool.js';
import { reiniciarLimitesLogin } from '../src/middleware/limiteIntentos.js';
import {
  CONTRASENA_ADMIN,
  CONTRASENA_DOCENTE,
  CORREO_ADMIN,
  CORREO_DOCENTE,
  CORREO_INACTIVO,
} from './datos.js';

const app = crearApp();
const ERROR_GENERICO = { error: 'Correo o contraseña incorrectos' };

const login = (correo: unknown, contrasena: unknown) =>
  request(app).post('/api/auth/login').send({ correo, contrasena });

beforeEach(() => reiniciarLimitesLogin());
afterAll(() => cerrarPool());

describe('POST /api/auth/login', () => {
  it('1. Administrador con credenciales correctas: 200 y redirige a /estudiantes', async () => {
    const res = await login(CORREO_ADMIN, CONTRASENA_ADMIN);

    expect(res.status).toBe(200);
    expect(res.body.redirigirA).toBe('/estudiantes');
    expect(res.body.usuario).toEqual({
      id: expect.any(Number),
      nombre: 'Laura',
      apellidos: 'Méndez Ríos',
      rol: 'Administrador',
    });
    // La respuesta nunca incluye el hash ni el correo de otros usuarios.
    expect(JSON.stringify(res.body)).not.toMatch(/argon2|hash/i);

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/^taplist_sesion=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    // NODE_ENV=test: la bandera Secure solo se activa en producción.
    expect(cookie).not.toMatch(/Secure/);
  });

  it('2. Docente con credenciales correctas: 200 y redirige a /asistencias', async () => {
    const res = await login(CORREO_DOCENTE, CONTRASENA_DOCENTE);

    expect(res.status).toBe(200);
    expect(res.body.redirigirA).toBe('/asistencias');
    expect(res.body.usuario.rol).toBe('Docente');
  });

  it('acepta el correo con mayúsculas y espacios alrededor', async () => {
    const res = await login(`  ${CORREO_DOCENTE.toUpperCase()} `, CONTRASENA_DOCENTE);
    expect(res.status).toBe(200);
  });

  it('3. Contraseña incorrecta: 401 con el mensaje genérico y sin cookie', async () => {
    const res = await login(CORREO_ADMIN, 'ContrasenaEquivocada1!');

    expect(res.status).toBe(401);
    expect(res.body).toEqual(ERROR_GENERICO);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('4. Correo inexistente: 401 con exactamente el mismo mensaje', async () => {
    const res = await login('nadie.registrado@academicos.udg.mx', CONTRASENA_ADMIN);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(ERROR_GENERICO);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('5. Cuenta inactiva (aun con la contraseña correcta): 401 con el mensaje genérico', async () => {
    const res = await login(CORREO_INACTIVO, CONTRASENA_DOCENTE);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(ERROR_GENERICO);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  describe('6. Validación de forma: 400 indicando qué falta', () => {
    it('campos vacíos', async () => {
      const res = await login('', '');
      expect(res.status).toBe(400);
      expect(res.body.detalles).toEqual({
        correo: 'El correo es obligatorio',
        contrasena: 'La contraseña es obligatoria',
      });
    });

    it('campos ausentes', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(Object.keys(res.body.detalles)).toEqual(['correo', 'contrasena']);
    });

    it('correo con formato inválido', async () => {
      const res = await login('no-es-un-correo', 'algo');
      expect(res.status).toBe(400);
      expect(res.body.detalles).toEqual({ correo: 'El correo no tiene un formato válido' });
    });

    it('JSON mal formado', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"correo": ');
      expect(res.status).toBe(400);
    });
  });
});

describe('Sesión: /api/auth/me y /api/auth/logout', () => {
  it('7. Sin sesión, GET /api/auth/me responde 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('con un token alterado, GET /api/auth/me responde 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'taplist_sesion=token.falso.alterado');
    expect(res.status).toBe(401);
  });

  it('con sesión devuelve el usuario; después del logout vuelve a 401', async () => {
    const agente = request.agent(app);
    await agente.post('/api/auth/login').send({ correo: CORREO_DOCENTE, contrasena: CONTRASENA_DOCENTE }).expect(200);

    const me = await agente.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.usuario).toMatchObject({ nombre: 'Roberto', rol: 'Docente' });

    const salida = await agente.post('/api/auth/logout');
    expect(salida.status).toBe(204);
    expect(salida.headers['set-cookie']?.[0]).toMatch(/taplist_sesion=;.*Expires=Thu, 01 Jan 1970/);

    await agente.get('/api/auth/me').expect(401);
  });
});

describe('Control de acceso por rol (RF-09)', () => {
  const ruta = '/api/prueba/solo-administrador';

  it('8. Un Docente en una ruta con requiereRol("Administrador") recibe 403', async () => {
    const agente = request.agent(app);
    await agente.post('/api/auth/login').send({ correo: CORREO_DOCENTE, contrasena: CONTRASENA_DOCENTE }).expect(200);

    const res = await agente.get(ruta);
    expect(res.status).toBe(403);
  });

  it('un Administrador sí entra a la misma ruta', async () => {
    const agente = request.agent(app);
    await agente.post('/api/auth/login').send({ correo: CORREO_ADMIN, contrasena: CONTRASENA_ADMIN }).expect(200);

    await agente.get(ruta).expect(200, { ok: true, rol: 'Administrador' });
  });

  it('sin sesión, la ruta protegida responde 401 (no 403)', async () => {
    await request(app).get(ruta).expect(401);
  });
});

describe('Límite de intentos', () => {
  const max = env.LOGIN_MAX_INTENTOS;

  it(`9. Tras ${max} intentos fallidos con el mismo correo responde 429, incluso con la contraseña correcta`, async () => {
    for (let i = 0; i < max; i++) {
      await login(CORREO_ADMIN, `incorrecta-${i}`).expect(401);
    }
    const res = await login(CORREO_ADMIN, CONTRASENA_ADMIN);
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('el contador por correo se reinicia con un login exitoso', async () => {
    for (let i = 0; i < max - 1; i++) await login(CORREO_DOCENTE, 'incorrecta').expect(401);
    await login(CORREO_DOCENTE, CONTRASENA_DOCENTE).expect(200);
    // Si no se hubiera reiniciado, este intento ya superaría el límite.
    for (let i = 0; i < max - 1; i++) await login(CORREO_DOCENTE, 'incorrecta').expect(401);
    await login(CORREO_DOCENTE, CONTRASENA_DOCENTE).expect(200);
  });

  it(`por IP: tras ${env.LOGIN_MAX_INTENTOS_IP} intentos fallidos con correos distintos responde 429`, async () => {
    for (let i = 0; i < env.LOGIN_MAX_INTENTOS_IP; i++) {
      await login(`inexistente${i}@academicos.udg.mx`, 'x').expect(401);
    }
    await login(CORREO_ADMIN, CONTRASENA_ADMIN).expect(429);
  });
});
