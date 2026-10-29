import type { RequestHandler } from 'express';
import { buscarUsuarioActivo } from '../modules/auth/auth.service.js';
import { HttpError } from '../utils/HttpError.js';
import { NOMBRE_COOKIE_SESION, opcionesCookieSesion, verificarTokenSesion } from '../utils/sesion.js';

/**
 * Exige una sesión válida. Verifica la firma y la vigencia del JWT y, además,
 * vuelve a leer al usuario en la BD en cada solicitud: si la cuenta se
 * desactivó o cambió de rol, el cambio aplica de inmediato (RF-09).
 * Deja el usuario en req.usuario.
 */
export const requiereSesion: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[NOMBRE_COOKIE_SESION];
  const idUsuario = typeof token === 'string' ? verificarTokenSesion(token) : null;
  const usuario = idUsuario ? await buscarUsuarioActivo(idUsuario) : null;

  if (!usuario) {
    if (token) res.clearCookie(NOMBRE_COOKIE_SESION, { ...opcionesCookieSesion(), maxAge: undefined });
    throw new HttpError(401, 'No has iniciado sesión o tu sesión expiró');
  }

  req.usuario = usuario;
  next();
};
