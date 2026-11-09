import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const dirDb = path.dirname(fileURLToPath(import.meta.url));

export interface OpcionesPreparacion {
  /** Borra la base si ya existe. Sin esta opción, una base existente detiene el proceso. */
  reiniciar: boolean;
  /** Carga los datos de prueba después de las migraciones. */
  sembrar: boolean;
}

function conexionBase(database: string): pg.ClientConfig {
  // pg toma PGHOST, PGPORT, PGUSER y PGPASSWORD del entorno (.env). La zona
  // horaria es la de la escuela, igual que en el pool de la aplicación, para
  // que las migraciones calculen las fechas en el mismo día.
  const zona = process.env.ZONA_HORARIA_ESCUELA || 'America/Mexico_City';
  if (!/^[A-Za-z0-9_+\-/]+$/.test(zona)) throw new Error(`ZONA_HORARIA_ESCUELA inválida: "${zona}"`);
  return { database, options: `-c timezone=${zona}` };
}

async function ejecutarCarpeta(cliente: pg.Client, carpeta: string): Promise<string[]> {
  const ruta = path.join(dirDb, carpeta);
  const archivos = (await readdir(ruta)).filter((a) => a.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    await cliente.query(await readFile(path.join(ruta, archivo), 'utf8'));
  }
  return archivos;
}

/**
 * Crea la base `nombre`, aplica las migraciones en orden y, si se pide,
 * carga la semilla. Devuelve los archivos ejecutados.
 */
export async function prepararBase(nombre: string, opciones: OpcionesPreparacion): Promise<string[]> {
  if (!/^[a-z_][a-z0-9_]*$/.test(nombre)) {
    throw new Error(`Nombre de base inválido: "${nombre}" (usa minúsculas, números y _)`);
  }

  const admin = new pg.Client(conexionBase('postgres'));
  await admin.connect();
  try {
    const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [nombre]);
    if (rowCount) {
      if (!opciones.reiniciar) {
        throw new Error(`La base "${nombre}" ya existe. Usa --reset para borrarla y crearla de nuevo.`);
      }
      await admin.query(`DROP DATABASE ${nombre} WITH (FORCE)`);
    }
    await admin.query(`CREATE DATABASE ${nombre} ENCODING 'UTF8' TEMPLATE template0`);
  } finally {
    await admin.end();
  }

  const cliente = new pg.Client(conexionBase(nombre));
  await cliente.connect();
  try {
    const ejecutados = (await ejecutarCarpeta(cliente, 'migrations')).map((a) => `migrations/${a}`);
    if (opciones.sembrar) {
      ejecutados.push(...(await ejecutarCarpeta(cliente, 'seeds')).map((a) => `seeds/${a}`));
    }
    return ejecutados;
  } finally {
    await cliente.end();
  }
}
