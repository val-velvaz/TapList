import 'dotenv/config';
import { z } from 'zod';

// Valida las variables de entorno una sola vez al arrancar. Si falta algo,
// el proceso termina con un mensaje claro en lugar de fallar más tarde.
const esquemaEnv = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  PGHOST: z.string().min(1).default('localhost'),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGUSER: z.string().min(1),
  // Puede quedar vacía si la contraseña viene de pgpass.conf.
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().min(1),
  PGDATABASE_TEST: z.string().min(1).default('taplist_test'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_EXPIRACION_HORAS: z.coerce.number().positive().default(8),

  LOGIN_MAX_INTENTOS: z.coerce.number().int().positive().default(5),
  LOGIN_MAX_INTENTOS_IP: z.coerce.number().int().positive().default(20),
  LOGIN_VENTANA_MINUTOS: z.coerce.number().positive().default(15),
});

const resultado = esquemaEnv.safeParse(process.env);
if (!resultado.success) {
  const detalles = resultado.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Configuración inválida en .env:\n${detalles}`);
  process.exit(1);
}

export const env = resultado.data;
export const esProduccion = env.NODE_ENV === 'production';
/** Base que usa el servidor: en pruebas se usa la base aislada. */
export const baseDatos = env.NODE_ENV === 'test' ? env.PGDATABASE_TEST : env.PGDATABASE;
