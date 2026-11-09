import { Router } from 'express';
import { requiereRol } from '../../middleware/requiereRol.js';
import { requiereSesion } from '../../middleware/requiereSesion.js';
import { filtros, listar } from './asistencias.controller.js';

export const rutasAsistencias = Router();

// Solo el Docente, y solo sobre las clases que imparte (RF-09).
rutasAsistencias.use(requiereSesion, requiereRol('Docente'), (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

rutasAsistencias.get('/', listar);
rutasAsistencias.get('/filtros', filtros);
