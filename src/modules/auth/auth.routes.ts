import { Router } from 'express';
import { limitePorIp } from '../../middleware/limiteIntentos.js';
import { requiereSesion } from '../../middleware/requiereSesion.js';
import { cerrarSesion, iniciarSesion, usuarioActual } from './auth.controller.js';

export const rutasAuth = Router();

// Las respuestas de autenticación nunca deben quedar en caché.
rutasAuth.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

rutasAuth.post('/login', limitePorIp, iniciarSesion);
rutasAuth.post('/logout', cerrarSesion);
rutasAuth.get('/me', requiereSesion, usuarioActual);
