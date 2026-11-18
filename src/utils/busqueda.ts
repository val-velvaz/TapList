/** Escapa los comodines de LIKE para buscar el texto literal. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&');
}

/**
 * Condiciones SQL para buscar estudiantes por nombre, apellidos o matrícula.
 * Por palabras: cada una debe aparecer, en cualquier orden ("gomez beatriz"
 * encuentra a "Beatriz Gómez Ruiz"), sin distinguir mayúsculas (ILIKE) ni
 * acentos (unaccent). Como máximo 5 palabras. La comparten P4 y P2.
 *
 * @param alias      alias de la tabla estudiante en la consulta (p. ej. 'e')
 * @param parametro  agrega un valor a la lista de parámetros y devuelve su marcador ($n)
 */
export function condicionesBusquedaEstudiante(q: string, alias: string, parametro: (valor: unknown) => string): string[] {
  return q
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((palabra) => {
      const patron = parametro(`%${escaparLike(palabra)}%`);
      return `unaccent(${alias}.nombre || ' ' || ${alias}.apellidos || ' ' || ${alias}.matricula) ILIKE unaccent(${patron})`;
    });
}
