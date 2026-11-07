import type { RequestHandler } from 'express';
import { MemoryStore, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { MENSAJE_DEMASIADOS_INTENTOS } from './limiteIntentos.js';

// ---------------------------------------------------------------------------
// Antes de autenticar: límite de fallos (401) por IP. Protege la verificación
// argon2 de ataques de fuerza bruta. No se cuenta por X-Dispositivo-Id porque
// entonces un atacante podría bloquear al lector real mandando claves falsas.
// ---------------------------------------------------------------------------
const almacenFallosIp = new MemoryStore();

export const limiteFallosDispositivoPorIp: RequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.DISPOSITIVO_MAX_FALLOS_IP,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode !== 401,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: almacenFallosIp,
  message: { error: MENSAJE_DEMASIADOS_INTENTOS },
});

// ---------------------------------------------------------------------------
// Después de autenticar: solicitudes por minuto de cada dispositivo, para que
// un dispositivo comprometido no pueda saturar la API.
// ---------------------------------------------------------------------------
const almacenPorDispositivo = new MemoryStore();

export const limitePorDispositivo: RequestHandler = rateLimit({
  windowMs: 60 * 1000,
  limit: env.DISPOSITIVO_MAX_SOLICITUDES_MINUTO,
  keyGenerator: (req) => `dispositivo:${req.dispositivo?.id}`,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: almacenPorDispositivo,
  message: { error: 'Demasiadas solicitudes de este dispositivo. Intenta de nuevo en un minuto.' },
});

/** Solo para pruebas: deja ambos limitadores en cero. */
export function reiniciarLimitesDispositivo(): void {
  almacenFallosIp.resetAll();
  almacenPorDispositivo.resetAll();
}
