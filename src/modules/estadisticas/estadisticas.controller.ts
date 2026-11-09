import type { Request, Response } from 'express';
import { validar } from '../../utils/validacion.js';
import { esquemaEstadisticas } from './estadisticas.schemas.js';
import { calcularEstadisticas } from './estadisticas.service.js';

/** GET /api/estadisticas (P3) */
export async function estadisticas(req: Request, res: Response): Promise<void> {
  const filtros = validar(esquemaEstadisticas, req.query, 'Parámetros de consulta inválidos');
  res.json(await calcularEstadisticas(req.usuario!.id, filtros));
}
