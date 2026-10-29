import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

// Parámetros mínimos recomendados por OWASP para argon2id (19 MiB, 2 iteraciones).
const OPCIONES_ARGON2 = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashearContrasena(contrasena: string): Promise<string> {
  return argon2.hash(contrasena, OPCIONES_ARGON2);
}

/** Devuelve false ante cualquier error (por ejemplo, un hash mal formado) en lugar de lanzar. */
export async function verificarContrasena(hash: string, contrasena: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, contrasena);
  } catch {
    return false;
  }
}

// Hash de una contraseña aleatoria que nadie conoce. Se verifica contra él
// cuando el correo no existe, para que esa respuesta tarde lo mismo que una
// contraseña incorrecta y no revele qué correos están registrados.
// Se calcula al cargar el módulo para que ni el primer intento tarde distinto.
const hashFicticio = hashearContrasena(randomBytes(32).toString('hex'));

export async function verificarContraHashFicticio(contrasena: string): Promise<false> {
  await verificarContrasena(await hashFicticio, contrasena);
  return false;
}
