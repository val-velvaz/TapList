import { Router } from 'express';
import { limiteFallosDispositivoPorIp, limitePorDispositivo } from '../../middleware/limiteDispositivo.js';
import { requiereDispositivo } from '../../middleware/requiereDispositivo.js';
import { registrarLectura } from './lecturas.controller.js';

export const rutasLecturas = Router();

rutasLecturas.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Orden: fallos por IP (antes de gastar CPU en argon2) → autenticación → límite por dispositivo.
rutasLecturas.post('/', limiteFallosDispositivoPorIp, requiereDispositivo, limitePorDispositivo, registrarLectura);
