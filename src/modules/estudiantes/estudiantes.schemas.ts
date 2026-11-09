import { z } from 'zod';
import { camposPaginacion, idEnQuery } from '../../utils/validacion.js';
import { esquemaUid } from '../lecturas/lecturas.schemas.js';

/** Texto con mensajes propios si falta o no es texto (respetando género y número). */
const texto = (siFalta: string, siNoEsTexto: string) =>
  z.string({ error: (i) => (i.input === undefined ? siFalta : siNoEsTexto) });

/** POST /api/estudiantes (P5). Con `uid`, el alta y la vinculación son todo o nada. */
export const esquemaAlta = z.object({
  matricula: texto('La matrícula es obligatoria', 'La matrícula debe ser texto')
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z]{5,20}$/, 'La matrícula debe tener de 5 a 20 letras o números'),
  nombre: texto('El nombre es obligatorio', 'El nombre debe ser texto')
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(100, 'El nombre es demasiado largo'),
  apellidos: texto('Los apellidos son obligatorios', 'Los apellidos deben ser texto')
    .trim()
    .min(1, 'Los apellidos son obligatorios')
    .max(150, 'Los apellidos son demasiado largos'),
  correo: texto('El correo es obligatorio', 'El correo debe ser texto')
    .trim()
    .toLowerCase()
    .min(1, 'El correo es obligatorio')
    .max(254, 'El correo es demasiado largo')
    .pipe(z.email('El correo no tiene un formato válido')),
  id_grupo: z
    .number({ error: (i) => (i.input === undefined ? 'El grupo es obligatorio' : 'id_grupo debe ser un número') })
    .int('id_grupo debe ser un entero')
    .positive('id_grupo inválido')
    .max(2_147_483_647, 'id_grupo inválido'),
  uid: esquemaUid.optional(),
});

export type DatosAlta = z.infer<typeof esquemaAlta>;

const booleanoEnQuery = (campo: string) =>
  z.enum(['true', 'false'], { error: `${campo} debe ser true o false` }).transform((v) => v === 'true');

/** GET /api/estudiantes (P4). */
export const esquemaConsulta = z.object({
  ...camposPaginacion,
  q: z
    .string({ error: 'q debe ser texto' })
    .trim()
    .max(100, 'q es demasiado largo')
    .optional()
    .transform((v) => v || undefined),
  id_grupo: idEnQuery('id_grupo').optional(),
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

/** POST y PUT /api/estudiantes/:id/credencial. El UID nunca regresa en la respuesta. */
export const esquemaCredencial = z.object({ uid: esquemaUid });
