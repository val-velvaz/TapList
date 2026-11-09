import { z } from 'zod';
import { idEnQuery } from '../../utils/validacion.js';

const fecha = (campo: string) =>
  z.iso.date({ error: (i) => (i.input === undefined ? `${campo} es obligatorio` : `${campo} debe ser una fecha válida YYYY-MM-DD`) });

const MAX_DIAS_PERIODO = 366;
const dias = (desde: string, hasta: string) => (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;

/** GET /api/estadisticas (P3). El periodo es obligatorio; hasta en el futuro se recorta a hoy. */
export const esquemaEstadisticas = z
  .object({
    desde: fecha('desde'),
    hasta: fecha('hasta'),
    id_grupo: idEnQuery('id_grupo').optional(),
    id_clase: idEnQuery('id_clase').optional(),
    top: z.coerce
      .number({ error: 'top debe ser un número' })
      .int('top debe ser un entero')
      .min(1, 'top debe ser al menos 1')
      .max(50, 'top no puede ser mayor que 50')
      .default(10),
  })
  .refine((f) => f.desde <= f.hasta, { path: ['hasta'], message: 'hasta no puede ser anterior a desde' })
  .refine((f) => dias(f.desde, f.hasta) < MAX_DIAS_PERIODO, {
    path: ['hasta'],
    message: `El periodo no puede ser mayor que ${MAX_DIAS_PERIODO} días`,
  });

export type FiltrosEstadisticas = z.infer<typeof esquemaEstadisticas>;
