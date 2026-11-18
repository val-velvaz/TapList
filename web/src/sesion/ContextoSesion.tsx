import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { pedir, registrarPerdidaDeSesion } from '../api/cliente';
import { rutaDeInicio, type Usuario } from './tipos';

interface Sesion {
  /** `undefined` mientras se consulta /api/auth/me; `null` si no hay sesión. */
  usuario: Usuario | null | undefined;
  /** `true` si la sesión se perdió por un 401 (venció o la cuenta se desactivó). */
  sesionVencida: boolean;
  /** Inicia sesión y devuelve la ruta a la que hay que ir. Lanza `ErrorApi` si falla. */
  iniciarSesion(correo: string, contrasena: string): Promise<string>;
  cerrarSesion(): Promise<void>;
}

const ContextoSesion = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [sesionVencida, setSesionVencida] = useState(false);

  // Al abrir la página: ¿ya hay una sesión? La cookie no se puede leer desde
  // aquí, así que se le pregunta a la API.
  useEffect(() => {
    const control = new AbortController();
    pedir<{ usuario: Usuario }>('/api/auth/me', { sinAvisoDeSesion: true, senal: control.signal })
      .then((respuesta) => setUsuario(respuesta.usuario))
      .catch((error: unknown) => {
        if (!control.signal.aborted) {
          void error; // sin sesión o sin red: en ambos casos se muestra el login
          setUsuario(null);
        }
      });
    return () => control.abort();
  }, []);

  // Un 401 en cualquier llamada significa que la sesión ya no sirve.
  useEffect(() => {
    registrarPerdidaDeSesion(() => {
      setSesionVencida(true);
      setUsuario(null);
    });
    return () => registrarPerdidaDeSesion(null);
  }, []);

  const iniciarSesion = useCallback(async (correo: string, contrasena: string) => {
    const respuesta = await pedir<{ usuario: Usuario; redirigirA?: unknown }>('/api/auth/login', {
      metodo: 'POST',
      cuerpo: { correo, contrasena },
      sinAvisoDeSesion: true,
    });
    setSesionVencida(false);
    setUsuario(respuesta.usuario);
    return rutaDeInicio(respuesta.usuario.rol, respuesta.redirigirA);
  }, []);

  const cerrarSesion = useCallback(async () => {
    try {
      await pedir('/api/auth/logout', { metodo: 'POST', sinAvisoDeSesion: true });
    } finally {
      // Aunque la petición falle, la web deja de mostrar datos del usuario.
      setSesionVencida(false);
      setUsuario(null);
    }
  }, []);

  const valor = useMemo(
    () => ({ usuario, sesionVencida, iniciarSesion, cerrarSesion }),
    [usuario, sesionVencida, iniciarSesion, cerrarSesion],
  );
  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>;
}

export function useSesion(): Sesion {
  const sesion = useContext(ContextoSesion);
  if (!sesion) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>');
  return sesion;
}
