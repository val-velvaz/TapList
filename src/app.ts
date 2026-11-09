import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { manejoErrores, rutaNoEncontrada } from './middleware/manejoErrores.js';
import { requiereRol } from './middleware/requiereRol.js';
import { requiereSesion } from './middleware/requiereSesion.js';
import { rutasAuth } from './modules/auth/auth.routes.js';
import { rutasEstudiantes } from './modules/estudiantes/estudiantes.routes.js';
import { rutasGrupos } from './modules/grupos/grupos.routes.js';
import { rutasLecturas } from './modules/lecturas/lecturas.routes.js';

export function crearApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.use('/api/auth', rutasAuth);
  app.use('/api/dispositivo/lecturas', rutasLecturas);
  app.use('/api/estudiantes', rutasEstudiantes);
  app.use('/api/grupos', rutasGrupos);
  // Aquí se montarán los módulos siguientes, p. ej.:
  //   app.use('/api/asistencias', rutasAsistencias);

  if (env.NODE_ENV === 'test') {
    // Ruta que solo existe en pruebas, para verificar requiereRol.
    app.get('/api/prueba/solo-administrador', requiereSesion, requiereRol('Administrador'), (req, res) => {
      res.json({ ok: true, rol: req.usuario?.rol });
    });
  }

  app.use(rutaNoEncontrada);
  app.use(manejoErrores);
  return app;
}
