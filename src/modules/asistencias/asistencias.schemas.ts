import { z } from 'zod';
import { camposPaginacion, idEnQuery } from '../../utils/validacion.js';

const fecha = (campo: string) => z.iso.date({ error: `${campo} debe ser una fecha válida YYYY-MM-DD` });

/** GET /api/asistencias (P2). Todas las fechas son del día de la clase, ambas incluidas. */
export const esquemaConsultaAsistencias = z
  .object({
    ...camposPaginacion,
    id_grupo: idEnQuery('id_grupo').optional(),
    id_clase: idEnQuery('id_clase').optional(),
    id_estudiante: idEnQuery('id_estudiante').optional(),
    estado: z.enum(['Asistencia', 'Retardo'], { error: 'estado debe ser Asistencia o Retardo' }).optional(),
    desde: fecha('desde').optional(),
    hasta: fecha('hasta').optional(),
  })
  .refine((f) => !f.desde || !f.hasta || f.desde <= f.hasta, {
    path: ['hasta'],
    message: 'hasta no puede ser anterior a desde',
  });

export type FiltrosAsistencias = z.infer<typeof esquemaConsultaAsistencias>;
