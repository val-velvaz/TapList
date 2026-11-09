import { z } from 'zod';
import { idEnQuery } from '../../utils/validacion.js';
import { formatoExportacion } from '../asistencias/asistencias.schemas.js';

const fecha = (campo: string) =>
  z.iso.date({ error: (i) => (i.input === undefined ? `${campo} es obligatorio` : `${campo} debe ser una fecha válida YYYY-MM-DD`) });

const MAX_DIAS_PERIODO = 366;
const dias = (desde: string, hasta: string) => (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;

const camposEstadisticas = {
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
};

// Validaciones del periodo, comunes a la consulta y a la exportación.
type Periodo = { desde: string; hasta: string };
const ordenValido = (f: Periodo) => f.desde <= f.hasta;
const errorOrden = { path: ['hasta'], message: 'hasta no puede ser anterior a desde' };
const largoValido = (f: Periodo) => dias(f.desde, f.hasta) < MAX_DIAS_PERIODO;
const errorLargo = { path: ['hasta'], message: `El periodo no puede ser mayor que ${MAX_DIAS_PERIODO} días` };

/** GET /api/estadisticas (P3). El periodo es obligatorio; hasta en el futuro se recorta a hoy. */
export const esquemaEstadisticas = z
  .object(camposEstadisticas)
  .refine(ordenValido, errorOrden)
  .refine(largoValido, errorLargo);

export type FiltrosEstadisticas = z.infer<typeof esquemaEstadisticas>;

/** GET /api/estadisticas/exportar: mismos parámetros, más el formato. */
export const esquemaExportarEstadisticas = z
  .object({ formato: formatoExportacion, ...camposEstadisticas })
  .refine(ordenValido, errorOrden)
  .refine(largoValido, errorLargo);
