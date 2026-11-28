/**
 * SOLO DESARROLLO. Prepara una clase del grupo D01 que empieza en unos minutos,
 * para probar un lector ESP32 real (ver docs/prueba-con-dispositivo.md).
 *
 *   npm run dev:clase-ahora                 empieza en 5 minutos
 *   npm run dev:clase-ahora -- --minutos 0  empieza ya
 *
 * Si la clase de prueba ya existe, la mueve y borra sus lecturas, así que se
 * puede correr cada vez que se quiera repetir la prueba. Se niega a correr con
 * NODE_ENV=production.
 */
import 'dotenv/config';
import { cerrarPool } from '../src/db/pool.js';
import { DOCENTE_PRUEBA, ErrorDesarrollo, GRUPO_PRUEBA, MATERIA_PRUEBA, prepararClaseAhora } from '../src/desarrollo/pruebaDispositivo.js';

const args = process.argv.slice(2);
const posicion = args.indexOf('--minutos');
const minutos = posicion === -1 ? 5 : Number(args[posicion + 1]);

try {
  const clase = await prepararClaseAhora({ minutos });
  console.log(`«${MATERIA_PRUEBA}» del grupo ${GRUPO_PRUEBA} (docente ${DOCENTE_PRUEBA})`);
  console.log(`  Hoy ${clase.fecha}, empieza a las ${clase.horaInicio}.`);
  if (clase.lecturasBorradas) {
    const n = clase.lecturasBorradas;
    console.log(`  Se ${n === 1 ? 'borró 1 lectura anterior' : `borraron ${n} lecturas anteriores`} de esta clase.`);
  }
  console.log('');
  console.log('Qué debe mostrar el lector con una credencial vinculada a un estudiante de D01:');
  console.log(`  🟢 Asistencia  de ${clase.abre} a ${clase.asistenciaHasta}`);
  console.log(`  🟡 Retardo     de ${clase.retardoDesde} a ${clase.cierra}`);
  console.log(`  🔴 Rechazada   antes de ${clase.abre} o después de ${clase.cierra} (sin clase), o con una tarjeta no vinculada`);
  console.log('');
  console.log(`En la web (P2), quien no ha registrado aparece como «Pendiente» y pasa a «Falta» después de las ${clase.cierra}.`);
  if (clase.choques.length) {
    console.log('');
    console.log(`⚠️  Se cruza con: ${clase.choques.join(', ')}. Una lectura puede irse a esa clase; usa --minutos para moverla.`);
  }
} catch (error) {
  console.error(error instanceof ErrorDesarrollo ? error.message : error);
  process.exitCode = 1;
} finally {
  await cerrarPool();
}
