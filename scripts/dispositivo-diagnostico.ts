/**
 * Revisa que un lector pueda hablar con la API, con los mismos datos que van
 * en firmware/secretos.h, y dice en lenguaje claro qué falla: la red, la
 * clave, el formato del UID, la credencial o la clase.
 *
 *   npm run dispositivo:diagnostico                         red, id y clave (no registra nada)
 *   npm run dispositivo:diagnostico -- <uid>                además revisa el formato del UID (no lo envía)
 *   npm run dispositivo:diagnostico -- <uid> --real         la petición completa del ESP32 (SÍ registra)
 *   npm run dispositivo:diagnostico -- --url http://192.168.1.50:3000 --id 1
 *
 * La dirección, el id y la clave salen de SIMULADOR_API_URL,
 * SIMULADOR_DISPOSITIVO_ID y SIMULADOR_DISPOSITIVO_CLAVE del .env; --url e
 * --id los reemplazan. La clave nunca se escribe en la línea de comandos (se
 * quedaría en el historial de la terminal) ni se muestra.
 */
import 'dotenv/config';
import { diagnosticarDispositivo, HOSTS_LOCALES, resumenDiagnostico, type EstadoPaso } from '../src/desarrollo/diagnosticoDispositivo.js';
import { direccionesDeRed } from '../src/utils/red.js';

function uso(mensaje?: string): never {
  if (mensaje) console.error(`Error: ${mensaje}\n`);
  console.error('Uso: npm run dispositivo:diagnostico -- [<uid>] [--real] [--url <dirección>] [--id <id>]');
  process.exit(2);
}

const args = process.argv.slice(2);
function valorDe(opcion: string): string | undefined {
  const posicion = args.indexOf(opcion);
  if (posicion === -1) return undefined;
  const valor = args[posicion + 1];
  if (!valor || valor.startsWith('--')) uso(`${opcion} necesita un valor`);
  args.splice(posicion, 2);
  return valor;
}

const url = valorDe('--url') ?? process.env.SIMULADOR_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const id = valorDe('--id') ?? process.env.SIMULADOR_DISPOSITIVO_ID ?? '1';
const real = args.includes('--real');
const restantes = args.filter((a) => a !== '--real');
if (args.includes('--clave')) uso('la clave no se pasa por la línea de comandos: ponla en SIMULADOR_DISPOSITIVO_CLAVE del .env');
const desconocida = restantes.find((a) => a.startsWith('--'));
if (desconocida) uso(`opción desconocida: ${desconocida}`);
if (restantes.length > 1) uso('solo se puede revisar un UID a la vez (si trae espacios, ponlo entre comillas)');
const uid = restantes[0];

const ICONOS: Record<EstadoPaso, string> = { ok: '✅', aviso: '⚠️ ', error: '❌', omitido: '⏭️ ' };

console.log(real ? 'Modo real: se envía la lectura completa y SÍ se registra la asistencia.\n' : 'Modo normal: no se registra ninguna asistencia.\n');

const resultado = await diagnosticarDispositivo({
  url,
  id,
  clave: process.env.SIMULADOR_DISPOSITIVO_CLAVE,
  uid,
  real,
  direccionesLocales: direccionesDeRed(),
});

for (const paso of resultado.pasos) {
  console.log(`${ICONOS[paso.estado]} ${paso.titulo}: ${paso.detalle}`);
  if (paso.solucion) console.log(`   → ${paso.solucion}`);
}
if (resultado.senal) console.log(`\nEl lector mostraría: ${resultado.senal.icono}  ${resultado.senal.descripcion}`);
console.log(`\n${resultado.problema === null ? '✅' : '❌'} ${resumenDiagnostico(resultado)}`);
const conectado = resultado.problema === null || resultado.problema === 'credencial' || resultado.problema === 'clase';
if (conectado && resultado.urlLecturas && !HOSTS_LOCALES.has(new URL(resultado.urlLecturas).hostname)) {
  console.log(`   En secretos.h: SECRETO_URL_SERVIDOR "${resultado.urlLecturas}" y SECRETO_DISPOSITIVO_ID "${id}".`);
}
if (conectado) {
  console.log('   Recuerda: probar desde esta misma computadora no pasa por su firewall. Para eso, prueba desde otro equipo (docs/prueba-con-dispositivo.md, sección 2).');
}
process.exitCode = resultado.problema === null ? 0 : 1;
