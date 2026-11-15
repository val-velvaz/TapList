import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { extractText } from 'unpdf';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearApp } from '../src/app.js';
import { cerrarPool, pool } from '../src/db/pool.js';
import { hashearContrasena } from '../src/utils/contrasena.js';
import { CONTRASENA_ADMIN, CORREO_ADMIN, ID_DISPOSITIVO } from './datos.js';

/*
 * =============================================================================
 * Orden alfabético en español, sin depender de la configuración de la base
 * =============================================================================
 * La base de pruebas se crea con la configuración regional «C» (ver
 * `colacionC` en db/preparar-base.ts), que compara byte por byte: las
 * mayúsculas van antes que las minúsculas, y las letras con acento y la «ñ»,
 * al final. Si una consulta ordena un texto sin `ORDEN_ES`, estas pruebas
 * fallan aquí y en el CI.
 *
 * Grupos (docente O)      orden esperado           orden «C» (incorrecto)
 *   Ábaco                   Ábaco                    Nube
 *   álgebra                 álgebra                  Zeta
 *   Nube                    Nube                     Ábaco
 *   Ñu                      Ñu                       Ñu
 *   Zeta                    Zeta                     álgebra
 *
 * Clases: «Ética» (08:00) y «Zoología» (10:00) en Ábaco, y una por cada otro grupo.
 *
 * Estudiantes de Ábaco    orden esperado           orden «C» (incorrecto)
 *   Zúñiga                  alba                     Núñez
 *   alba                    Álvarez                  Ochoa
 *   Álvarez                 Núñez                    Presente
 *   Núñez                   Ñandú                    Zúñiga
 *   Ñandú                   Ochoa                    alba
 *   Ochoa                   Presente                 Álvarez
 *   Presente                Zúñiga                   Ñandú
 *
 * El lunes 5 de octubre solo «Presente» registra en Ética y en Zoología: los
 * otros seis quedan EMPATADOS con 2 faltas y 0 retardos, así que el orden de
 * «más faltas» lo decide el apellido. Con `top=3` entran alba, Álvarez y
 * Núñez; con el orden «C» entrarían Núñez, Ochoa y Zúñiga.
 * En Zeta, «Solo» registra ese día, para que Zeta aparezca en «por clase».
 * =============================================================================
 */

const app = crearApp();
const sufijo = randomBytes(3).toString('hex');
const CONTRASENA = `Docente#${sufijo}`;
const ids = {} as Record<string, number>;
const cookies = {} as Record<'O' | 'admin', string>;

const GRUPOS = ['Zeta', 'álgebra', 'Ñu', 'Ábaco', 'Nube']; // se insertan desordenados
const GRUPOS_EN_ORDEN = ['Ábaco', 'álgebra', 'Nube', 'Ñu', 'Zeta'];
const APELLIDOS = ['Zúñiga', 'alba', 'Álvarez', 'Núñez', 'Ñandú', 'Ochoa', 'Presente'];
const APELLIDOS_EN_ORDEN = ['alba', 'Álvarez', 'Núñez', 'Ñandú', 'Ochoa', 'Presente', 'Zúñiga'];
const CON_FALTAS_EN_ORDEN = APELLIDOS_EN_ORDEN.filter((a) => a !== 'Presente');
const OCTUBRE = { desde: '2026-10-01', hasta: '2026-10-31' };

const nombreGrupo = (g: string) => `${g} ${sufijo}`;
const sinSufijo = (nombre: string) => nombre.replace(` ${sufijo}`, '');

async function uno<T extends Record<string, unknown>>(sql: string, valores: unknown[]): Promise<T> {
  return (await pool.query<T>(sql, valores)).rows[0]!;
}

async function iniciarSesion(correo: string, contrasena: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ correo, contrasena });
  expect(res.status).toBe(200);
  return res.headers['set-cookie']![0]!.split(';')[0]!;
}

async function crearEstudiante(clave: string, apellidos: string, grupo: string): Promise<void> {
  ids[clave] = (
    await uno<{ id_estudiante: number }>(
      `INSERT INTO estudiante (matricula, nombre, apellidos, correo, id_grupo)
       VALUES ($1, 'Orden', $2, $3, $4) RETURNING id_estudiante`,
      [`${clave}X${sufijo}`.toUpperCase(), apellidos, `${clave.toLowerCase()}.${sufijo}@alumnos.udg.mx`, ids[grupo]],
    )
  ).id_estudiante;
  // La inscripción que creó el trigger empieza hoy; el escenario es de octubre.
  await pool.query(`UPDATE inscripcion_grupo SET desde = '2026-09-01' WHERE id_estudiante = $1`, [ids[clave]]);
}

async function registrar(clase: string, estudiante: string): Promise<void> {
  await pool.query(
    `INSERT INTO asistencia (id_estudiante, id_clase, id_dispositivo, fecha, hora, estado)
     VALUES ($1, $2, $3, '2026-10-05', '08:05', 'Asistencia')`,
    [ids[estudiante], ids[clase], ID_DISPOSITIVO],
  );
}

beforeAll(async () => {
  ids.docente = (
    await uno<{ id_usuario: number }>(
      `INSERT INTO usuario (nombre, apellidos, correo, contrasena_hash, rol)
       VALUES ('Docente O', 'Orden', $1, $2, 'Docente') RETURNING id_usuario`,
      [`orden.${sufijo}@academicos.udg.mx`, await hashearContrasena(CONTRASENA)],
    )
  ).id_usuario;

  for (const g of GRUPOS) {
    ids[g] = (
      await uno<{ id_grupo: number }>(
        `INSERT INTO grupo (nombre, nivel_grado, ciclo_escolar) VALUES ($1, 'Pruebas', '2026-B') RETURNING id_grupo`,
        [nombreGrupo(g)],
      )
    ).id_grupo;
  }

  // «Zoología» se inserta antes que «Ética» para que el id no dé el orden correcto por casualidad.
  const clases: Array<[string, string, string]> = [
    ['Zoología', 'Ábaco', '10:00'],
    ['Ética', 'Ábaco', '08:00'],
    ['Clase Zeta', 'Zeta', '08:00'],
    ['Clase álgebra', 'álgebra', '08:00'],
    ['Clase Ñu', 'Ñu', '08:00'],
    ['Clase Nube', 'Nube', '08:00'],
  ];
  for (const [materia, grupo, hora] of clases) {
    ids[materia] = (
      await uno<{ id_clase: number }>(
        `INSERT INTO clase (id_grupo, id_docente, materia, dia_semana, hora_inicio, tolerancia_min)
         VALUES ($1, $2, $3, 1, $4, 10) RETURNING id_clase`,
        [ids[grupo], ids.docente, materia, hora],
      )
    ).id_clase;
  }

  for (const [i, apellidos] of APELLIDOS.entries()) await crearEstudiante(`O${i}`, apellidos, 'Ábaco');
  await crearEstudiante('OZ', 'Solo', 'Zeta');

  const presente = `O${APELLIDOS.indexOf('Presente')}`;
  await registrar('Ética', presente);
  await registrar('Zoología', presente);
  await registrar('Clase Zeta', 'OZ');

  cookies.O = await iniciarSesion(`orden.${sufijo}@academicos.udg.mx`, CONTRASENA);
  cookies.admin = await iniciarSesion(CORREO_ADMIN, CONTRASENA_ADMIN);
});

afterAll(() => cerrarPool());

const comoDocente = (ruta: string, query: Record<string, string | number> = {}) =>
  request(app).get(ruta).set('Cookie', cookies.O).query(query);

const binario = (res: NodeJS.ReadableStream, fin: (error: Error | null, cuerpo: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => fin(null, Buffer.concat(partes)));
};
const descargar = (ruta: string, query: Record<string, string | number>) =>
  comoDocente(ruta, query).buffer(true).parse(binario as never);

type ConMasFaltas = { estudiante: { apellidos: string; matricula: string }; faltas: number; retardos: number };

describe('La base de pruebas usa la configuración «C»', () => {
  it('sin ORDEN_ES, PostgreSQL pone los acentos y la «ñ» al final', async () => {
    const { rows } = await pool.query<{ datcollate: string }>(
      'SELECT datcollate FROM pg_database WHERE datname = current_database()',
    );
    expect(rows[0]!.datcollate).toBe('C');

    const sinOrden = await pool.query<{ a: string }>(`SELECT a FROM unnest($1::text[]) AS a ORDER BY a`, [APELLIDOS]);
    expect(sinOrden.rows.map((f) => f.a)).toEqual(['Núñez', 'Ochoa', 'Presente', 'Zúñiga', 'alba', 'Álvarez', 'Ñandú']);
  });
});

describe('Orden alfabético en español', () => {
  it('P4: la lista de estudiantes sale por apellidos, con acentos, «ñ» y minúsculas en su lugar', async () => {
    const res = await request(app)
      .get('/api/estudiantes')
      .set('Cookie', cookies.admin)
      .query({ id_grupo: ids['Ábaco']!, por_pagina: 50 })
      .expect(200);
    expect(res.body.datos.map((e: { apellidos: string }) => e.apellidos)).toEqual(APELLIDOS_EN_ORDEN);
  });

  it('P4: el orden se mantiene al paginar', async () => {
    const paginas = await Promise.all(
      [1, 2, 3, 4].map((pagina) =>
        request(app)
          .get('/api/estudiantes')
          .set('Cookie', cookies.admin)
          .query({ id_grupo: ids['Ábaco']!, por_pagina: 2, pagina }),
      ),
    );
    expect(paginas.flatMap((p) => p.body.datos.map((e: { apellidos: string }) => e.apellidos))).toEqual(APELLIDOS_EN_ORDEN);
  });

  it('P5: los grupos del formulario salen en orden', async () => {
    const res = await request(app).get('/api/grupos').set('Cookie', cookies.admin).expect(200);
    const mios = res.body.datos.filter((g: { nombre: string }) => g.nombre.endsWith(` ${sufijo}`));
    expect(mios.map((g: { nombre: string }) => sinSufijo(g.nombre))).toEqual(GRUPOS_EN_ORDEN);
  });

  it('P2: los selectores de grupos y clases salen en orden', async () => {
    const res = await comoDocente('/api/asistencias/filtros').expect(200);
    expect(res.body.grupos.map((g: { nombre: string }) => sinSufijo(g.nombre))).toEqual(GRUPOS_EN_ORDEN);
    expect(res.body.clases.map((c: { materia: string }) => c.materia)).toEqual([
      'Ética',
      'Zoología',
      'Clase álgebra',
      'Clase Nube',
      'Clase Ñu',
      'Clase Zeta',
    ]);
  });

  it('P3: «por clase» sale por grupo y luego por materia', async () => {
    const res = await comoDocente('/api/estadisticas', OCTUBRE).expect(200);
    expect(
      res.body.por_clase.map((c: { grupo: { nombre: string }; clase: { materia: string } }) => [sinSufijo(c.grupo.nombre), c.clase.materia]),
    ).toEqual([
      ['Ábaco', 'Ética'],
      ['Ábaco', 'Zoología'],
      ['Zeta', 'Clase Zeta'],
    ]);
  });

  it('P3: con las faltas empatadas, «más faltas» sale por apellidos', async () => {
    const res = await comoDocente('/api/estadisticas', OCTUBRE).expect(200);
    const lista: ConMasFaltas[] = res.body.estudiantes_con_mas_faltas;
    expect(lista.map((e) => [e.faltas, e.retardos])).toEqual(CON_FALTAS_EN_ORDEN.map(() => [2, 0]));
    expect(lista.map((e) => e.estudiante.apellidos)).toEqual(CON_FALTAS_EN_ORDEN);
  });

  it('P3: con `top`, el empate lo ganan los primeros apellidos del alfabeto', async () => {
    const res = await comoDocente('/api/estadisticas', { ...OCTUBRE, top: 3 }).expect(200);
    const lista: ConMasFaltas[] = res.body.estudiantes_con_mas_faltas;
    expect(lista.map((e) => e.estudiante.apellidos)).toEqual(['alba', 'Álvarez', 'Núñez']);
  });

  it('XLSX de estadísticas: «Más faltas» y «por clase» en el mismo orden', async () => {
    const res = await descargar('/api/estadisticas/exportar', { ...OCTUBRE, formato: 'xlsx' });
    expect(res.status).toBe(200);

    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body as unknown as ArrayBuffer);
    const textoDe = (hoja: string): string => {
      const celdas: string[] = [];
      libro.getWorksheet(hoja)!.eachRow((fila) => celdas.push(...(fila.values as unknown[]).slice(1).map(String)));
      return celdas.join('\n');
    };
    enOrden(textoDe('Más faltas'), CON_FALTAS_EN_ORDEN);
    const todo = libro.worksheets.map((h) => textoDe(h.name)).join('\n');
    enOrden(todo, ['Ética', 'Zoología', 'Clase Zeta']);
  });

  it('PDF de estadísticas: «Más faltas» en el mismo orden', async () => {
    const res = await descargar('/api/estadisticas/exportar', { ...OCTUBRE, formato: 'pdf' });
    expect(res.status).toBe(200);
    const { text } = await extractText(new Uint8Array(res.body as Buffer), { mergePages: true });
    enOrden(text, CON_FALTAS_EN_ORDEN);
  });
});

/** Comprueba que cada texto aparece, y que aparecen en ese orden. */
function enOrden(contenido: string, textos: string[]): void {
  const posiciones = textos.map((t) => contenido.indexOf(t));
  expect(posiciones.every((p) => p >= 0), `faltan textos: ${textos.filter((_, i) => posiciones[i]! < 0).join(', ')}`).toBe(true);
  expect(posiciones).toEqual([...posiciones].sort((a, b) => a - b));
}
