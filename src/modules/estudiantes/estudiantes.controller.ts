import type { Request, Response } from 'express';
import type { z } from 'zod';
import { HttpError } from '../../utils/HttpError.js';
import { esquemaConsulta, esquemaIdEstudiante } from './estudiantes.schemas.js';
import { historialCredenciales, listarEstudiantes, obtenerEstudiante } from './estudiantes.service.js';

/** Valida con zod y lanza 400 con un mensaje por campo (el primero que falló). */
export function validar<T extends z.ZodType>(esquema: T, datos: unknown, mensaje: string): z.infer<T> {
  const resultado = esquema.safeParse(datos);
  if (resultado.success) return resultado.data;
  const detalles: Record<string, string> = {};
  for (const issue of resultado.error.issues) {
    const campo = String(issue.path[0] ?? 'body');
    detalles[campo] ??= issue.message;
  }
  throw new HttpError(400, mensaje, detalles);
}

export function idDeRuta(req: Request): number {
  const resultado = esquemaIdEstudiante.safeParse(req.params.id);
  if (!resultado.success) throw new HttpError(400, resultado.error.issues[0]?.message ?? 'id inválido');
  return resultado.data;
}

/** GET /api/estudiantes (P4) */
export async function listar(req: Request, res: Response): Promise<void> {
  const filtros = validar(esquemaConsulta, req.query, 'Parámetros de consulta inválidos');
  res.json(await listarEstudiantes(filtros));
}

/** GET /api/estudiantes/:id (P5): el estudiante y el historial de sus credenciales. */
export async function detalle(req: Request, res: Response): Promise<void> {
  const id = idDeRuta(req);
  const estudiante = await obtenerEstudiante(id);
  if (!estudiante) throw new HttpError(404, 'El estudiante no existe');
  res.json({ estudiante, historial_credenciales: await historialCredenciales(id) });
}
