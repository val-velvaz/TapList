import { pool } from '../../db/pool.js';
import { verificarContraHashFicticio, verificarContrasena } from '../../utils/contrasena.js';
import type { Rol, UsuarioSesion } from './auth.types.js';

interface FilaUsuario {
  id_usuario: number;
  nombre: string;
  apellidos: string;
  rol: Rol;
}

function aUsuarioSesion(fila: FilaUsuario): UsuarioSesion {
  return { id: fila.id_usuario, nombre: fila.nombre, apellidos: fila.apellidos, rol: fila.rol };
}

/**
 * Valida las credenciales (AD-01, pasos 4 a 6). Devuelve null si el correo
 * no existe, si la contraseña no coincide o si la cuenta está inactiva,
 * sin distinguir el motivo. En los tres casos se ejecuta una verificación
 * argon2 completa para que el tiempo de respuesta sea similar.
 */
export async function validarCredenciales(correo: string, contrasena: string): Promise<UsuarioSesion | null> {
  const { rows } = await pool.query<FilaUsuario & { contrasena_hash: string; activo: boolean }>(
    `SELECT id_usuario, nombre, apellidos, rol, contrasena_hash, activo
       FROM usuario
      WHERE correo = $1`,
    [correo],
  );
  const fila = rows[0];
  if (!fila) {
    await verificarContraHashFicticio(contrasena);
    return null;
  }

  const coincide = await verificarContrasena(fila.contrasena_hash, contrasena);
  return coincide && fila.activo ? aUsuarioSesion(fila) : null;
}

/** Usuario activo por id, o null. Lo usa requiereSesion en cada solicitud. */
export async function buscarUsuarioActivo(idUsuario: number): Promise<UsuarioSesion | null> {
  const { rows } = await pool.query<FilaUsuario>(
    `SELECT id_usuario, nombre, apellidos, rol
       FROM usuario
      WHERE id_usuario = $1 AND activo`,
    [idUsuario],
  );
  return rows[0] ? aUsuarioSesion(rows[0]) : null;
}
