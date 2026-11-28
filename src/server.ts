import { crearApp } from './app.js';
import { env } from './config/env.js';
import { cerrarPool } from './db/pool.js';
import { cerrarConexionesTiempoReal } from './modules/asistencias/asistencias.tiempoReal.js';
import { direccionesDeRed } from './utils/red.js';

// Sin indicar dirección, Node escucha en todas las interfaces de red: la API
// responde en localhost y también a otros equipos de la misma red (p. ej. un
// lector ESP32 de prueba). En producción, el firewall o el proxy inverso
// deciden quién llega.
const servidor = crearApp().listen(env.PORT, () => {
  console.log(`API de TapList escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
  if (env.NODE_ENV !== 'production') {
    for (const ip of direccionesDeRed()) console.log(`  Desde otro equipo de esta red: http://${ip}:${env.PORT}`);
  }
});

function apagar(senal: string): void {
  console.log(`${senal} recibido, cerrando el servidor…`);
  servidor.close(() => {
    cerrarPool().finally(() => process.exit(0));
  });
  // Los flujos SSE nunca terminan solos: sin cerrarlos, close() esperaría para siempre.
  cerrarConexionesTiempoReal();
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
