import type { Request, Response } from 'express';
import { limitePorCorreo, MENSAJE_DEMASIADOS_INTENTOS } from '../../middleware/limiteIntentos.js';
import { HttpError } from '../../utils/HttpError.js';
import { firmarTokenSesion, NOMBRE_COOKIE_SESION, opcionesCookieSesion } from '../../utils/sesion.js';
import { esquemaLogin } from './auth.schemas.js';
import { validarCredenciales } from './auth.service.js';
import { RUTA_INICIO_POR_ROL } from './auth.types.js';

export const MENSAJE_CREDENCIALES_INCORRECTAS = 'Correo o contraseña incorrectos';

/** POST /api/auth/login */
export async function iniciarSesion(req: Request, res: Response): Promise<void> {
  const resultado = esquemaLogin.safeParse(req.body ?? {});
  if (!resultado.success) {
    // Un mensaje por campo: el primero que falló.
    const detalles: Record<string, string> = {};
    for (const issue of resultado.error.issues) {
      const campo = String(issue.path[0] ?? 'body');
      detalles[campo] ??= issue.message;
    }
    throw new HttpError(400, 'Datos de inicio de sesión inválidos', detalles);
  }
  const { correo, contrasena } = resultado.data;

  const segundos = limitePorCorreo.segundosBloqueado(correo);
  if (segundos > 0) {
    res.setHeader('Retry-After', String(segundos));
    throw new HttpError(429, MENSAJE_DEMASIADOS_INTENTOS);
  }

  const usuario = await validarCredenciales(correo, contrasena);
  if (!usuario) {
    limitePorCorreo.registrarFallo(correo);
    throw new HttpError(401, MENSAJE_CREDENCIALES_INCORRECTAS);
  }

  limitePorCorreo.reiniciar(correo);
  res.cookie(NOMBRE_COOKIE_SESION, firmarTokenSesion(usuario.id), opcionesCookieSesion());
  res.status(200).json({ usuario, redirigirA: RUTA_INICIO_POR_ROL[usuario.rol] });
}

/** POST /api/auth/logout — idempotente: responde 204 haya o no sesión. */
export function cerrarSesion(_req: Request, res: Response): void {
  res.clearCookie(NOMBRE_COOKIE_SESION, { ...opcionesCookieSesion(), maxAge: undefined });
  res.status(204).end();
}

/** GET /api/auth/me — requiere sesión. */
export function usuarioActual(req: Request, res: Response): void {
  res.status(200).json({ usuario: req.usuario });
}
