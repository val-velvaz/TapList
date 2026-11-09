import type { UsuarioSesion } from '../modules/auth/auth.types.js';
import type { DispositivoAutenticado } from '../modules/dispositivos/dispositivos.service.js';

declare global {
  namespace Express {
    interface Request {
      /** Lo asigna requiereSesion después de validar el token contra la BD. */
      usuario?: UsuarioSesion;
      /** Lo asigna requiereDispositivo después de validar su clave contra la BD. */
      dispositivo?: DispositivoAutenticado;
    }
  }
}

export {};
