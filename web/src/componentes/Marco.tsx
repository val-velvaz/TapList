import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { useSesion } from '../sesion/ContextoSesion';
import type { Rol } from '../sesion/tipos';

const PANEL: Record<Rol, string> = { Docente: 'Panel docente', Administrador: 'Administración' };

const MENU: Record<Rol, Array<{ ruta: string; texto: string }>> = {
  Docente: [
    { ruta: '/asistencias', texto: 'Asistencias' },
    { ruta: '/estadisticas', texto: 'Estadísticas' },
  ],
  Administrador: [{ ruta: '/estudiantes', texto: 'Estudiantes' }],
};

/** Encabezado común de P2 a P5: marca, menú del rol, usuario y «Cerrar sesión». */
export function Marco() {
  const { usuario, cerrarSesion } = useSesion();
  const [saliendo, setSaliendo] = useState(false);
  if (!usuario) return null;

  async function salir() {
    setSaliendo(true);
    try {
      await cerrarSesion();
    } catch {
      // La sesión de la web ya se cerró; RutaProtegida manda al login.
    }
  }

  return (
    <div className="marco">
      <header className="encabezado">
        <div className="encabezado__marca">
          <span className="marca">TapList</span>
          <span className="encabezado__panel">{PANEL[usuario.rol]}</span>
        </div>
        <nav className="menu" aria-label="Secciones">
          {MENU[usuario.rol].map(({ ruta, texto }) => (
            <NavLink key={ruta} to={ruta} className={({ isActive }) => (isActive ? 'menu__enlace menu__enlace--activo' : 'menu__enlace')}>
              {texto}
            </NavLink>
          ))}
        </nav>
        <div className="encabezado__usuario">
          <span className="pastilla" data-testid="usuario-actual">
            {usuario.nombre} {usuario.apellidos} · {usuario.rol}
          </span>
          <button type="button" className="boton" onClick={salir} disabled={saliendo}>
            Cerrar sesión
          </button>
        </div>
      </header>
      <main className="contenido">
        <Outlet />
      </main>
    </div>
  );
}
