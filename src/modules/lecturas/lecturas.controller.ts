import type { Request, Response } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { esquemaLectura } from './lecturas.schemas.js';
import { procesarLectura } from './lecturas.service.js';

/** POST /api/dispositivo/lecturas — requiere requiereDispositivo. */
export async function registrarLectura(req: Request, res: Response): Promise<void> {
  const validacion = esquemaLectura.safeParse(req.body ?? {});
  if (!validacion.success) {
    const detalles: Record<string, string> = {};
    for (const issue of validacion.error.issues) {
      const campo = String(issue.path[0] ?? 'body');
      detalles[campo] ??= issue.message;
    }
    throw new HttpError(400, 'Lectura inválida', detalles);
  }
  const { uid, leido_en } = validacion.data;

  try {
    const resultado = await procesarLectura({
      uid,
      idDispositivo: req.dispositivo!.id,
      ahora: new Date(),
      leidoEn: leido_en ? new Date(leido_en) : undefined,
    });
    res.status(200).json(resultado);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // El dispositivo mostrará los 3 destellos azules (no guardada).
    console.error('[lecturas] No se pudo guardar la lectura:', error);
    throw new HttpError(500, 'No se pudo guardar');
  }
}
