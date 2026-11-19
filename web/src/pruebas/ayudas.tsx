import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App';
import { ProveedorSesion } from '../sesion/ContextoSesion';
import type { Usuario } from '../sesion/tipos';

export const DOCENTE: Usuario = { id: 2, nombre: 'Rosa', apellidos: 'Navarro', rol: 'Docente' };
export const ADMIN: Usuario = { id: 1, nombre: 'Admin', apellidos: 'Control Escolar', rol: 'Administrador' };

type RespuestaSimulada = { status: number; cuerpo?: unknown; encabezados?: Record<string, string>; binario?: BlobPart };
type Respuesta = RespuestaSimulada | ((url: URL) => RespuestaSimulada);

/**
 * Sustituye `fetch` por una API de mentira: a cada «MÉTODO ruta» le toca una
 * respuesta. Primero se busca la ruta exacta, con su consulta; si no está, la
 * ruta sin consulta (la función recibe la URL para leer los parámetros). Una
 * llamada que no esté en la lista hace fallar la prueba.
 */
export function simularApi(rutas: Record<string, Respuesta>) {
  const espia = vi.fn(async (entrada: RequestInfo | URL, opciones?: RequestInit) => {
    const metodo = opciones?.method ?? 'GET';
    const url = new URL(String(entrada), 'http://localhost');
    const definida = rutas[`${metodo} ${String(entrada)}`] ?? rutas[`${metodo} ${url.pathname}`];
    if (!definida) throw new Error(`Llamada inesperada a la API: ${metodo} ${String(entrada)}`);
    const { status, cuerpo, encabezados, binario } = typeof definida === 'function' ? definida(url) : definida;
    const contenido = binario ?? (cuerpo === undefined ? null : JSON.stringify(cuerpo));
    return new Response(contenido, { status, headers: { 'Content-Type': 'application/json', ...encabezados } });
  });
  vi.stubGlobal('fetch', espia);
  return espia;
}

/** Las llamadas hechas a una ruta (sin contar su consulta), con su cuerpo ya convertido de JSON. */
export function llamadas(espia: ReturnType<typeof simularApi>, clave: string) {
  return espia.mock.calls
    .filter(([entrada, opciones]) => {
      const metodo = opciones?.method ?? 'GET';
      return `${metodo} ${String(entrada)}` === clave || `${metodo} ${new URL(String(entrada), 'http://localhost').pathname}` === clave;
    })
    .map(([entrada, opciones]) => ({
      url: new URL(String(entrada), 'http://localhost'),
      opciones,
      cuerpo: opciones?.body ? JSON.parse(String(opciones.body)) : undefined,
    }));
}

/** Respuestas vacías de P2, para las pruebas que solo entran a /asistencias. */
export const API_P2_VACIA: Record<string, Respuesta> = {
  'GET /api/asistencias/filtros': { status: 200, cuerpo: { grupos: [], clases: [] } },
  'GET /api/asistencias': { status: 200, cuerpo: { datos: [], pagina: 1, por_pagina: 20, total: 0, total_paginas: 0 } },
};

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
