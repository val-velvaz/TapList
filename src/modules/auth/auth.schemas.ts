import { z } from 'zod';

const textoObligatorio = (campo: string) =>
  z.string({ error: (i) => (i.input === undefined ? `${campo} es obligatorio` : `${campo} debe ser texto`) });

// Validación de forma (no de credenciales): repite la que hace el frontend (AD-01, paso 2).
export const esquemaLogin = z.object({
  correo: textoObligatorio('El correo')
    .trim()
    .toLowerCase()
    .min(1, 'El correo es obligatorio')
    .max(254, 'El correo es demasiado largo')
    .pipe(z.email('El correo no tiene un formato válido')),
  contrasena: z
    .string({ error: (i) => (i.input === undefined ? 'La contraseña es obligatoria' : 'La contraseña debe ser texto') })
    .min(1, 'La contraseña es obligatoria')
    // Evita que una contraseña enorme se use para gastar CPU en el hash.
    .max(256, 'La contraseña es demasiado larga'),
});

export type DatosLogin = z.infer<typeof esquemaLogin>;
