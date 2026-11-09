/**
 * Antes de todas las pruebas: recrea la base de pruebas (PGDATABASE_TEST),
 * corre las migraciones, carga la semilla y agrega los datos que la semilla
 * no trae: una cuenta inactiva, un dispositivo inactivo, una credencial
 * inactiva y un estudiante inactivo.
 */
import 'dotenv/config';
import pg from 'pg';
import { prepararBase } from '../db/preparar-base.js';
import { hashearContrasena } from '../src/utils/contrasena.js';
import {
  CLAVE_DISPOSITIVO_INACTIVO,
  CONTRASENA_DOCENTE,
  CORREO_INACTIVO,
  UID_CREDENCIAL_INACTIVA,
  UID_ESTUDIANTE_INACTIVO,
} from './datos.js';

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

    await cliente.query(
      `INSERT INTO dispositivo (nombre_ubicacion, estado, clave_api_hash)
       VALUES ('Lector dado de baja', 'Inactivo', $1)`,
      [await hashearContrasena(CLAVE_DISPOSITIVO_INACTIVO)],
    );

    await cliente.query(
      `WITH grupo_d01 AS (SELECT id_grupo FROM grupo WHERE nombre = 'D01'),
            nuevos AS (
              INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo, activo)
              SELECT v.matricula, v.nombre, 'Prueba', v.correo, g.id_grupo, v.activo
                FROM (VALUES ('T00000001', 'ConCredencialInactiva', 'cred.inactiva@alumnos.udg.mx', true),
                             ('T00000002', 'EstudianteInactivo',    'est.inactivo@alumnos.udg.mx',  false))
                     AS v (matricula, nombre, correo, activo), grupo_d01 g
              RETURNING id_estudiante, matricula)
       INSERT INTO credencial_nfc (uid, id_estudiante, activa)
       SELECT CASE n.matricula WHEN 'T00000001' THEN $1 ELSE $2 END,
              n.id_estudiante,
              n.matricula <> 'T00000001'
         FROM nuevos n`,
      [UID_CREDENCIAL_INACTIVA, UID_ESTUDIANTE_INACTIVO],
    );
  } finally {
    await cliente.end();
  }
}
