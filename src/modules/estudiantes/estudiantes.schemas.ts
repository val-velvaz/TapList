import { z } from 'zod';

const booleanoEnQuery = (campo: string) =>
  z.enum(['true', 'false'], { error: `${campo} debe ser true o false` }).transform((v) => v === 'true');

/** GET /api/estudiantes (P4). */
export const esquemaConsulta = z.object({
  pagina: z.coerce.number({ error: 'pagina debe ser un número' }).int().min(1, 'pagina empieza en 1').default(1),
  por_pagina: z.coerce
    .number({ error: 'por_pagina debe ser un número' })
    .int()
    .min(1, 'por_pagina debe ser al menos 1')
    .max(100, 'por_pagina no puede ser mayor que 100')
    .default(20),
  q: z
    .string({ error: 'q debe ser texto' })
    .trim()
    .max(100, 'q es demasiado largo')
    .optional()
    .transform((v) => v || undefined),
  id_grupo: z.coerce.number({ error: 'id_grupo debe ser un número' }).int().positive('id_grupo inválido').optional(),
  con_credencial: booleanoEnQuery('con_credencial').optional(),
  estado: z
    .enum(['activos', 'inactivos', 'todos'], { error: 'estado debe ser activos, inactivos o todos' })
    .default('activos'),
});

export type FiltrosConsulta = z.infer<typeof esquemaConsulta>;

/** :id de las rutas /api/estudiantes/:id. */
export const esquemaIdEstudiante = z.coerce
  .number({ error: 'El id del estudiante debe ser un número' })
  .int('El id del estudiante debe ser un entero')
  .positive('El id del estudiante debe ser positivo')
  .max(2_147_483_647, 'El id del estudiante es demasiado grande');
