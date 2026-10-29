import type { RequestHandler } from 'express';
import type { Rol } from '../modules/auth/auth.types.js';
import { HttpError } from '../utils/HttpError.js';

/**
 * Exige que el usuario de la sesión tenga uno de los roles indicados (RF-09).
 * Va siempre después de requiereSesion:
 *
 *   router.post('/', requiereSesion, requiereRol('Administrador'), crearEstudiante);
 */
export function requiereRol(...roles: [Rol, ...Rol[]]): RequestHandler {
  return (req, _res, next) => {
    if (!req.usuario) throw new HttpError(401, 'No has iniciado sesión o tu sesión expiró');
    if (!roles.includes(req.usuario.rol)) {
      throw new HttpError(403, 'No tienes permiso para realizar esta acción');
    }
    next();
  };
}
