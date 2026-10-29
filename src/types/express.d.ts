import type { UsuarioSesion } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      /** Lo asigna requiereSesion después de validar el token contra la BD. */
      usuario?: UsuarioSesion;
    }
  }
}

export {};
