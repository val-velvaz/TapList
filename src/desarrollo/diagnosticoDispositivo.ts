/*
 * Diagnóstico de la conexión de un lector con la API (ver
 * docs/prueba-con-dispositivo.md). Lo usa `npm run dispositivo:diagnostico`.
 *
 * Hace, desde una computadora, la misma petición que hará el ESP32 con los
 * datos que van en firmware/secretos.h (dirección, id y clave) y explica en
 * lenguaje claro qué falla: la configuración, la red, la clave, el formato del
 * UID, la credencial o la clase.
 *
 *  - Modo normal (por defecto): envía la petición SIN UID. La API revisa la
 *    clave antes que el cuerpo, así que un 400 por «falta el UID» demuestra
 *    que la red y la clave funcionan, sin registrar ninguna asistencia.
 *  - Modo real (`real: true`): envía la petición completa del ESP32 con el
 *    UID; si la credencial y la clase son válidas, registra la asistencia.
 *
 * No toca la base de datos: solo habla con la API por HTTP. El UID se muestra
 * enmascarado y la clave nunca se muestra (RNF-06).
 */
import { analizarUid, enmascararUid } from '../utils/uid.js';

export const RUTA_LECTURAS = '/api/dispositivo/lecturas';
/** El mismo tiempo máximo que el contrato pide al firmware. */
export const TIMEOUT_MS = 3000;

export type EstadoPaso = 'ok' | 'aviso' | 'error' | 'omitido';

export interface Paso {
  titulo: string;
  estado: EstadoPaso;
  detalle: string;
  /** Qué hacer, cuando algo falla o hay un aviso. */
  solucion?: string;
}

/** Lo primero que falla, para decirlo en una línea (y para las pruebas). */
export type Problema = 'configuracion' | 'red' | 'ruta' | 'clave' | 'inactivo' | 'limite' | 'servidor' | 'uid' | 'credencial' | 'clase' | 'respuesta';

export interface Senal {
  icono: string;
  descripcion: string;
}

export const SENALES = {
  verde: { icono: '🟢', descripcion: 'LED verde y 1 pitido corto' },
  amarillo: { icono: '🟡', descripcion: 'LED amarillo y 2 pitidos cortos' },
  rojo: { icono: '🔴', descripcion: 'LED rojo y 1 pitido largo' },
  azul: { icono: '🔵', descripcion: '3 destellos azules, sin sonido (no guardada)' },
} satisfies Record<string, Senal>;

/** La señal que debe mostrar el lector; misma tabla que docs/contrato-dispositivo.md. */
export function senalPara(status: number | null, cuerpo: { resultado?: unknown } | undefined): Senal {
  if (status === 200 && cuerpo?.resultado === 'ASISTENCIA') return SENALES.verde;
  if (status === 200 && cuerpo?.resultado === 'RETARDO') return SENALES.amarillo;
  if (status === 200 && cuerpo?.resultado === 'RECHAZADA') return SENALES.rojo;
  if (status === 400) return SENALES.rojo;
  return SENALES.azul;
}

export interface OpcionesDiagnostico {
  /** Dirección de la API: completa (…/api/dispositivo/lecturas) o solo http://IP:puerto. */
  url: string;
  id: string;
  clave: string | undefined;
  uid?: string;
  /** Enviar la petición completa con el UID (registra la asistencia). */
  real?: boolean;
  timeoutMs?: number;
  /** Direcciones IPv4 de esta computadora, para sugerir la del ESP32. */
  direccionesLocales?: string[];
  fetch?: typeof fetch;
}

export interface ResultadoDiagnostico {
  pasos: Paso[];
  /** null si todo salió bien. */
  problema: Problema | null;
  /** Dirección a la que se envió (la que va en secretos.h). */
  urlLecturas: string | null;
  /** Señal que mostraría el ESP32 con esta respuesta (solo en modo real). */
  senal: Senal | null;
}

export const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '[::1]', '0.0.0.0']);

/** Completa la ruta si solo vino http://IP:puerto. Lanza un mensaje si no es una URL usable. */
function prepararUrl(entrada: string): { url: URL; completada: boolean } {
  let url: URL;
  try {
    url = new URL(entrada.trim());
  } catch {
    throw new Error(`«${entrada}» no es una dirección válida. Debe verse como http://192.168.1.50:3000${RUTA_LECTURAS}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`La dirección debe empezar con http:// o https://, no con ${url.protocol}//`);
  }
  if (url.pathname === '/' || url.pathname === '') {
    url.pathname = RUTA_LECTURAS;
    return { url, completada: true };
  }
  return { url, completada: false };
}

function puertoDe(url: URL): string {
  return url.port || (url.protocol === 'https:' ? '443' : '80');
}

/** Código de un error de red de Node (ECONNREFUSED, ENOTFOUND…), si lo trae. */
function codigoDeRed(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'TIMEOUT';
  const causa = (error as Error & { cause?: { code?: string; errors?: Array<{ code?: string }> } }).cause;
  return causa?.code ?? causa?.errors?.[0]?.code;
}

function explicarErrorDeRed(codigo: string | undefined, url: URL, timeoutMs: number): Paso {
  const destino = `${url.hostname}, puerto ${puertoDe(url)}`;
  switch (codigo) {
    case 'ECONNREFUSED':
      return {
        titulo: 'Conexión con la API',
        estado: 'error',
        detalle: `La computadora ${url.hostname} contestó, pero nada está escuchando en el puerto ${puertoDe(url)}.`,
        solucion: '¿Está corriendo la API (npm run dev)? ¿El puerto es el que muestra al arrancar (3000; el 5173 es el de la web)?',
      };
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return {
        titulo: 'Conexión con la API',
        estado: 'error',
        detalle: `No existe ninguna computadora llamada «${url.hostname}».`,
        solucion: 'Usa la dirección IP de la computadora (ipconfig en Windows, ip -4 addr en Parrot OS), no un nombre.',
      };
    case 'TIMEOUT':
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return {
        titulo: 'Conexión con la API',
        estado: 'error',
        detalle: `Nadie contestó en ${timeoutMs / 1000} s (${destino}). El ESP32 mostraría los 3 destellos azules.`,
        solucion:
          'Revisa, en este orden: que la IP sea la de la computadora con la API (cambia al cambiar de red), ' +
          'que los dos equipos estén en la misma red Wi-Fi de 2.4 GHz, que el firewall deje pasar el puerto 3000 ' +
          'y que la red no aísle a sus clientes (pasa en redes de escuela; un hotspot de celular lo evita).',
      };
    default:
      return {
        titulo: 'Conexión con la API',
        estado: 'error',
        detalle: `No se pudo conectar con ${destino}${codigo ? ` (${codigo})` : ''}.`,
        solucion: 'Revisa la dirección, la red y que la API esté corriendo.',
      };
  }
}

/** Revisa la conexión de un lector con la API. Nunca lanza: todo queda en los pasos. */
export async function diagnosticarDispositivo(opciones: OpcionesDiagnostico): Promise<ResultadoDiagnostico> {
  const pasos: Paso[] = [];
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS;
  const hacerFetch = opciones.fetch ?? fetch;
  const real = opciones.real ?? false;
  const terminar = (problema: Problema | null, urlLecturas: string | null, senal: Senal | null = null): ResultadoDiagnostico => ({
    pasos,
    problema,
    urlLecturas,
    senal,
  });

  // --- 1. Configuración: lo que va en secretos.h ---
  let url: URL;
  try {
    const preparada = prepararUrl(opciones.url);
    url = preparada.url;
    pasos.push({
      titulo: 'Dirección de la API',
      estado: 'ok',
      detalle: preparada.completada ? `${url.href} (se agregó la ruta de las lecturas)` : url.href,
    });
  } catch (error) {
    pasos.push({ titulo: 'Dirección de la API', estado: 'error', detalle: (error as Error).message });
    return terminar('configuracion', null);
  }

  if (HOSTS_LOCALES.has(url.hostname)) {
    const sugerencias = (opciones.direccionesLocales ?? []).map((ip) => `http://${ip}:${puertoDe(url)}${RUTA_LECTURAS}`);
    pasos.push({
      titulo: 'Dirección para el ESP32',
      estado: 'aviso',
      detalle: `«${url.hostname}» solo sirve dentro de esta computadora. Para el ESP32, «${url.hostname}» es el propio ESP32.`,
      solucion: sugerencias.length
        ? `En secretos.h usa la IP de red: ${sugerencias.join(' o ')}`
        : 'En secretos.h usa la IP de red de la computadora (ipconfig en Windows, ip -4 addr en Parrot OS).',
    });
  }
  if (url.pathname !== RUTA_LECTURAS) {
    pasos.push({
      titulo: 'Ruta',
      estado: 'aviso',
      detalle: `La dirección termina en «${url.pathname}», pero la ruta de las lecturas es ${RUTA_LECTURAS}.`,
      solucion: `Corrige la dirección: http://${url.host}${RUTA_LECTURAS}`,
    });
  }

  if (!/^[1-9]\d{0,8}$/.test(opciones.id)) {
    pasos.push({
      titulo: 'Id del dispositivo',
      estado: 'error',
      detalle: `«${opciones.id}» no es un id válido: debe ser un número entero positivo, como 1.`,
      solucion: 'Es el número que mostró npm run dispositivo:clave (SECRETO_DISPOSITIVO_ID en secretos.h).',
    });
    return terminar('configuracion', url.href);
  }
  pasos.push({ titulo: 'Id del dispositivo', estado: 'ok', detalle: opciones.id });

  if (!opciones.clave) {
    pasos.push({
      titulo: 'Clave del dispositivo',
      estado: 'error',
      detalle: 'No hay clave.',
      solucion: 'Ponla en SIMULADOR_DISPOSITIVO_CLAVE del .env. Si no la tienes, genera una con npm run dispositivo:clave -- <id> (la anterior deja de servir).',
    });
    return terminar('configuracion', url.href);
  }
  pasos.push({ titulo: 'Clave del dispositivo', estado: 'ok', detalle: `${opciones.clave.length} caracteres (no se muestra)` });

  // --- 2. El UID, revisado aquí mismo, sin enviarlo ---
  let uidCanonico: string | undefined;
  if (opciones.uid !== undefined) {
    const analisis = analizarUid(opciones.uid);
    if (analisis.valido) {
      uidCanonico = analisis.normalizado;
      pasos.push({
        titulo: 'Formato del UID',
        estado: analisis.avisos.length ? 'aviso' : 'ok',
        detalle: `Correcto: ${enmascararUid(uidCanonico)} (${analisis.bytes.length} bytes).`,
        solucion: analisis.avisos.join(' ') || undefined,
      });
    } else {
      pasos.push({
        titulo: 'Formato del UID',
        estado: 'error',
        detalle: `La API lo rechazaría (400, LED rojo): ${analisis.problemas.join(' ')}`,
        solucion: 'El firmware debe enviar el UID en hexadecimal en mayúsculas, sin separadores (ver docs/contrato-dispositivo.md). npm run uid:revisar da más detalle.',
      });
    }
  } else if (real) {
    pasos.push({
      titulo: 'Formato del UID',
      estado: 'error',
      detalle: 'El modo --real necesita el UID de una tarjeta.',
      solucion: 'npm run dispositivo:diagnostico -- <UID> --real',
    });
    return terminar('configuracion', url.href);
  }
  const problemaUid: Problema | null = opciones.uid !== undefined && !uidCanonico ? 'uid' : null;

  // --- 3. La petición ---
  // Sin --real (o con un UID inválido) se envía sin UID: la API revisa la clave
  // y luego responde 400 por el cuerpo, sin registrar nada.
  const enviarUid = real && uidCanonico !== undefined;
  const cuerpo = enviarUid ? { uid: uidCanonico } : {};
  const inicio = performance.now();
  let respuesta: Response;
  try {
    respuesta = await hacerFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dispositivo-Id': opciones.id,
        'X-Dispositivo-Clave': opciones.clave,
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    pasos.push(explicarErrorDeRed(codigoDeRed(error), url, timeoutMs));
    return terminar('red', url.href, enviarUid ? SENALES.azul : null);
  }
  const ms = Math.round(performance.now() - inicio);
  let json: { error?: unknown; detalles?: Record<string, unknown>; resultado?: unknown; motivo?: unknown; duplicado?: unknown } | undefined;
  try {
    json = JSON.parse(await respuesta.text());
  } catch {
    json = undefined;
  }
  const senal = enviarUid ? senalPara(respuesta.status, json) : null;
  const conexionOk: Paso = { titulo: 'Conexión con la API', estado: 'ok', detalle: `Respondió en ${ms} ms (el ESP32 espera hasta ${timeoutMs / 1000} s).` };

  switch (respuesta.status) {
    case 401:
      pasos.push(conexionOk);
      pasos.push({
        titulo: 'Id y clave',
        estado: 'error',
        detalle: `La API no reconoce al dispositivo ${opciones.id} con esa clave (401). El ESP32 mostraría los 3 destellos azules.`,
        solucion:
          'Revisa que el id exista y que la clave sea la última que dio npm run dispositivo:clave (al generar una nueva, la anterior deja de servir). ' +
          'Cuidado: 30 fallos así en 15 minutos bloquean esta IP un rato.',
      });
      return terminar('clave', url.href, senal);
    case 403:
      pasos.push(conexionOk);
      pasos.push({
        titulo: 'Id y clave',
        estado: 'error',
        detalle: `La clave es correcta, pero el dispositivo ${opciones.id} no está activo (403).`,
        solucion: 'Hay que reactivarlo en la base (estado = \'Activo\').',
      });
      return terminar('inactivo', url.href, senal);
    case 429: {
      const espera = respuesta.headers.get('retry-after');
      pasos.push(conexionOk);
      pasos.push({
        titulo: 'Límite de solicitudes',
        estado: 'error',
        detalle: `La API pidió esperar (429)${espera ? `: ${espera} s` : ''}. Son 60 peticiones por minuto por dispositivo y 30 fallos de clave por IP en 15 minutos.`,
        solucion: 'Espera y vuelve a intentar. Si el lector manda muchas, puede estar leyendo la misma tarjeta una y otra vez.',
      });
      return terminar('limite', url.href, senal);
    }
    case 404:
    case 405:
      pasos.push({
        titulo: 'Conexión con la API',
        estado: 'error',
        detalle: `Algo contestó en ${url.host}, pero no tiene la ruta de las lecturas (${respuesta.status}).`,
        solucion: `La dirección debe ser http://${url.host}${RUTA_LECTURAS}, y el puerto, el de la API (3000).`,
      });
      return terminar('ruta', url.href, senal);
  }
  if (respuesta.status >= 500) {
    pasos.push(conexionOk);
    pasos.push({
      titulo: 'Servidor',
      estado: 'error',
      detalle: `La API tuvo un error (${respuesta.status}). El ESP32 mostraría los 3 destellos azules.`,
      solucion: 'Mira los mensajes en la terminal donde corre npm run dev (¿está encendido PostgreSQL?).',
    });
    return terminar('servidor', url.href, senal);
  }
  pasos.push(conexionOk);

  // --- 4. Modo normal: se esperaba un 400 por falta del UID ---
  if (!enviarUid) {
    if (respuesta.status === 400 && json?.detalles && 'uid' in json.detalles) {
      pasos.push({
        titulo: 'Id y clave',
        estado: 'ok',
        detalle: 'La API aceptó el id y la clave. No se registró ninguna asistencia (la petición iba sin UID a propósito).',
      });
      if (real) {
        pasos.push({ titulo: 'Lectura completa', estado: 'omitido', detalle: 'No se envió porque el UID no tiene un formato válido.' });
      } else if (uidCanonico) {
        pasos.push({
          titulo: 'Lectura completa',
          estado: 'omitido',
          detalle: 'No se envió el UID.',
          solucion: 'Para probar la credencial y la clase (registra la asistencia): agrega --real.',
        });
      }
      return terminar(problemaUid, url.href);
    }
    pasos.push({
      titulo: 'Respuesta',
      estado: 'error',
      detalle: `Respuesta inesperada (${respuesta.status}). ¿Es la API de TapList?`,
      solucion: 'Revisa la dirección y el puerto.',
    });
    return terminar('respuesta', url.href);
  }

  // --- 5. Modo real: la respuesta que vería el ESP32 ---
  pasos.push({ titulo: 'Id y clave', estado: 'ok', detalle: 'La API aceptó el id y la clave.' });
  if (respuesta.status === 400) {
    const campos = json?.detalles ? Object.values(json.detalles).join(' ') : '';
    pasos.push({
      titulo: 'Lectura',
      estado: 'error',
      detalle: `La API rechazó los datos (400)${campos ? `: ${campos}` : ''}.`,
      solucion: 'Revisa el formato del UID con npm run uid:revisar.',
    });
    return terminar('uid', url.href, senal);
  }
  if (respuesta.status === 200 && (json?.resultado === 'ASISTENCIA' || json?.resultado === 'RETARDO')) {
    const tipo = json.resultado === 'ASISTENCIA' ? 'Asistencia' : 'Retardo';
    pasos.push({
      titulo: 'Lectura',
      estado: 'ok',
      detalle: json.duplicado
        ? `${tipo}: ya estaba registrada en esta clase hoy; no se guardó otra vez.`
        : `${tipo} registrada. Debe aparecer en la web (P2) en unos segundos.`,
    });
    return terminar(null, url.href, senal);
  }
  if (respuesta.status === 200 && json?.resultado === 'RECHAZADA' && json.motivo === 'CREDENCIAL_NO_VALIDA') {
    pasos.push({
      titulo: 'Credencial',
      estado: 'error',
      detalle: 'La tarjeta no está vinculada a un estudiante activo (o su credencial ya no está activa).',
      solucion: 'Vincúlala con npm run dev:vincular -- <UID> --matricula <matrícula>. Si ya lo hiciste, compara el UID con npm run uid:revisar -- <UID> --comparar <el vinculado>.',
    });
    return terminar('credencial', url.href, senal);
  }
  if (respuesta.status === 200 && json?.resultado === 'RECHAZADA' && json.motivo === 'SIN_CLASE') {
    pasos.push({
      titulo: 'Clase',
      estado: 'error',
      detalle: 'La tarjeta es válida, pero su grupo no tiene ninguna clase con la ventana de registro abierta en este momento.',
      solucion: 'Prepara una clase con npm run dev:clase-ahora -- --minutos 0 (el estudiante debe ser del grupo D01).',
    });
    return terminar('clase', url.href, senal);
  }
  pasos.push({
    titulo: 'Respuesta',
    estado: 'error',
    detalle: `Respuesta inesperada (${respuesta.status}).`,
    solucion: 'Revisa la dirección y el puerto.',
  });
  return terminar('respuesta', url.href, senal);
}

/** Una línea con lo más importante, para el final del diagnóstico. */
export function resumenDiagnostico(resultado: ResultadoDiagnostico): string {
  switch (resultado.problema) {
    case null:
      return 'Todo bien: estos datos sirven para secretos.h.';
    case 'configuracion':
      return 'Falta o está mal un dato de la configuración.';
    case 'red':
      return 'Falla la red: la petición no llega a la API.';
    case 'ruta':
      return 'La dirección no apunta a la ruta de lecturas de la API.';
    case 'clave':
      return 'Falla la clave o el id del dispositivo.';
    case 'inactivo':
      return 'El dispositivo está inactivo.';
    case 'limite':
      return 'Se alcanzó el límite de solicitudes; hay que esperar.';
    case 'servidor':
      return 'La API tuvo un error interno.';
    case 'uid':
      return 'Falla el formato del UID.';
    case 'credencial':
      return 'La red y la clave funcionan, pero la tarjeta no está vinculada.';
    case 'clase':
      return 'La red, la clave y la tarjeta funcionan, pero no hay clase en este momento.';
    case 'respuesta':
      return 'La respuesta no es la que se esperaba de la API de TapList.';
  }
}
