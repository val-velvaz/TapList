import type { Request, Response } from 'express';
import { validar } from '../../utils/validacion.js';
import { esquemaExportarAsistencias } from '../asistencias/asistencias.schemas.js';
import { esquemaExportarEstadisticas } from '../estadisticas/estadisticas.schemas.js';
import { exportarAsistencias, exportarEstadisticas } from './exportacion.service.js';
import { type Archivo, TIPO_MIME } from './exportacion.tipos.js';

function enviar(res: Response, archivo: Archivo): void {
  // El nombre es solo ASCII (aSlug), así que Content-Disposition no necesita filename*.
  res.attachment(archivo.nombre).type(TIPO_MIME[archivo.formato]).send(archivo.contenido);
}

/** GET /api/asistencias/exportar?formato=pdf|xlsx&… (mismos filtros que la lista) */
export async function exportarListaAsistencias(req: Request, res: Response): Promise<void> {
  const filtros = validar(esquemaExportarAsistencias, req.query, 'Parámetros de exportación inválidos');
  enviar(res, await exportarAsistencias(req.usuario!, filtros));
}

/** GET /api/estadisticas/exportar?formato=pdf|xlsx&… (mismos parámetros que las estadísticas) */
export async function exportarResumenEstadisticas(req: Request, res: Response): Promise<void> {
  const filtros = validar(esquemaExportarEstadisticas, req.query, 'Parámetros de exportación inválidos');
  enviar(res, await exportarEstadisticas(req.usuario!, filtros));
}
