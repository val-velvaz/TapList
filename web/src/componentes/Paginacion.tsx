/** Las páginas que se muestran: la primera, la última y las vecinas de la actual. */
export function paginasVisibles(actual: number, total: number): Array<number | '…'> {
  const paginas = new Set([1, total, actual - 1, actual, actual + 1].filter((p) => p >= 1 && p <= total));
  const ordenadas = [...paginas].sort((a, b) => a - b);
  const resultado: Array<number | '…'> = [];
  for (const [i, p] of ordenadas.entries()) {
    if (i > 0 && p - ordenadas[i - 1]! > 1) resultado.push('…');
    resultado.push(p);
  }
  return resultado;
}

/** «Página ‹ 1 2 3 … 18 ›», como en los bocetos de P2 y P4. */
export function Paginacion({ actual, total, alCambiar }: { actual: number; total: number; alCambiar: (pagina: number) => void }) {
  if (total <= 1) return null;
  return (
    <nav className="paginacion" aria-label="Paginación">
      <span className="paginacion__texto">Página</span>
      {actual > 1 && (
        <button type="button" className="paginacion__boton" onClick={() => alCambiar(actual - 1)} aria-label="Página anterior">
          ‹
        </button>
      )}
      {paginasVisibles(actual, total).map((p, i) =>
        p === '…' ? (
          <span key={`salto-${i}`} className="paginacion__salto" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={p === actual ? 'paginacion__boton paginacion__boton--actual' : 'paginacion__boton'}
            onClick={() => alCambiar(p)}
            aria-current={p === actual ? 'page' : undefined}
            aria-label={`Página ${p}`}
          >
            {p}
          </button>
        ),
      )}
      {actual < total && (
        <button type="button" className="paginacion__boton" onClick={() => alCambiar(actual + 1)} aria-label="Página siguiente">
          ›
        </button>
      )}
    </nav>
  );
}
