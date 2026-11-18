export type Rol = 'Docente' | 'Administrador';

/** El usuario como lo devuelve la API en /api/auth/login y /api/auth/me. */
export interface Usuario {
  id: number;
  nombre: string;
  apellidos: string;
  rol: Rol;
}

/** Pantalla inicial de cada rol (AD-01). Coincide con `redirigirA` de la API. */
export const INICIO_POR_ROL: Record<Rol, string> = {
  Docente: '/asistencias',
  Administrador: '/estudiantes',
};

/**
 * La ruta a la que la API pide ir después del login. Solo se aceptan rutas
 * internas de la web; cualquier otra cosa se cambia por el inicio del rol.
 */
export function rutaDeInicio(rol: Rol, redirigirA?: unknown): string {
  if (typeof redirigirA === 'string' && /^\/(?![/\\])/.test(redirigirA)) return redirigirA;
  return INICIO_POR_ROL[rol];
}
