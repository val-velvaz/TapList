import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env, esProduccion } from '../config/env.js';

export const NOMBRE_COOKIE_SESION = 'taplist_sesion';

const duracionSegundos = Math.round(env.JWT_EXPIRACION_HORAS * 3600);

/**
 * Opciones de la cookie de sesión. `secure` solo se activa en producción,
 * porque en desarrollo y en pruebas el servidor corre en HTTP sin TLS.
 */
export function opcionesCookieSesion(): CookieOptions {
  return {
    httpOnly: true,
    secure: esProduccion,
    sameSite: 'strict',
    path: '/',
    maxAge: duracionSegundos * 1000,
  };
}

/** El token solo lleva el id del usuario; el rol se lee de la BD en cada solicitud (RF-09). */
export function firmarTokenSesion(idUsuario: number): string {
  return jwt.sign({}, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(idUsuario),
    expiresIn: duracionSegundos,
  });
}

/** Devuelve el id del usuario o null si el token no es válido o ya expiró. */
export function verificarTokenSesion(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    const id = typeof payload === 'object' ? Number(payload.sub) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}
