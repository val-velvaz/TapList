import { Navigate, Outlet } from 'react-router';
import { SinPermiso } from '../paginas/SinPermiso';
import { useSesion } from '../sesion/ContextoSesion';
import type { Rol } from '../sesion/tipos';

/**
 * Deja pasar solo a los roles indicados. Es una comodidad de la web: quien
 * decide de verdad es la API, que valida el rol en cada solicitud (RF-09).
 */
export function RutaProtegida({ roles }: { roles: Rol[] }) {
  const { usuario } = useSesion();
  if (usuario === undefined) return <p className="cargando">Cargando…</p>;
  if (usuario === null) return <Navigate to="/login" replace />;
  if (!roles.includes(usuario.rol)) return <SinPermiso />;
  return <Outlet />;
}
