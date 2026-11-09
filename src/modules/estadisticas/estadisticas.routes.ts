import { Router } from 'express';
import { requiereRol } from '../../middleware/requiereRol.js';
import { requiereSesion } from '../../middleware/requiereSesion.js';
import { exportarResumenEstadisticas } from '../exportacion/exportacion.controller.js';
import { estadisticas } from './estadisticas.controller.js';

export const rutasEstadisticas = Router();

// Solo el Docente, y solo sobre las clases que imparte (RF-09).
rutasEstadisticas.use(requiereSesion, requiereRol('Docente'), (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

rutasEstadisticas.get('/', estadisticas);
rutasEstadisticas.get('/exportar', exportarResumenEstadisticas);
