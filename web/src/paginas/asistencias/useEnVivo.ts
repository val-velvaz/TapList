import { useEffect, useRef, useState } from 'react';
import { avisarPerdidaDeSesion, pedir } from '../../api/cliente';

export type EstadoConexion = 'conectando' | 'en_vivo' | 'reconectando' | 'sin_conexion';

const URL_EVENTOS = '/api/asistencias/eventos';
/** Espera antes de abrir otra conexión si el navegador dejó de reintentar. */
export const ESPERA_REINTENTO_MS = 10_000;

interface Opciones {
  /** Llega una lectura nueva de una de las clases del docente. */
  alLeer: () => void;
  /** La conexión se recuperó después de cortarse: puede haberse perdido algo. */
  alReconectar: () => void;
}

/**
 * Conexión SSE de P2 (RNF-01). El servidor envía:
 *   conectado         al abrir la conexión (también después de reconectarse)
 *   asistencia        una lectura nueva de una clase del docente
 *   sesion_terminada  la sesión ya no sirve: se avisa a la sesión de la web
 *
 * Si la conexión se corta, el navegador reintenta solo («reconectando»). Si
 * deja de reintentar (p. ej., el servidor respondió 401 o 429), se revisa la
 * sesión y se abre otra conexión después de ESPERA_REINTENTO_MS.
 */
export function useEnVivo({ alLeer, alReconectar }: Opciones) {
  const [estado, setEstado] = useState<EstadoConexion>('conectando');
  const [ultimaLectura, setUltimaLectura] = useState<number | null>(null);
  // Las funciones cambian en cada render; la conexión no debe reabrirse por eso.
  const avisos = useRef({ alLeer, alReconectar });
  avisos.current = { alLeer, alReconectar };

  useEffect(() => {
    if (typeof EventSource === 'undefined') {
      setEstado('sin_conexion');
      return;
    }

    let fuente: EventSource | null = null;
    let espera: ReturnType<typeof setTimeout> | undefined;
    let terminado = false;
    let yaConecto = false;

    const abrir = () => {
      fuente = new EventSource(URL_EVENTOS, { withCredentials: true });

      fuente.addEventListener('conectado', () => {
        setEstado('en_vivo');
        if (yaConecto) avisos.current.alReconectar();
        yaConecto = true;
      });

      fuente.addEventListener('asistencia', () => {
        setUltimaLectura(Date.now());
        avisos.current.alLeer();
      });

      fuente.addEventListener('sesion_terminada', () => {
        terminado = true;
        fuente?.close();
        setEstado('sin_conexion');
        avisarPerdidaDeSesion();
      });

      fuente.onerror = () => {
        if (terminado) return;
        if (fuente?.readyState === EventSource.CLOSED) {
          // El navegador ya no reintentará. Si la sesión venció, pedir() avisa del 401.
          setEstado('sin_conexion');
          void pedir('/api/auth/me').catch(() => undefined);
          espera = setTimeout(() => {
            if (!terminado) abrir();
          }, ESPERA_REINTENTO_MS);
        } else {
          setEstado('reconectando');
        }
      };
    };

    abrir();
    return () => {
      terminado = true;
      clearTimeout(espera);
      fuente?.close();
    };
  }, []);

  return { estado, ultimaLectura };
}
