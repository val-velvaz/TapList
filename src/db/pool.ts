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
});

pool.on('error', (error) => {
  // Un cliente inactivo perdió la conexión; el pool lo reemplaza solo.
  console.error('Error inesperado en el pool de PostgreSQL:', error.message);
});

export function cerrarPool(): Promise<void> {
  return pool.end();
}
