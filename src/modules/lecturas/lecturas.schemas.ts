import { z } from 'zod';
import { normalizarUid } from '../../utils/uid.js';

// Cuerpo de POST /api/dispositivo/lecturas (ver docs/contrato-dispositivo.md).
export const esquemaLectura = z.object({
  uid: z
    .string({ error: (i) => (i.input === undefined ? 'El UID es obligatorio' : 'El UID debe ser texto') })
    .max(64, 'El UID es demasiado largo')
    .transform(normalizarUid)
    .pipe(z.string().regex(/^[0-9A-F]{8,20}$/, 'El UID debe ser hexadecimal de 8 a 20 caracteres')),
  // Solo para lecturas guardadas sin conexión. Debe incluir la zona horaria.
  leido_en: z.iso
    .datetime({ offset: true, error: 'leido_en debe ser una fecha ISO 8601 con zona horaria' })
    .optional(),
});

export type DatosLectura = z.infer<typeof esquemaLectura>;
