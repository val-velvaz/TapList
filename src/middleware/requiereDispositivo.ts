import type { RequestHandler } from 'express';
import { autenticarDispositivo, registrarConexion } from '../modules/dispositivos/dispositivos.service.js';
import { HttpError } from '../utils/HttpError.js';

export const MENSAJE_DISPOSITIVO_NO_AUTENTICADO = 'Dispositivo no autenticado';

/**
 * Exige un dispositivo registrado y activo (RNF-03). Lee las cabeceras
 * X-Dispositivo-Id y X-Dispositivo-Clave, compara la clave con su hash y
 * actualiza ultima_conexion. Deja el dispositivo en req.dispositivo.
 *
 *   401: faltan las cabeceras, el id no existe o la clave no coincide.
 *   403: la clave es correcta, pero el estado no es 'Activo'.
 */
export const requiereDispositivo: RequestHandler = async (req, _res, next) => {
  const idTexto = req.get('X-Dispositivo-Id');
  const clave = req.get('X-Dispositivo-Clave');
  if (!idTexto || !/^[1-9]\d{0,8}$/.test(idTexto) || !clave || clave.length > 256) {
    throw new HttpError(401, MENSAJE_DISPOSITIVO_NO_AUTENTICADO);
  }

  const resultado = await autenticarDispositivo(Number(idTexto), clave);
  if (resultado.tipo === 'clave_invalida') throw new HttpError(401, MENSAJE_DISPOSITIVO_NO_AUTENTICADO);
  if (resultado.tipo === 'inactivo') throw new HttpError(403, 'El dispositivo no está activo');

  await registrarConexion(resultado.dispositivo.id);
  req.dispositivo = resultado.dispositivo;
  next();
};
