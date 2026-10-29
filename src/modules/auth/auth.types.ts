export const ROLES = ['Docente', 'Administrador'] as const;
export type Rol = (typeof ROLES)[number];

/** Datos del usuario que se exponen al cliente y viajan en req.usuario. */
export interface UsuarioSesion {
  id: number;
  nombre: string;
  apellidos: string;
  rol: Rol;
}

/** Pantalla inicial de cada rol según el diagrama de actividades AD-01. */
export const RUTA_INICIO_POR_ROL: Record<Rol, string> = {
  Administrador: '/estudiantes',
  Docente: '/asistencias',
};
