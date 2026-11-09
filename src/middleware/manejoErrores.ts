import type { ErrorRequestHandler, RequestHandler } from 'express';
import { errorParaLog } from '../utils/erroresPg.js';
import { HttpError } from '../utils/HttpError.js';

export const rutaNoEncontrada: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'Recurso no encontrado'));
};

/** Convierte cualquier error en una respuesta JSON sin filtrar detalles internos. */
export const manejoErrores: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(error.detalles ? { error: error.message, detalles: error.detalles } : { error: error.message });
    return;
  }
  // Errores de express.json(): cuerpo mal formado o demasiado grande.
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'El cuerpo de la solicitud debe ser JSON válido' });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'El cuerpo de la solicitud es demasiado grande' });
    return;
  }

  console.error(errorParaLog(error));
  res.status(500).json({ error: 'Error interno del servidor' });
};
