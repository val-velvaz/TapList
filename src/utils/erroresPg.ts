/** Forma mínima de un error de PostgreSQL (pg.DatabaseError). */
interface ErrorPg {
  code?: string;
  constraint?: string;
}

function comoErrorPg(error: unknown): ErrorPg | undefined {
  return typeof error === 'object' && error !== null ? (error as ErrorPg) : undefined;
}

/** 23505: viola un UNIQUE. Si se indica `restriccion`, debe ser esa. */
export function esViolacionUnica(error: unknown, restriccion?: string): boolean {
  const e = comoErrorPg(error);
  return e?.code === '23505' && (!restriccion || e.constraint === restriccion);
}

/** 23503: viola una llave foránea. Si se indica `restriccion`, debe ser esa. */
export function esViolacionLlaveForanea(error: unknown, restriccion?: string): boolean {
  const e = comoErrorPg(error);
  return e?.code === '23503' && (!restriccion || e.constraint === restriccion);
}

/**
 * Versión de un error apta para los logs. Omite `detail`, `where` y los
 * parámetros, porque PostgreSQL pone ahí los valores de la fila; por ejemplo,
 * «Ya existe la llave (uid)=(04A1B2C3)» expondría el UID completo (RNF-06).
 */
export function errorParaLog(error: unknown): unknown {
  if (!(error instanceof Error)) return error;
  const { code, constraint, table } = error as Error & ErrorPg & { table?: string };
  return { nombre: error.name, mensaje: error.message, code, constraint, table, stack: error.stack };
}
