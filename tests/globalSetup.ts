/**
 * Antes de todas las pruebas: recrea la base de pruebas (PGDATABASE_TEST),
 * corre las migraciones, carga la semilla y agrega una cuenta inactiva.
 */
import 'dotenv/config';
import pg from 'pg';
import { prepararBase } from '../db/preparar-base.js';
import { hashearContrasena } from '../src/utils/contrasena.js';
import { CONTRASENA_DOCENTE, CORREO_INACTIVO } from './datos.js';

export default async function setup(): Promise<void> {
  const nombre = process.env.PGDATABASE_TEST;
  if (!nombre) throw new Error('Falta PGDATABASE_TEST en el archivo .env');

  await prepararBase(nombre, { reiniciar: true, sembrar: true });

  const cliente = new pg.Client({ database: nombre });
  await cliente.connect();
  try {
    await cliente.query(
      `INSERT INTO usuario (nombre, apellidos, correo, contrasena_hash, rol, activo)
       VALUES ('Cuenta', 'Inactiva', $1, $2, 'Docente', false)`,
      [CORREO_INACTIVO, await hashearContrasena(CONTRASENA_DOCENTE)],
    );
  } finally {
    await cliente.end();
  }
}
