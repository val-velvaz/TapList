import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pedir } from '../api/cliente';
import { ADMIN, API_P2_VACIA, DOCENTE, llamadas, montar, simularApi, SIN_SESION } from './ayudas';

const ruta = () => screen.getByTestId('ruta-actual').textContent;
const conSesion = (usuario: typeof DOCENTE) => ({ status: 200, cuerpo: { usuario } });

describe('Rutas protegidas', () => {
  it('sin sesión, cualquier pantalla protegida manda al login', async () => {
    for (const protegida of ['/asistencias', '/estadisticas', '/estudiantes', '/estudiantes/nuevo', '/']) {
      simularApi({ 'GET /api/auth/me': SIN_SESION });
      const { unmount } = montar(protegida);
      await waitFor(() => expect(ruta(), protegida).toBe('/login'));
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument();
      unmount();
    }
  });

  it('con la sesión abierta, entra directo a su pantalla sin pasar por el login', async () => {
    simularApi({ 'GET /api/auth/me': conSesion(DOCENTE) });
    montar('/estadisticas');

    expect(await screen.findByRole('heading', { name: 'Estadísticas de asistencia' })).toBeInTheDocument();
    expect(ruta()).toBe('/estadisticas');
    expect(screen.getByRole('link', { name: 'Estadísticas' })).toHaveClass('menu__enlace--activo');
    expect(screen.getByRole('link', { name: 'Asistencias' })).not.toHaveClass('menu__enlace--activo');
  });

  it('con la sesión abierta, «/» y «/login» llevan al inicio de cada rol', async () => {
    for (const [usuario, inicio] of [[DOCENTE, '/asistencias'], [ADMIN, '/estudiantes']] as const) {
      for (const entrada of ['/', '/login']) {
        simularApi({ ...API_P2_VACIA, 'GET /api/auth/me': conSesion(usuario) });
        const { unmount } = montar(entrada);
        await waitFor(() => expect(ruta(), `${usuario.rol} en ${entrada}`).toBe(inicio));
        unmount();
      }
    }
  });

  it('un Docente en una pantalla del Administrador ve «Sin permiso», no la pantalla', async () => {
    simularApi({ 'GET /api/auth/me': conSesion(DOCENTE) });
    montar('/estudiantes');

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Gestión de estudiantes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mi pantalla de inicio' })).toHaveAttribute('href', '/asistencias');
  });

  it('un Administrador en una pantalla del Docente ve «Sin permiso»', async () => {
    simularApi({ 'GET /api/auth/me': conSesion(ADMIN) });
    montar('/asistencias');

    expect(await screen.findByRole('heading', { name: 'Sin permiso' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Consulta de asistencias' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mi pantalla de inicio' })).toHaveAttribute('href', '/estudiantes');
  });

  it('una dirección que no existe muestra «Página no encontrada»', async () => {
    simularApi({ 'GET /api/auth/me': SIN_SESION });
    montar('/no-existe');
    expect(await screen.findByRole('heading', { name: 'Página no encontrada' })).toBeInTheDocument();
  });

  it('mientras se consulta la sesión no se muestra ni el login ni la pantalla', async () => {
    let responder!: (respuesta: Response) => void;
    const pendiente = new Promise<Response>((resolver) => (responder = resolver));
    const api = simularApi(API_P2_VACIA);
    api.mockReturnValueOnce(pendiente);
    montar('/asistencias');

    expect(screen.getByText('Cargando…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Consulta de asistencias' })).not.toBeInTheDocument();

    responder(new Response(JSON.stringify({ usuario: DOCENTE }), { status: 200 }));
    expect(await screen.findByRole('heading', { name: 'Consulta de asistencias' })).toBeInTheDocument();
  });
});

describe('Cierre y pérdida de la sesión', () => {
  it('«Cerrar sesión» llama a la API y regresa al login', async () => {
    const api = simularApi({ ...API_P2_VACIA, 'GET /api/auth/me': conSesion(DOCENTE), 'POST /api/auth/logout': { status: 204 } });
    montar('/asistencias');
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cerrar sesión' }));

    await waitFor(() => expect(ruta()).toBe('/login'));
    expect(llamadas(api, 'POST /api/auth/logout')).toHaveLength(1);
    expect(screen.queryByTestId('usuario-actual')).not.toBeInTheDocument();
    expect(screen.queryByText('Tu sesión terminó. Inicia sesión de nuevo.')).not.toBeInTheDocument();
  });

  it('si el cierre falla por la red, la web igual deja de mostrar la sesión', async () => {
    const api = simularApi({ 'GET /api/auth/me': conSesion(ADMIN) });
    montar('/estudiantes');
    const boton = await screen.findByRole('button', { name: 'Cerrar sesión' });
    api.mockRejectedValue(new TypeError('Failed to fetch'));
    await userEvent.setup().click(boton);

    await waitFor(() => expect(ruta()).toBe('/login'));
  });

  it('un 401 en cualquier llamada posterior manda al login y avisa que la sesión terminó', async () => {
    simularApi({ ...API_P2_VACIA, 'GET /api/auth/me': conSesion(DOCENTE), 'GET /api/otra': SIN_SESION });
    montar('/asistencias');
    await screen.findByText('Mostrando 0 de 0 registros');

    await expect(pedir('/api/otra')).rejects.toMatchObject({ status: 401 });

    await waitFor(() => expect(ruta()).toBe('/login'));
    expect(screen.getByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeInTheDocument();
  });

  it('un 403 o un 404 no cierran la sesión', async () => {
    simularApi({
      ...API_P2_VACIA,
      'GET /api/auth/me': conSesion(DOCENTE),
      'GET /api/estudiantes': { status: 403, cuerpo: { error: 'No tienes permiso' } },
      'GET /api/asistencias/9': { status: 404, cuerpo: { error: 'No encontrado' } },
    });
    montar('/asistencias');
    await screen.findByRole('heading', { name: 'Consulta de asistencias' });

    await expect(pedir('/api/estudiantes')).rejects.toMatchObject({ status: 403 });
    await expect(pedir('/api/asistencias/9')).rejects.toMatchObject({ status: 404 });
    expect(ruta()).toBe('/asistencias');
    expect(screen.getByTestId('usuario-actual')).toBeInTheDocument();
  });
});
