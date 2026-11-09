import { Router } from 'express';
import { requiereRol } from '../../middleware/requiereRol.js';
import { requiereSesion } from '../../middleware/requiereSesion.js';
import { detalle, listar } from './estudiantes.controller.js';

export const rutasEstudiantes = Router();

// Todo el módulo es solo para el Administrador (RF-09).
rutasEstudiantes.use(requiereSesion, requiereRol('Administrador'), (_req, res, next) => {
  // Datos personales: no deben quedar en caché.
  res.setHeader('Cache-Control', 'no-store');
  next();
});

rutasEstudiantes.get('/', listar);
rutasEstudiantes.get('/:id', detalle);
