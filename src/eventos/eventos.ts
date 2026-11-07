import { EventEmitter } from 'node:events';
import type { EstadoAsistencia } from '../modules/lecturas/tiempo.js';

/**
 * Punto de extensión para avisar a la web en tiempo real (RNF-01).
 * Hoy nadie escucha; el transporte (WebSocket o SSE) se agregará después
 * suscribiéndose aquí, sin tocar el módulo de lecturas.
 *
 *   eventos.on('asistencia:registrada', (datos) => { ... });
 */
export interface AsistenciaRegistrada {
  idAsistencia: number;
  idEstudiante: number;
  idClase: number;
  idDispositivo: number;
  /** Fecha local del día de la clase, 'YYYY-MM-DD'. */
  fecha: string;
  /** Hora local de la lectura, 'HH:MM:SS'. */
  hora: string;
  estado: EstadoAsistencia;
  // Nunca incluye el UID de la credencial (RNF-06).
}

interface MapaEventos {
  'asistencia:registrada': [AsistenciaRegistrada];
}

export const eventos = new EventEmitter<MapaEventos>();

/**
 * Emite un evento sin que un oyente con errores afecte a quien lo emite:
 * la asistencia ya se guardó y el dispositivo debe recibir su respuesta.
 */
export function emitirSeguro<K extends keyof MapaEventos>(nombre: K, ...args: MapaEventos[K]): void {
  try {
    // El mapa ya tipó los argumentos en la firma; aquí solo se reenvían.
    (eventos as EventEmitter).emit(nombre, ...args);
  } catch (error) {
    console.error(`[eventos] Un oyente de "${nombre}" falló:`, error);
  }
}
