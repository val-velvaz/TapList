/**
 * SOLO DESARROLLO. Vincula una tarjeta real a un estudiante de prueba del grupo
 * D01, para probar un lector ESP32 (ver docs/prueba-con-dispositivo.md).
 *
 *   npm run dev:vincular                                  lista los estudiantes de D01
 *   npm run dev:vincular -- <uid> --matricula 220000003   vincula la tarjeta a ese estudiante
 *   npm run dev:vincular -- <uid> --matricula ... --forzar   aunque uid:revisar dé avisos
 *
 * Antes revisa el formato del UID igual que `npm run uid:revisar`. Si el
 * estudiante ya tenía credencial, la reemplaza (queda en el historial y en la
 * bitácora). Se niega a correr con NODE_ENV=production.
 */
import 'dotenv/config';
import { cerrarPool } from '../src/db/pool.js';
import { ErrorDesarrollo, estudiantesDePrueba, GRUPO_PRUEBA, vincularTarjetaDePrueba } from '../src/desarrollo/pruebaDispositivo.js';

const args = process.argv.slice(2);
const uid = args[0] && !args[0].startsWith('--') ? args[0] : undefined;
const posicion = args.indexOf('--matricula');
const matricula = posicion === -1 ? undefined : args[posicion + 1];

try {
  if (!uid || !matricula) {
    if (uid && !matricula) console.error('Falta --matricula. Elige un estudiante de la lista:\n');
    console.log(`Estudiantes activos de ${GRUPO_PRUEBA}:`);
    for (const e of await estudiantesDePrueba()) {
      console.log(`  ${e.matricula}  ${e.nombre.padEnd(26)} ${e.uid ?? 'sin credencial'}`);
    }
    console.log('\nUso: npm run dev:vincular -- <uid> --matricula <matrícula> [--forzar]');
    if (uid && !matricula) process.exitCode = 2;
  } else {
    const r = await vincularTarjetaDePrueba({ uid, matricula, forzar: args.includes('--forzar') });
    for (const aviso of r.analisis.avisos) console.log(`⚠️  ${aviso}`);
    const mensajes = {
      vinculada: `✅ La tarjeta ${r.uid} quedó vinculada a ${r.estudiante}.`,
      reemplazada: `✅ La tarjeta ${r.uid} quedó vinculada a ${r.estudiante}; su credencial anterior quedó inactiva en el historial.`,
      sin_cambios: `✅ La tarjeta ${r.uid} ya estaba vinculada a ${r.estudiante}; no se cambió nada.`,
    };
    console.log(mensajes[r.accion]);
  }
} catch (error) {
  console.error(error instanceof ErrorDesarrollo ? error.message : error);
  process.exitCode = 1;
} finally {
  await cerrarPool();
}
