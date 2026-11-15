import { Link } from 'react-router';

/**
 * BORRADOR. El texto definitivo del aviso de privacidad (LFPDPPP) lo debe
 * redactar y aprobar el equipo o la institución; aquí solo se describe, sin
 * valor legal, qué datos usa el sistema.
 */
export function AvisoPrivacidad() {
  return (
    <main className="pagina-simple pagina-simple--texto">
      <h1 className="titulo">Aviso de privacidad</h1>
      <p className="aviso aviso--informativo">Borrador pendiente de revisión por el equipo. No es el texto legal definitivo.</p>
      <p>
        TapList es un proyecto académico de registro de asistencia escolar con credenciales NFC. Para funcionar, el sistema
        usa los siguientes datos:
      </p>
      <ul>
        <li>De docentes y administradores: nombre, correo institucional y contraseña (guardada cifrada, nunca en texto legible).</li>
        <li>De estudiantes: matrícula, nombre, correo institucional, grupo y el identificador de su credencial NFC.</li>
        <li>De cada asistencia: estudiante, clase, fecha, hora, estado y lector donde se registró.</li>
      </ul>
      <p>
        Los datos se usan solo para registrar y consultar la asistencia. Cada docente ve únicamente los registros de sus
        grupos, el identificador de la credencial nunca se muestra completo y las acciones de administración quedan en una
        bitácora.
      </p>
      <p>
        <Link to="/login">Volver al inicio de sesión</Link>
      </p>
    </main>
  );
}
