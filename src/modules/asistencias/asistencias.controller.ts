import type { Request, Response } from 'express';
import { validar } from '../../utils/validacion.js';
import { esquemaConsultaAsistencias } from './asistencias.schemas.js';
import { filtrosDelDocente, listarAsistencias } from './asistencias.service.js';

/** GET /api/asistencias (P2): asistencias de las clases del docente de la sesión. */
export async function listar(req: Request, res: Response): Promise<void> {
  const filtros = validar(esquemaConsultaAsistencias, req.query, 'Parámetros de consulta inválidos');
  res.json(await listarAsistencias(req.usuario!.id, filtros));
}

/** GET /api/asistencias/filtros: grupos y clases del docente para los selectores. */
export async function filtros(req: Request, res: Response): Promise<void> {
  res.json(await filtrosDelDocente(req.usuario!.id));
}
