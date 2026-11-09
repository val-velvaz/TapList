import { z } from 'zod';
import { HttpError } from './HttpError.js';

/** Valida con zod y lanza 400 con un mensaje por campo (el primero que falló). */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown, mensaje: string): z.infer<T> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;
  const detalles: Record<string, string> = {};
  for (const issue of resultado.error.issues) {
    const campo = String(issue.path[0] ?? 'body');
    detalles[campo] ??= issue.message;
  }
  throw new HttpError(400, mensaje, detalles);
}

/** Campos `pagina` y `por_pagina` (1 a 100) de las listas paginadas. */
export const camposPaginacion = {
  pagina: z.coerce.number({ error: 'pagina debe ser un número' }).int().min(1, 'pagina empieza en 1').default(1),
  por_pagina: z.coerce
    .number({ error: 'por_pagina debe ser un número' })
    .int()
    .min(1, 'por_pagina debe ser al menos 1')
    .max(100, 'por_pagina no puede ser mayor que 100')
    .default(20),
};

/** Id positivo que llega en la query string (p. ej. ?id_grupo=3). */
export const idEnQuery = (campo: string) =>
  z.coerce
    .number({ error: `${campo} debe ser un número` })
    .int(`${campo} debe ser un entero`)
    .positive(`${campo} inválido`)
    .max(2_147_483_647, `${campo} inválido`);

/** Respuesta común de las listas paginadas. */
export interface Pagina<T> {
  datos: T[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

export function armarPagina<T>(datos: T[], total: number, pagina: number, porPagina: number): Pagina<T> {
  return { datos, pagina, por_pagina: porPagina, total, total_paginas: Math.ceil(total / porPagina) };
}
