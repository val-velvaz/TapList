/** Lugar reservado para una pantalla que llega en una entrega posterior. */
export function EnConstruccion({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <section>
      <h1 className="titulo">{titulo}</h1>
      <p className="subtitulo">{descripcion}</p>
      <p className="aviso aviso--informativo">Esta pantalla todavía está en construcción.</p>
    </section>
  );
}
