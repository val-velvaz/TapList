import { Link } from 'react-router';

export function NoEncontrada() {
  return (
    <main className="pagina-simple">
      <h1 className="titulo">Página no encontrada</h1>
      <p>La dirección que abriste no existe en TapList.</p>
      <p>
        <Link to="/">Ir al inicio</Link>
      </p>
    </main>
  );
}
