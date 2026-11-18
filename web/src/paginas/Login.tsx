import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { ErrorApi } from '../api/cliente';
import { useSesion } from '../sesion/ContextoSesion';
import { INICIO_POR_ROL } from '../sesion/tipos';

type Errores = { correo?: string; contrasena?: string };

/** Misma revisión de forma que hace la API (paso 2 de AD-01); la API vuelve a validar. */
function validar(correo: string, contrasena: string): Errores {
  const errores: Errores = {};
  if (!correo.trim()) errores.correo = 'El correo es obligatorio';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) errores.correo = 'El correo no tiene un formato válido';
  if (!contrasena) errores.contrasena = 'La contraseña es obligatoria';
  return errores;
}

/** P1 · Inicio de sesión. */
export function Login() {
  const { usuario, sesionVencida, iniciarSesion } = useSesion();
  const navegar = useNavigate();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [visible, setVisible] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ayuda, setAyuda] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (usuario === undefined) return <p className="cargando">Cargando…</p>;
  // Con sesión abierta no se muestra el login. Tras entrar, `navegar` ya eligió la ruta.
  if (usuario && !enviando) return <Navigate to={INICIO_POR_ROL[usuario.rol]} replace />;

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setMensaje(null);
    const locales = validar(correo, contrasena);
    setErrores(locales);
    if (Object.keys(locales).length > 0) return;

    setEnviando(true);
    try {
      const ruta = await iniciarSesion(correo.trim(), contrasena);
      navegar(ruta, { replace: true });
    } catch (error) {
      if (error instanceof ErrorApi) {
        // 401: mensaje genérico de la API, sin decir cuál dato falló.
        setErrores({ correo: error.detalles.correo, contrasena: error.detalles.contrasena });
        const hayDetalles = Boolean(error.detalles.correo || error.detalles.contrasena);
        setMensaje(error.status === 400 && hayDetalles ? null : error.message);
      } else {
        setMensaje('Ocurrió un error inesperado. Inténtalo de nuevo.');
      }
      setContrasena('');
      setEnviando(false);
    }
  }

  return (
    <main className="login">
      <form className="login__tarjeta" onSubmit={enviar} noValidate aria-labelledby="login-titulo">
        <h1 id="login-titulo" className="login__marca">
          TapList
        </h1>
        <p className="login__lema">Sistema de asistencia escolar con NFC</p>

        {sesionVencida && !mensaje && (
          <p className="aviso aviso--informativo" role="status">
            Tu sesión terminó. Inicia sesión de nuevo.
          </p>
        )}

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="login-correo">
            Correo institucional
          </label>
          <input
            id="login-correo"
            className="campo__entrada"
            type="email"
            name="correo"
            autoComplete="username"
            placeholder="usuario@institucion.edu.mx"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            aria-invalid={Boolean(errores.correo)}
            aria-describedby={errores.correo ? 'error-correo' : undefined}
            maxLength={254}
            autoFocus
          />
          {errores.correo && (
            <span id="error-correo" className="campo__error">
              {errores.correo}
            </span>
          )}
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="login-contrasena">
            Contraseña
          </label>
          <span className="campo__con-boton">
            <input
              id="login-contrasena"
              className="campo__entrada"
              type={visible ? 'text' : 'password'}
              name="contrasena"
              autoComplete="current-password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              aria-invalid={Boolean(errores.contrasena)}
              aria-describedby={errores.contrasena ? 'error-contrasena' : undefined}
              maxLength={256}
            />
            <button type="button" className="campo__boton" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
              {visible ? 'Ocultar' : 'Mostrar'}
            </button>
          </span>
          {errores.contrasena && (
            <span id="error-contrasena" className="campo__error">
              {errores.contrasena}
            </span>
          )}
        </div>

        <p className="login__olvido">
          <button type="button" className="enlace" onClick={() => setAyuda((a) => !a)} aria-expanded={ayuda}>
            ¿Olvidaste tu contraseña?
          </button>
        </p>
        {ayuda && (
          <p className="aviso aviso--informativo" role="status">
            Para restablecer tu contraseña, contacta al administrador del sistema.
          </p>
        )}

        <button type="submit" className="boton boton--primario boton--ancho" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>

        {mensaje && (
          <p className="aviso aviso--error" role="alert">
            {mensaje}
          </p>
        )}

        <p className="login__privacidad">
          Al ingresar aceptas el <Link to="/aviso-de-privacidad">Aviso de privacidad</Link> (LFPDPPP)
        </p>
      </form>
    </main>
  );
}
