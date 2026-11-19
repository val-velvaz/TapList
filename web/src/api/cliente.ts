/**
 * Única puerta de la web hacia la API. Todas las pantallas llaman a `pedir`,
 * para que los errores se traten igual en todas partes:
 *
 *   400  datos inválidos; `detalles` trae el mensaje de cada campo
 *   401  sin sesión: se avisa a la sesión, que manda al login
 *   403  sin permiso
 *   404  no encontrado
 *   409  conflicto: se muestra el mensaje de la API
 *   429  demasiadas solicitudes: se muestra el mensaje de la API
 *
 * La sesión viaja en una cookie httpOnly que JavaScript no puede leer. Aquí no
 * se guarda ningún token, ni en memoria ni en localStorage.
 */

export class ErrorApi extends Error {
  constructor(
    /** Código HTTP, o 0 si no hubo respuesta (sin red o servidor apagado). */
    readonly status: number,
    mensaje: string,
    /** Mensajes por campo de un 400. */
    readonly detalles: Record<string, string> = {},
  ) {
    super(mensaje);
    this.name = 'ErrorApi';
  }
}

const MENSAJES_POR_DEFECTO: Record<number, string> = {
  0: 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
  400: 'Hay datos que no son válidos.',
  401: 'Tu sesión terminó. Inicia sesión de nuevo.',
  403: 'No tienes permiso para hacer esto.',
  404: 'No se encontró lo que buscas.',
  409: 'La operación no se pudo completar por un conflicto con los datos actuales.',
  429: 'Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
};
const MENSAJE_GENERICO = 'Ocurrió un error en el servidor. Inténtalo de nuevo más tarde.';

/** Mensaje para mostrar a la persona cuando la API no envía uno. */
export const mensajePorDefecto = (status: number): string => MENSAJES_POR_DEFECTO[status] ?? MENSAJE_GENERICO;

// La sesión se registra aquí para enterarse de un 401 en cualquier llamada.
let alPerderSesion: (() => void) | null = null;
export function registrarPerdidaDeSesion(aviso: (() => void) | null): void {
  alPerderSesion = aviso;
}

/** Avisa a la sesión que ya no sirve (p. ej., el SSE recibió `sesion_terminada`). */
export function avisarPerdidaDeSesion(): void {
  alPerderSesion?.();
}

export interface OpcionesPeticion {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Se envía como JSON. */
  cuerpo?: unknown;
  /**
   * Un 401 no cierra la sesión de la web. Lo usan el login (el 401 significa
   * «credenciales incorrectas») y la consulta inicial de la sesión.
   */
  sinAvisoDeSesion?: boolean;
  senal?: AbortSignal;
}

async function leerJson(respuesta: Response): Promise<unknown> {
  if (respuesta.status === 204) return undefined;
  const texto = await respuesta.text();
  if (!texto) return undefined;
  try {
    return JSON.parse(texto);
  } catch {
    return undefined; // p. ej. una página de error de un proxy
  }
}

function soloTextos(valor: unknown): Record<string, string> {
  if (!valor || typeof valor !== 'object') return {};
  return Object.fromEntries(Object.entries(valor).filter((par): par is [string, string] => typeof par[1] === 'string'));
}

/** Llama a la API y devuelve el JSON de la respuesta. Lanza `ErrorApi` si falla. */
export async function pedir<T = unknown>(ruta: string, opciones: OpcionesPeticion = {}): Promise<T> {
  const { metodo = 'GET', cuerpo, sinAvisoDeSesion = false, senal } = opciones;

  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: senal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ErrorApi(0, mensajePorDefecto(0));
  }

  if (!respuesta.ok) throw await errorDeRespuesta(respuesta, sinAvisoDeSesion);
  return (await leerJson(respuesta)) as T;
}

/** Convierte una respuesta fallida en ErrorApi y avisa a la sesión si es un 401. */
async function errorDeRespuesta(respuesta: Response, sinAvisoDeSesion: boolean): Promise<ErrorApi> {
  const datos = ((await leerJson(respuesta)) ?? {}) as { error?: unknown; detalles?: unknown };
  const mensaje = typeof datos.error === 'string' && datos.error ? datos.error : mensajePorDefecto(respuesta.status);
  if (respuesta.status === 401 && !sinAvisoDeSesion) alPerderSesion?.();
  return new ErrorApi(respuesta.status, mensaje, soloTextos(datos.detalles));
}

/** El nombre de archivo de `Content-Disposition: attachment; filename=...`. */
export function nombreDeArchivo(disposicion: string | null, porDefecto: string): string {
  const coincidencia = disposicion?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return coincidencia?.[1] ? decodeURIComponent(coincidencia[1]) : porDefecto;
}

/**
 * Descarga un archivo de la API (PDF o XLSX) y lo guarda en el equipo con el
 * nombre que propone el servidor. Los errores se tratan igual que en `pedir`.
 */
export async function descargarArchivo(ruta: string, porDefecto = 'archivo'): Promise<string> {
  let respuesta: Response;
  try {
    respuesta = await fetch(ruta, { credentials: 'same-origin' });
  } catch {
    throw new ErrorApi(0, mensajePorDefecto(0));
  }
  if (!respuesta.ok) throw await errorDeRespuesta(respuesta, false);

  const nombre = nombreDeArchivo(respuesta.headers.get('Content-Disposition'), porDefecto);
  const url = URL.createObjectURL(await respuesta.blob());
  try {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return nombre;
}
