import type { RequestHandler } from 'express';
import { MemoryStore, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const ventanaMs = env.LOGIN_VENTANA_MINUTOS * 60 * 1000;
export const MENSAJE_DEMASIADOS_INTENTOS = 'Demasiados intentos. Intenta de nuevo más tarde.';

// ---------------------------------------------------------------------------
// Límite por IP: cuenta solo las respuestas con error (4xx/5xx).
// ---------------------------------------------------------------------------
const almacenIp = new MemoryStore();

export const limitePorIp: RequestHandler = rateLimit({
  windowMs: ventanaMs,
  limit: env.LOGIN_MAX_INTENTOS_IP,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  store: almacenIp,
  message: { error: MENSAJE_DEMASIADOS_INTENTOS },
});

// ---------------------------------------------------------------------------
// Límite por correo: cuenta solo los intentos con credenciales incorrectas y
// se reinicia con un login exitoso. Se lleva aparte porque express-rate-limit
// cuenta antes de conocer el resultado y aquí la clave sale del body ya validado.
// Vive en memoria: con varias instancias del servidor habría que moverlo a Redis.
// ---------------------------------------------------------------------------
interface Registro {
  fallos: number;
  expiraEn: number;
}

class LimitadorPorCorreo {
  private readonly registros = new Map<string, Registro>();

  constructor(
    private readonly maxFallos: number,
    private readonly ventanaMs: number,
  ) {
    // Limpia periódicamente los registros vencidos; unref() no impide cerrar el proceso.
    setInterval(() => this.limpiar(), ventanaMs).unref();
  }

  /** Segundos que faltan para poder intentar de nuevo, o 0 si no está bloqueado. */
  segundosBloqueado(correo: string): number {
    const registro = this.vigente(correo);
    if (!registro || registro.fallos < this.maxFallos) return 0;
    return Math.ceil((registro.expiraEn - Date.now()) / 1000);
  }

  registrarFallo(correo: string): void {
    const registro = this.vigente(correo);
    if (registro) registro.fallos += 1;
    else this.registros.set(correo, { fallos: 1, expiraEn: Date.now() + this.ventanaMs });
  }

  reiniciar(correo: string): void {
    this.registros.delete(correo);
  }

  reiniciarTodo(): void {
    this.registros.clear();
  }

  private vigente(correo: string): Registro | undefined {
    const registro = this.registros.get(correo);
    if (registro && registro.expiraEn <= Date.now()) {
      this.registros.delete(correo);
      return undefined;
    }
    return registro;
  }

  private limpiar(): void {
    const ahora = Date.now();
    for (const [correo, registro] of this.registros) {
      if (registro.expiraEn <= ahora) this.registros.delete(correo);
    }
  }
}

export const limitePorCorreo = new LimitadorPorCorreo(env.LOGIN_MAX_INTENTOS, ventanaMs);

/** Solo para pruebas: deja ambos limitadores en cero. */
export function reiniciarLimitesLogin(): void {
  almacenIp.resetAll();
  limitePorCorreo.reiniciarTodo();
}
