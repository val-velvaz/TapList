import { Navigate, Route, Routes } from 'react-router';
import { Marco } from './componentes/Marco';
import { RutaProtegida } from './componentes/RutaProtegida';
import { Asistencias } from './paginas/asistencias/Asistencias';
import { AvisoPrivacidad } from './paginas/AvisoPrivacidad';
import { EnConstruccion } from './paginas/EnConstruccion';
import { Login } from './paginas/Login';
import { NoEncontrada } from './paginas/NoEncontrada';
import { useSesion } from './sesion/ContextoSesion';
import { INICIO_POR_ROL } from './sesion/tipos';

/** `/` lleva a la pantalla inicial del rol, o al login si no hay sesión. */
function Inicio() {
  const { usuario } = useSesion();
  if (usuario === undefined) return <p className="cargando">Cargando…</p>;
  return <Navigate to={usuario ? INICIO_POR_ROL[usuario.rol] : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Inicio />} />
      <Route path="/login" element={<Login />} />
      <Route path="/aviso-de-privacidad" element={<AvisoPrivacidad />} />

      {/* Docente */}
      <Route element={<RutaProtegida roles={['Docente']} />}>
        <Route element={<Marco />}>
          <Route path="/asistencias" element={<Asistencias />} />
          <Route
            path="/estadisticas"
            element={<EnConstruccion titulo="Estadísticas de asistencia" descripcion="Indicadores por grupo y periodo" />}
          />
        </Route>
      </Route>

      {/* Administrador */}
      <Route element={<RutaProtegida roles={['Administrador']} />}>
        <Route element={<Marco />}>
          <Route
            path="/estudiantes"
            element={<EnConstruccion titulo="Gestión de estudiantes" descripcion="Alta, baja y vinculación de credenciales NFC" />}
          />
          <Route
            path="/estudiantes/nuevo"
            element={<EnConstruccion titulo="Agregar estudiante" descripcion="Los campos con * son obligatorios" />}
          />
        </Route>
      </Route>

      <Route path="*" element={<NoEncontrada />} />
    </Routes>
  );
}
