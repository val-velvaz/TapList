/**
 * Prepara la base de datos: la crea, corre las migraciones y carga la semilla.
 *
 *   npm run db:setup                 base de desarrollo (PGDATABASE)
 *   npm run db:setup -- --reset      la borra y la crea de nuevo
 *   npm run db:setup:test            base de pruebas (PGDATABASE_TEST), siempre se recrea
 */
import 'dotenv/config';
import { prepararBase } from '../db/preparar-base.js';

const args = new Set(process.argv.slice(2));
const esPrueba = args.has('--test');
const nombre = esPrueba ? process.env.PGDATABASE_TEST : process.env.PGDATABASE;

if (!nombre) {
  console.error(`Falta ${esPrueba ? 'PGDATABASE_TEST' : 'PGDATABASE'} en el archivo .env`);
  process.exit(1);
}

try {
  const ejecutados = await prepararBase(nombre, { reiniciar: esPrueba || args.has('--reset'), sembrar: true });
  console.log(`Base "${nombre}" lista. Archivos ejecutados:`);
  for (const archivo of ejecutados) console.log(`  - ${archivo}`);
} catch (error) {
  console.error(`No se pudo preparar la base "${nombre}":`, error instanceof Error ? error.message : error);
  process.exit(1);
}
