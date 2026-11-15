import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ADMIN, DOCENTE, llamadas, montar, simularApi, SIN_SESION } from './ayudas';

const LOGIN = 'POST /api/auth/login';
const ruta = () => screen.getByTestId('ruta-actual').textContent;

async function llenarYEnviar(correo: string, contrasena: string) {
  const usuario = userEvent.setup();
  await usuario.type(await screen.findByLabelText('Correo institucional'), correo);
  await usuario.type(screen.getByLabelText('Contraseña'), contrasena);
  await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  return usuario;
}

describe('P1 · Inicio de sesión', () => {
  it('muestra los elementos del diseño', async () => {
    simularApi({ 'GET /api/auth/me': SIN_SESION });
    montar('/login');

    expect(await screen.findByRole('heading', { name: 'TapList' })).toBeInTheDocument();
    expect(screen.getByText('Sistema de asistencia escolar con NFC')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo institucional')).toHaveAttribute('placeholder', 'usuario@institucion.edu.mx');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Mostrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Aviso de privacidad' })).toHaveAttribute('href', '/aviso-de-privacidad');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un Docente entra y va a la ruta que indica la API (/asistencias)', async () => {
    const api = simularApi({
      'GET /api/auth/me': SIN_SESION,
      [LOGIN]: { status: 200, cuerpo: { usuario: DOCENTE, redirigirA: '/asistencias' } },
    });
    montar('/login');
    await llenarYEnviar('  rosa.navarro@academicos.udg.mx ', 'Secreta#123');

    await waitFor(() => expect(ruta()).toBe('/asistencias'));
    expect(screen.getByText('Panel docente')).toBeInTheDocument();
    expect(screen.getByTestId('usuario-actual')).toHaveTextContent('Rosa Navarro · Docente');
    expect(screen.getByRole('link', { name: 'Asistencias' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Estadísticas' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Estudiantes' })).not.toBeInTheDocument();

    // El correo va sin espacios, la contraseña tal cual y la cookie viaja en el mismo origen.
    const [llamada] = llamadas(api, LOGIN);
    expect(llamada!.cuerpo).toEqual({ correo: 'rosa.navarro@academicos.udg.mx', contrasena: 'Secreta#123' });
    expect(llamada!.opciones?.credentials).toBe('same-origin');
  });

  it('un Administrador entra y va a /estudiantes', async () => {
    simularApi({
      'GET /api/auth/me': SIN_SESION,
      [LOGIN]: { status: 200, cuerpo: { usuario: ADMIN, redirigirA: '/estudiantes' } },
    });
    montar('/login');
    await llenarYEnviar('admin@taplist.mx', 'Secreta#123');

    await waitFor(() => expect(ruta()).toBe('/estudiantes'));
    expect(screen.getByText('Administración')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Estudiantes' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Estadísticas' })).not.toBeInTheDocument();
  });

  it('si la API pide ir a un sitio externo, va al inicio del rol', async () => {
    for (const redirigirA of ['https://ejemplo.mx/robo', '//ejemplo.mx', '/\\ejemplo.mx', 42, undefined]) {
      simularApi({ 'GET /api/auth/me': SIN_SESION, [LOGIN]: { status: 200, cuerpo: { usuario: DOCENTE, redirigirA } } });
      const { unmount } = montar('/login');
      await llenarYEnviar('rosa@academicos.udg.mx', 'x');
      await waitFor(() => expect(ruta()).toBe('/asistencias'));
      unmount();
    }
  });

  it('credenciales incorrectas (401): muestra el mensaje genérico de la API, se queda en el login y borra la contraseña', async () => {
    simularApi({ 'GET /api/auth/me': SIN_SESION, [LOGIN]: { status: 401, cuerpo: { error: 'Correo o contraseña incorrectos' } } });
    montar('/login');
    await llenarYEnviar('rosa@academicos.udg.mx', 'incorrecta');

    expect(await screen.findByRole('alert')).toHaveTextContent('Correo o contraseña incorrectos');
    expect(ruta()).toBe('/login');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
    expect(screen.getByLabelText('Correo institucional')).toHaveValue('rosa@academicos.udg.mx');
    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
  });

  it('demasiados intentos (429): muestra el mensaje de la API', async () => {
    simularApi({
      'GET /api/auth/me': SIN_SESION,
      [LOGIN]: { status: 429, cuerpo: { error: 'Demasiados intentos. Intenta de nuevo más tarde.' } },
    });
    montar('/login');
    await llenarYEnviar('rosa@academicos.udg.mx', 'x');
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos. Intenta de nuevo más tarde.');
  });

  it('datos inválidos según la API (400): muestra el mensaje junto a cada campo', async () => {
    simularApi({
      'GET /api/auth/me': SIN_SESION,
      [LOGIN]: { status: 400, cuerpo: { error: 'Datos inválidos', detalles: { correo: 'El correo es demasiado largo' } } },
    });
    montar('/login');
    await llenarYEnviar('rosa@academicos.udg.mx', 'x');

    expect(await screen.findByText('El correo es demasiado largo')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo institucional')).toBeInvalid();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin red o con el servidor apagado: mensaje claro, sin quedar bloqueado', async () => {
    const api = simularApi({ 'GET /api/auth/me': SIN_SESION });
    montar('/login');
    await screen.findByLabelText('Correo institucional');
    api.mockRejectedValue(new TypeError('Failed to fetch'));
    await llenarYEnviar('rosa@academicos.udg.mx', 'x');

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeEnabled();
  });

  it('error del servidor (500): mensaje genérico', async () => {
    simularApi({ 'GET /api/auth/me': SIN_SESION, [LOGIN]: { status: 500, cuerpo: { error: 'Error interno del servidor' } } });
    montar('/login');
    await llenarYEnviar('rosa@academicos.udg.mx', 'x');
    expect(await screen.findByRole('alert')).toHaveTextContent('Error interno del servidor');
  });

  it('campos vacíos o correo mal escrito: avisa sin llamar a la API', async () => {
    const api = simularApi({ 'GET /api/auth/me': SIN_SESION });
    montar('/login');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('El correo es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument();

    await usuario.type(screen.getByLabelText('Correo institucional'), 'no-es-correo');
    await usuario.type(screen.getByLabelText('Contraseña'), 'x');
    await usuario.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(screen.getByText('El correo no tiene un formato válido')).toBeInTheDocument();
    expect(screen.queryByText('La contraseña es obligatoria')).not.toBeInTheDocument();

    expect(llamadas(api, LOGIN)).toHaveLength(0);
  });

  it('«Mostrar» enseña la contraseña y «Ocultar» la vuelve a esconder', async () => {
    simularApi({ 'GET /api/auth/me': SIN_SESION });
    montar('/login');
    const usuario = userEvent.setup();
    const campo = await screen.findByLabelText('Contraseña');
    await usuario.type(campo, 'Secreta#123');

    await usuario.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(campo).toHaveAttribute('type', 'text');
    await usuario.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveValue('Secreta#123');
  });

  it('«¿Olvidaste tu contraseña?» pide contactar al administrador, sin llamar a la API', async () => {
    const api = simularApi({ 'GET /api/auth/me': SIN_SESION });
    montar('/login');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('button', { name: '¿Olvidaste tu contraseña?' }));

    expect(screen.getByText('Para restablecer tu contraseña, contacta al administrador del sistema.')).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1); // solo la consulta inicial de la sesión
  });

  it('el enlace del aviso de privacidad abre su página sin pedir sesión', async () => {
    simularApi({ 'GET /api/auth/me': SIN_SESION });
    montar('/login');
    await userEvent.setup().click(await screen.findByRole('link', { name: 'Aviso de privacidad' }));

    expect(ruta()).toBe('/aviso-de-privacidad');
    expect(screen.getByRole('heading', { name: 'Aviso de privacidad' })).toBeInTheDocument();
  });

  it('no guarda nada de la sesión en el navegador', async () => {
    simularApi({ 'GET /api/auth/me': SIN_SESION, [LOGIN]: { status: 200, cuerpo: { usuario: DOCENTE, redirigirA: '/asistencias' } } });
    montar('/login');
    await llenarYEnviar('rosa@academicos.udg.mx', 'Secreta#123');
    await waitFor(() => expect(ruta()).toBe('/asistencias'));

    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });
});
