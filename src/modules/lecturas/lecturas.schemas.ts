import { z } from 'zod';
import { normalizarUid } from '../../utils/uid.js';

/**
 * UID de una credencial NFC: acepta mayúsculas o minúsculas, espacios y dos
 * puntos, y lo normaliza a hexadecimal en mayúsculas de 8 a 20 caracteres.
 * Lo comparten las lecturas del dispositivo y la vinculación de credenciales,
 * para que un UID capturado en la web coincida con el que envía el ESP32.
 */
export const esquemaUid = z
  .string({ error: (i) => (i.input === undefined ? 'El UID es obligatorio' : 'El UID debe ser texto') })
  .max(64, 'El UID es demasiado largo')
  .transform(normalizarUid)
  .pipe(z.string().regex(/^[0-9A-F]{8,20}$/, 'El UID debe ser hexadecimal de 8 a 20 caracteres'));

// Cuerpo de POST /api/dispositivo/lecturas (ver docs/contrato-dispositivo.md).
export const esquemaLectura = z.object({
  uid: esquemaUid,
  // Solo para lecturas guardadas sin conexión. Debe incluir la zona horaria.
  leido_en: z.iso
    .datetime({ offset: true, error: 'leido_en debe ser una fecha ISO 8601 con zona horaria' })
    .optional(),
});

export type DatosLectura = z.infer<typeof esquemaLectura>;
