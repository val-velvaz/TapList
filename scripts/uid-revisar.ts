/**
 * Revisa el formato de un UID antes de vincular credenciales reales.
 *
 *   npm run uid:revisar -- <valor> [--comparar <otro>]
 *
 * Ejemplos:
 *   npm run uid:revisar -- 04:a1:b2:c3
 *   npm run uid:revisar -- 0078912345                    (¿decimal?)
 *   npm run uid:revisar -- C3B2A104 --comparar 04A1B2C3  (¿bytes invertidos?)
 *
 * Sirve para comparar lo que entrega el ESP32 (en modo depuración) con lo que
 * entrega un lector USB de escritorio para la MISMA tarjeta. No se conecta a
 * la API ni a la base, y no guarda nada. Si el valor trae espacios, ponlo
 * entre comillas.
 *
 * Muestra el UID completo en la terminal: úsalo solo con tarjetas de prueba o
 * en una terminal que nadie más vea (RNF-06).
 */
import { analizarUid, compararUids } from '../src/utils/uid.js';

function uso(mensaje?: string): never {
  if (mensaje) console.error(`Error: ${mensaje}\n`);
  console.error('Uso: npm run uid:revisar -- <valor> [--comparar <otro>]');
  process.exit(2);
}

const args = process.argv.slice(2);
const valor = args[0];
if (!valor || valor.startsWith('--')) uso('falta el valor a revisar');

let referencia: string | undefined;
const posicion = args.indexOf('--comparar');
if (posicion !== -1) {
  referencia = args[posicion + 1];
  if (!referencia) uso('--comparar necesita el otro UID');
}

function mostrar(titulo: string, entrada: string): boolean {
  const analisis = analizarUid(entrada);
  console.log(`${titulo}: ${entrada}`);
  if (analisis.valido) {
    console.log(`  ✅ Válido. Formato canónico: ${analisis.normalizado}`);
    console.log(`     ${analisis.bytes.length} bytes: ${analisis.bytes.join(' ')}`);
  } else {
    console.log('  ❌ La API lo rechazaría (400):');
    for (const problema of analisis.problemas) console.log(`     - ${problema}`);
  }
  for (const aviso of analisis.avisos) console.log(`  ⚠️  ${aviso}`);
  console.log('');
  return analisis.valido;
}

const valido = mostrar('Valor', valor);

if (referencia !== undefined) {
  mostrar('Referencia', referencia);
  const { relacion, explicacion } = compararUids(valor, referencia);
  console.log(`Comparación: ${relacion === 'iguales' ? '✅' : relacion === 'distintos' ? '❔' : '⚠️ '} ${explicacion}`);
  process.exit(valido && relacion === 'iguales' ? 0 : 1);
}

process.exit(valido ? 0 : 1);
