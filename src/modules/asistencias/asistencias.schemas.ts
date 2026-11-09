import { z } from 'zod';
import { camposPaginacion, idEnQuery } from '../../utils/validacion.js';

const fecha = (campo: string) => z.iso.date({ error: `${campo} debe ser una fecha válida YYYY-MM-DD` });

/** Filtros de la lista de P2; los comparten la consulta y la exportación. */
const camposFiltros = {
  id_grupo: idEnQuery('id_grupo').optional(),
  id_clase: idEnQuery('id_clase').optional(),
  id_estudiante: idEnQuery('id_estudiante').optional(),
  estado: z.enum(['Asistencia', 'Retardo'], { error: 'estado debe ser Asistencia o Retardo' }).optional(),
  desde: fecha('desde').optional(),
  hasta: fecha('hasta').optional(),
};

const rangoValido = (f: { desde?: string; hasta?: string }) => !f.desde || !f.hasta || f.desde <= f.hasta;
const errorRango = { path: ['hasta'], message: 'hasta no puede ser anterior a desde' };

/** GET /api/asistencias (P2). Todas las fechas son del día de la clase, ambas incluidas. */
export const esquemaConsultaAsistencias = z
  .object({ ...camposPaginacion, ...camposFiltros })
  .refine(rangoValido, errorRango);

export type FiltrosAsistencias = z.infer<typeof esquemaConsultaAsistencias>;

export const formatoExportacion = z.enum(['pdf', 'xlsx'], {
  error: (i) => (i.input === undefined ? 'formato es obligatorio (pdf o xlsx)' : 'formato debe ser pdf o xlsx'),
});

/** GET /api/asistencias/exportar: mismos filtros que la lista, sin paginación. */
export const esquemaExportarAsistencias = z
  .object({ formato: formatoExportacion, ...camposFiltros })
  .refine(rangoValido, errorRango);

export type FiltrosExportarAsistencias = z.infer<typeof esquemaExportarAsistencias>;
