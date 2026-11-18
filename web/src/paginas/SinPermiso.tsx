import { Link } from 'react-router';
import { useSesion } from '../sesion/ContextoSesion';
import { INICIO_POR_ROL } from '../sesion/tipos';

/** Un usuario con sesión entró a una pantalla que no es de su rol (403). */
export function SinPermiso() {
  const { usuario } = useSesion();
  return (
    <main className="pagina-simple">
      <h1 className="titulo">Sin permiso</h1>
      <p>Tu cuenta no tiene permiso para ver esta pantalla.</p>
      {usuario && (
        <p>
          <Link to={INICIO_POR_ROL[usuario.rol]}>Volver a mi pantalla de inicio</Link>
        </p>
      )}
    </main>
  );
}
