import type { PoolClient } from 'pg';

export const ACCIONES_BITACORA = [
  'ALTA_ESTUDIANTE',
  'VINCULAR_CREDENCIAL',
  'REEMPLAZAR_CREDENCIAL',
  'BAJA_ESTUDIANTE',
] as const;
export type AccionBitacora = (typeof ACCIONES_BITACORA)[number];

/**
 * Escribe una acción del Administrador en la bitácora (RNF-03).
 *
 * Recibe el cliente de la transacción en curso a propósito: si esta
 * escritura falla, la transacción completa se revierte y el cambio no se
 * guarda. `entidadAfectada` identifica filas por id (p. ej. 'estudiante#12');
 * nunca debe llevar UID, nombres ni otros datos personales.
 */
export async function registrarEnBitacora(
  cliente: PoolClient,
  idUsuario: number,
  accion: AccionBitacora,
  entidadAfectada: string,
): Promise<void> {
  await cliente.query('INSERT INTO bitacora (id_usuario, accion, entidad_afectada) VALUES ($1, $2, $3)', [
    idUsuario,
    accion,
    entidadAfectada,
  ]);
}
