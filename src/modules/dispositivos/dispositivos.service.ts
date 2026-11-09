import { pool } from '../../db/pool.js';
import { verificarContraHashFicticio, verificarContrasena } from '../../utils/contrasena.js';

/** Datos del dispositivo que viajan en req.dispositivo. */
export interface DispositivoAutenticado {
  id: number;
  nombreUbicacion: string;
}

export type ResultadoAutenticacion =
  | { tipo: 'valido'; dispositivo: DispositivoAutenticado }
  | { tipo: 'clave_invalida' }
  | { tipo: 'inactivo' };

/**
 * Valida el id y la clave de un dispositivo (AD-03, paso 2).
 * Un id inexistente, un dispositivo sin clave y una clave incorrecta dan el
 * mismo resultado, con una verificación argon2 completa en los tres casos.
 * El estado solo se revela si la clave es correcta.
 */
export async function autenticarDispositivo(id: number, clave: string): Promise<ResultadoAutenticacion> {
  const { rows } = await pool.query<{
    id_dispositivo: number;
    nombre_ubicacion: string;
    estado: string;
    clave_api_hash: string | null;
  }>(
    `SELECT id_dispositivo, nombre_ubicacion, estado, clave_api_hash
       FROM dispositivo
      WHERE id_dispositivo = $1`,
    [id],
  );
  const fila = rows[0];

  if (!fila?.clave_api_hash) {
    await verificarContraHashFicticio(clave);
    return { tipo: 'clave_invalida' };
  }
  if (!(await verificarContrasena(fila.clave_api_hash, clave))) return { tipo: 'clave_invalida' };
  if (fila.estado !== 'Activo') return { tipo: 'inactivo' };

  return { tipo: 'valido', dispositivo: { id: fila.id_dispositivo, nombreUbicacion: fila.nombre_ubicacion } };
}

/** AD-03, paso 3: marca la hora de la última conexión del dispositivo. */
export async function registrarConexion(idDispositivo: number): Promise<void> {
  await pool.query('UPDATE dispositivo SET ultima_conexion = now() WHERE id_dispositivo = $1', [idDispositivo]);
}

/** Guarda el hash de una clave nueva. Devuelve false si el dispositivo no existe. */
export async function asignarClave(idDispositivo: number, claveHash: string): Promise<boolean> {
  const { rowCount } = await pool.query('UPDATE dispositivo SET clave_api_hash = $2 WHERE id_dispositivo = $1', [
    idDispositivo,
    claveHash,
  ]);
  return rowCount === 1;
}
