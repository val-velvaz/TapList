import type { Request, Response } from 'express';
import { HttpError } from '../../utils/HttpError.js';
import { validar } from '../../utils/validacion.js';
import { esquemaAlta, esquemaConsulta, esquemaCredencial, esquemaIdEstudiante } from './estudiantes.schemas.js';
import {
  darDeAlta,
  darDeBaja,
  historialCredenciales,
  listarEstudiantes,
  obtenerEstudiante,
  reemplazarCredencial,
  vincularCredencial,
} from './estudiantes.service.js';

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

/** POST /api/estudiantes (P5): alta, con vinculación opcional de credencial. */
export async function alta(req: Request, res: Response): Promise<void> {
  const datos = validar(esquemaAlta, req.body ?? {}, 'Datos del estudiante inválidos');
  const estudiante = await darDeAlta(datos, req.usuario!.id);
  res.status(201).location(`/api/estudiantes/${estudiante.id}`).json({ estudiante });
}

/** POST /api/estudiantes/:id/credencial (AD-06): vincula una credencial. */
export async function vincular(req: Request, res: Response): Promise<void> {
  const id = idDeRuta(req);
  const { uid } = validar(esquemaCredencial, req.body ?? {}, 'Credencial inválida');
  res.status(201).json({ estudiante: await vincularCredencial(id, uid, req.usuario!.id) });
}

/** PUT /api/estudiantes/:id/credencial (AD-06): reemplaza la credencial activa. */
export async function reemplazar(req: Request, res: Response): Promise<void> {
  const id = idDeRuta(req);
  const { uid } = validar(esquemaCredencial, req.body ?? {}, 'Credencial inválida');
  res.json({ estudiante: await reemplazarCredencial(id, uid, req.usuario!.id) });
}

/** POST /api/estudiantes/:id/baja (AD-07): baja lógica. */
export async function baja(req: Request, res: Response): Promise<void> {
  res.json({ estudiante: await darDeBaja(idDeRuta(req), req.usuario!.id) });
}
