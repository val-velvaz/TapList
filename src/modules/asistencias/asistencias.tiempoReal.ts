import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { type AsistenciaRegistrada, eventos } from '../../eventos/eventos.js';
import { errorParaLog } from '../../utils/erroresPg.js';
import { HttpError } from '../../utils/HttpError.js';
import { NOMBRE_COOKIE_SESION, verificarTokenSesion } from '../../utils/sesion.js';
import { buscarUsuarioActivo } from '../auth/auth.service.js';
import { asistenciasDesde, obtenerAsistencia } from './asistencias.service.js';

/**
 * Aviso en tiempo real a la web con Server-Sent Events (RNF-01).
 *
 * Cada docente abre GET /api/asistencias/eventos (una conexión por pestaña).
 * Cuando el registro NFC emite `asistencia:registrada`, se completa la fila
 * con UNA consulta y se envía solo a las conexiones del docente de esa clase.
 *
 * Eventos que recibe el navegador:
 *   conectado         el flujo está listo (después de reenviar lo pendiente)
 *   asistencia        una fila con el mismo formato que GET /api/asistencias
 *   sesion_terminada  la sesión venció o la cuenta ya no es Docente activo; no reconectar
 *
 * Las conexiones viven en la memoria de este proceso. Con varias instancias
 * del servidor haría falta Redis pub/sub o LISTEN/NOTIFY de PostgreSQL.
 */

/** Reintento que se le pide a EventSource tras perder la conexión. */
const REINTENTO_MS = 3000;
/** Máximo de asistencias que se reenvían al reconectarse con Last-Event-ID. */
const MAX_REENVIO = 100;

interface Conexion {
  res: Response;
  idDocente: number;
  token: string;
  latido: NodeJS.Timeout;
}

const conexionesPorDocente = new Map<number, Set<Conexion>>();

function enviar(res: Response, evento: string, datos: unknown, id?: number): void {
  if (res.destroyed || res.writableEnded) return;
  res.write(`${id ? `id: ${id}\n` : ''}event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
}

function quitar(conexion: Conexion): void {
  clearInterval(conexion.latido);
  const propias = conexionesPorDocente.get(conexion.idDocente);
  propias?.delete(conexion);
  if (propias?.size === 0) conexionesPorDocente.delete(conexion.idDocente);
}

/** En cada latido revisa que la sesión siga vigente y la cuenta siga siendo Docente activo. */
async function latir(conexion: Conexion): Promise<void> {
  try {
    const usuario =
      verificarTokenSesion(conexion.token) === conexion.idDocente ? await buscarUsuarioActivo(conexion.idDocente) : null;
    if (usuario?.rol !== 'Docente') {
      enviar(conexion.res, 'sesion_terminada', { motivo: 'La sesión terminó; inicia sesión de nuevo' });
      conexion.res.end();
      quitar(conexion);
      return;
    }
    if (!conexion.res.destroyed) conexion.res.write(': latido\n\n');
  } catch (error) {
    // Una falla momentánea de la BD no cierra el flujo; se revisa en el siguiente latido.
    console.error('[tiempo real] No se pudo revisar la sesión:', errorParaLog(error));
  }
}

/** GET /api/asistencias/eventos — requiere requiereSesion + requiereRol('Docente'). */
export async function flujoEventos(req: Request, res: Response): Promise<void> {
  const idDocente = req.usuario!.id;
  if ((conexionesPorDocente.get(idDocente)?.size ?? 0) >= env.SSE_MAX_CONEXIONES_DOCENTE) {
    throw new HttpError(429, 'Demasiadas conexiones en tiempo real abiertas; cierra otras pestañas');
  }

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // evita que un proxy Nginx retenga los eventos
  });
  res.flushHeaders();
  res.write(`retry: ${REINTENTO_MS}\n\n`);

  const conexion: Conexion = {
    res,
    idDocente,
    token: String(req.cookies?.[NOMBRE_COOKIE_SESION] ?? ''),
    latido: setInterval(() => void latir(conexion), env.SSE_LATIDO_SEGUNDOS * 1000),
  };
  const propias = conexionesPorDocente.get(idDocente) ?? new Set<Conexion>();
  propias.add(conexion);
  conexionesPorDocente.set(idDocente, propias);
  req.on('close', () => quitar(conexion));

  // Al reconectarse, EventSource manda el id del último evento recibido: se
  // reenvía lo que llegó mientras tanto. Es una ayuda, no una garantía; la
  // web debe volver a cargar la lista al reconectarse.
  const ultimoId = Number(req.get('Last-Event-ID'));
  if (Number.isInteger(ultimoId) && ultimoId > 0) {
    try {
      for (const asistencia of await asistenciasDesde(idDocente, ultimoId, MAX_REENVIO)) {
        enviar(res, 'asistencia', asistencia, asistencia.id);
      }
    } catch (error) {
      console.error('[tiempo real] No se pudo reenviar lo pendiente:', errorParaLog(error));
    }
  }
  enviar(res, 'conectado', { reintento_ms: REINTENTO_MS });
}

/** Envía una asistencia nueva solo a las conexiones del docente de su clase. */
async function distribuir(datos: AsistenciaRegistrada): Promise<void> {
  if (conexionesPorDocente.size === 0) return; // nadie escuchando: ni siquiera se consulta
  try {
    const encontrada = await obtenerAsistencia(datos.idAsistencia);
    if (!encontrada) return;
    for (const conexion of conexionesPorDocente.get(encontrada.idDocente) ?? []) {
      enviar(conexion.res, 'asistencia', encontrada.asistencia, encontrada.asistencia.id);
    }
  } catch (error) {
    console.error('[tiempo real] No se pudo enviar la asistencia:', errorParaLog(error));
  }
}

eventos.on('asistencia:registrada', (datos) => void distribuir(datos));

/** Cierra todos los flujos, para que el servidor pueda apagarse. */
export function cerrarConexionesTiempoReal(): void {
  for (const propias of conexionesPorDocente.values()) {
    for (const conexion of propias) {
      conexion.res.end();
      quitar(conexion);
    }
  }
}

/** Solo para pruebas y diagnóstico. */
export function conexionesAbiertas(idDocente: number): number {
  return conexionesPorDocente.get(idDocente)?.size ?? 0;
}
