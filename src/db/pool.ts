import pg from 'pg';
import { baseDatos, env } from '../config/env.js';

// Pool único de conexiones para toda la aplicación.
export const pool = new pg.Pool({
  host: env.PGHOST,
  port: env.PGPORT,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: baseDatos,
  max: 10,
  // Cada sesión usa la zona horaria de la escuela, para que current_date y
  // los ::date en SQL (p. ej. las fechas de inscripcion_grupo) sean el día de
  // la escuela y no el del servidor de base de datos.
  options: `-c timezone=${env.ZONA_HORARIA_ESCUELA}`,
});

pool.on('error', (error) => {
  // Un cliente inactivo perdió la conexión; el pool lo reemplaza solo.
  console.error('Error inesperado en el pool de PostgreSQL:', error.message);
});

export function cerrarPool(): Promise<void> {
  return pool.end();
}
