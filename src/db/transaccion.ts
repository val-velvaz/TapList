import type { PoolClient } from 'pg';
import { pool } from './pool.js';

/**
 * Ejecuta `fn` dentro de una transacción con un cliente dedicado del pool.
 * Hace COMMIT si `fn` termina bien y ROLLBACK si lanza; el error se relanza.
 * Todas las consultas de `fn` deben usar el `cliente` que recibe, no el pool.
 */
export async function conTransaccion<T>(fn: (cliente: PoolClient) => Promise<T>): Promise<T> {
  const cliente = await pool.connect();
  let errorDeConexion: Error | undefined;
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (error) {
    try {
      await cliente.query('ROLLBACK');
    } catch (errorRollback) {
      // Si ni siquiera se pudo revertir, la conexión no es confiable: se descarta.
      errorDeConexion = errorRollback as Error;
    }
    throw error;
  } finally {
    cliente.release(errorDeConexion);
  }
}
