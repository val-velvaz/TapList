/**
 * Genera una clave nueva para un dispositivo, guarda su hash y la muestra UNA vez.
 *
 *   npm run dispositivo:clave -- <id_dispositivo>
 *
 * La clave anterior deja de funcionar de inmediato. Cópiala al firmware del
 * ESP32: no se puede recuperar, solo generar otra.
 */
import { randomBytes } from 'node:crypto';
import { cerrarPool } from '../src/db/pool.js';
import { asignarClave } from '../src/modules/dispositivos/dispositivos.service.js';
import { hashearContrasena } from '../src/utils/contrasena.js';

const idTexto = process.argv[2];
if (!idTexto || !/^[1-9]\d{0,8}$/.test(idTexto)) {
  console.error('Uso: npm run dispositivo:clave -- <id_dispositivo>');
  process.exit(1);
}

try {
  // 32 bytes aleatorios (256 bits) en base64url: 43 caracteres, sin símbolos raros para el firmware.
  const clave = randomBytes(32).toString('base64url');
  const existe = await asignarClave(Number(idTexto), await hashearContrasena(clave));
  if (!existe) {
    console.error(`No existe el dispositivo con id ${idTexto}.`);
    process.exitCode = 1;
  } else {
    console.log(`Clave nueva del dispositivo ${idTexto} (se muestra una sola vez; guárdala ahora):\n`);
    console.log(`  ${clave}\n`);
    console.log('Configúrala en el ESP32 como cabecera X-Dispositivo-Clave. La clave anterior ya no funciona.');
  }
} catch (error) {
  console.error('No se pudo asignar la clave:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await cerrarPool();
}
