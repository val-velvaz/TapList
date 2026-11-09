import { Router } from 'express';
import { requiereRol } from '../../middleware/requiereRol.js';
import { requiereSesion } from '../../middleware/requiereSesion.js';
import { listarGrupos } from './grupos.service.js';

export const rutasGrupos = Router();

// Por ahora solo lo usa el formulario de alta de estudiantes (P5).
rutasGrupos.use(requiereSesion, requiereRol('Administrador'));

rutasGrupos.get('/', async (_req, res) => {
  res.json({ datos: await listarGrupos() });
});
