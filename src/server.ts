import { crearApp } from './app.js';
import { env } from './config/env.js';
import { cerrarPool } from './db/pool.js';

const servidor = crearApp().listen(env.PORT, () => {
  console.log(`API de TapList escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
});

function apagar(senal: string): void {
  console.log(`${senal} recibido, cerrando el servidor…`);
  servidor.close(() => {
    cerrarPool().finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
