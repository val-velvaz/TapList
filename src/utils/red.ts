import { networkInterfaces } from 'node:os';

/**
 * Direcciones IPv4 de esta computadora en la red local (Wi-Fi, cable o el
 * hotspot de un celular), sin la de loopback. Son las que se escriben en un
 * lector ESP32 que prueba contra esta computadora.
 */
export function direccionesDeRed(interfaces = networkInterfaces()): string[] {
  return Object.values(interfaces)
    .flat()
    .filter((i) => i !== undefined && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address);
}
