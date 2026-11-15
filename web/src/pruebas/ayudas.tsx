import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { ProveedorSesion } from '../sesion/ContextoSesion';
import type { Usuario } from '../sesion/tipos';

export const DOCENTE: Usuario = { id: 2, nombre: 'Rosa', apellidos: 'Navarro', rol: 'Docente' };
export const ADMIN: Usuario = { id: 1, nombre: 'Admin', apellidos: 'Control Escolar', rol: 'Administrador' };

type Respuesta = { status: number; cuerpo?: unknown } | (() => { status: number; cuerpo?: unknown });

/**
 * Sustituye `fetch` por una API de mentira: a cada «MÉTODO ruta» le toca una
 * respuesta. Una llamada que no esté en la lista hace fallar la prueba.
 */
export function simularApi(rutas: Record<string, Respuesta>) {
  const espia = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const clave = `${opciones?.method ?? 'GET'} ${String(entrada)}`;
    const definida = rutas[clave];
    if (!definida) throw new Error(`Llamada inesperada a la API: ${clave}`);
    const { status, cuerpo } = typeof definida === 'function' ? definida() : definida;
    return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', espia);
  return espia;
}

/** Las llamadas hechas a una ruta, con su cuerpo ya convertido de JSON. */
export function llamadas(espia: ReturnType<typeof simularApi>, clave: string) {
  return espia.mock.calls
    .filter(([entrada, opciones]) => `${opciones?.method ?? 'GET'} ${String(entrada)}` === clave)
    .map(([, opciones]) => ({ opciones, cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : undefined }));
}

export const SIN_SESION = { status: 401, cuerpo: { error: 'No autenticado' } };

function RutaActual() {
  return <output data-testid="ruta-actual">{useLocation().pathname}</output>;
}

/** Monta la aplicación completa en la ruta indicada. */
export function montar(ruta: string) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
        <RutaActual />
      </ProveedorSesion>
    </MemoryRouter>,
  );
}
