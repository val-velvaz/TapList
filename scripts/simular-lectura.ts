/**
 * Simula una lectura del ESP32 sin tener el dispositivo.
 *
 *   npm run simular:lectura -- <uid> [--leido-en <ISO 8601>]
 *
 * Ejemplos:
 *   npm run simular:lectura -- 04A1B2C3
 *   npm run simular:lectura -- 04:a1:b2:c3 --leido-en 2026-11-09T07:03:00-06:00
 *
 * Usa SIMULADOR_API_URL, SIMULADOR_DISPOSITIVO_ID y SIMULADOR_DISPOSITIVO_CLAVE
 * del .env (por defecto, el dispositivo de la semilla). El servidor debe estar
 * corriendo (npm run dev).
 */
import 'dotenv/config';

const TIMEOUT_MS = 3000; // el mismo que se recomienda al firmware

interface Senal {
  icono: string;
  descripcion: string;
}

const SENALES = {
  verde: { icono: '🟢', descripcion: 'LED verde y 1 pitido corto' },
  amarillo: { icono: '🟡', descripcion: 'LED amarillo y 2 pitidos cortos' },
  rojo: { icono: '🔴', descripcion: 'LED rojo y 1 pitido largo' },
  azul: { icono: '🔵', descripcion: '3 destellos azules, sin sonido (no guardada)' },
} satisfies Record<string, Senal>;

/** Misma tabla que docs/contrato-dispositivo.md. */
function senalPara(status: number, cuerpo: { resultado?: string } | undefined): Senal {
  if (status === 200 && cuerpo?.resultado === 'ASISTENCIA') return SENALES.verde;
  if (status === 200 && cuerpo?.resultado === 'RETARDO') return SENALES.amarillo;
  if (status === 200 && cuerpo?.resultado === 'RECHAZADA') return SENALES.rojo;
  if (status === 400) return SENALES.rojo;
  return SENALES.azul;
}

function uso(mensaje?: string): never {
  if (mensaje) console.error(`Error: ${mensaje}\n`);
  console.error('Uso: npm run simular:lectura -- <uid> [--leido-en <ISO 8601 con zona horaria>]');
  process.exit(1);
}

const args = process.argv.slice(2);
const uid = args[0];
if (!uid || uid.startsWith('--')) uso('falta el UID');

let leidoEn: string | undefined;
const posicion = args.indexOf('--leido-en');
if (posicion !== -1) {
  leidoEn = args[posicion + 1];
  if (!leidoEn) uso('--leido-en necesita una fecha, p. ej. 2026-11-09T07:03:00-06:00');
}

const url = `${process.env.SIMULADOR_API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`}/api/dispositivo/lecturas`;
const idDispositivo = process.env.SIMULADOR_DISPOSITIVO_ID ?? '1';
const clave = process.env.SIMULADOR_DISPOSITIVO_CLAVE;
if (!clave) uso('falta SIMULADOR_DISPOSITIVO_CLAVE en el .env (la clave de prueba está en el README)');

const cuerpo = leidoEn ? { uid, leido_en: leidoEn } : { uid };
console.log(`→ POST ${url}`);
console.log(`  Dispositivo ${idDispositivo} · ${JSON.stringify(cuerpo)}`);

const inicio = performance.now();
try {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Dispositivo-Id': idDispositivo,
      'X-Dispositivo-Clave': clave,
    },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const ms = Math.round(performance.now() - inicio);
  const texto = await respuesta.text();
  let json: { resultado?: string } | undefined;
  try {
    json = JSON.parse(texto);
  } catch {
    json = undefined;
  }

  const senal = senalPara(respuesta.status, json);
  console.log(`← ${respuesta.status} en ${ms} ms · ${texto}`);
  console.log(`\n${senal.icono}  ${senal.descripcion}`);
} catch (error) {
  const motivo =
    error instanceof Error && error.name === 'TimeoutError'
      ? `sin respuesta en ${TIMEOUT_MS / 1000} s`
      : `sin conexión con la API (${error instanceof Error ? error.message : error})`;
  console.log(`← ${motivo}`);
  console.log(`\n${SENALES.azul.icono}  ${SENALES.azul.descripcion}`);
  console.log('   El ESP32 guardaría la lectura con su hora y la reenviaría con leido_en al reconectarse.');
  process.exitCode = 1;
}
