import type { PoolClient } from 'pg';
import { pool } from '../../db/pool.js';
import type { FiltrosConsulta } from './estudiantes.schemas.js';

// En las consultas de este módulo el UID se enmascara dentro del SQL, así
// que el UID completo nunca sale de la base hacia la aplicación (RNF-06).
const UID_ENMASCARADO_SQL = `'****' || right(c.uid, 4)`;

export interface CredencialPublica {
  id: number;
  uid_enmascarado: string;
  activa: boolean;
  fecha_asignacion: string;
}

export interface EstudiantePublico {
  id: number;
  matricula: string;
  nombre: string;
  apellidos: string;
  correo: string;
  activo: boolean;
  grupo: { id: number; nombre: string; ciclo_escolar: string };
  /** La credencial activa, o null si no tiene. */
  credencial: CredencialPublica | null;
}

export interface PaginaEstudiantes {
  datos: EstudiantePublico[];
  pagina: number;
  por_pagina: number;
  total: number;
  total_paginas: number;
}

interface FilaEstudiante {
  id_estudiante: number;
  matricula: string;
  nombre: string;
  apellidos: string;
  correo: string;
  activo: boolean;
  id_grupo: number;
  grupo_nombre: string;
  ciclo_escolar: string;
  id_credencial: number | null;
  uid_enmascarado: string | null;
  credencial_activa: boolean | null;
  fecha_asignacion: Date | null;
}

const SELECT_ESTUDIANTE = `
  SELECT e.id_estudiante, e.matricula, e.nombre, e.apellidos, e.correo, e.activo,
         g.id_grupo, g.nombre AS grupo_nombre, g.ciclo_escolar,
         c.id_credencial, ${UID_ENMASCARADO_SQL} AS uid_enmascarado,
         c.activa AS credencial_activa, c.fecha_asignacion
    FROM estudiante e
    JOIN grupo g ON g.id_grupo = e.id_grupo
    LEFT JOIN credencial_nfc c ON c.id_estudiante = e.id_estudiante AND c.activa`;

function aEstudiantePublico(fila: FilaEstudiante): EstudiantePublico {
  return {
    id: fila.id_estudiante,
    matricula: fila.matricula,
    nombre: fila.nombre,
    apellidos: fila.apellidos,
    correo: fila.correo,
    activo: fila.activo,
    grupo: { id: fila.id_grupo, nombre: fila.grupo_nombre, ciclo_escolar: fila.ciclo_escolar },
    credencial:
      fila.id_credencial === null
        ? null
        : {
            id: fila.id_credencial,
            uid_enmascarado: fila.uid_enmascarado!,
            activa: fila.credencial_activa!,
            fecha_asignacion: fila.fecha_asignacion!.toISOString(),
          },
  };
}

/** Escapa los comodines de LIKE para buscar el texto literal. */
function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&');
}

/** P4: lista paginada con búsqueda y filtros. */
export async function listarEstudiantes(filtros: FiltrosConsulta): Promise<PaginaEstudiantes> {
  const condiciones: string[] = [];
  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => `$${parametros.push(valor)}`;

  if (filtros.q) {
    // Sin distinguir mayúsculas (ILIKE) ni acentos (unaccent), en "nombre apellidos",
    // en "apellidos nombre" y en la matrícula.
    const patron = parametro(`%${escaparLike(filtros.q)}%`);
    condiciones.push(`(
      unaccent(e.nombre || ' ' || e.apellidos) ILIKE unaccent(${patron})
      OR unaccent(e.apellidos || ' ' || e.nombre) ILIKE unaccent(${patron})
      OR e.matricula ILIKE ${patron})`);
  }
  if (filtros.id_grupo) condiciones.push(`e.id_grupo = ${parametro(filtros.id_grupo)}`);
  if (filtros.con_credencial !== undefined) {
    condiciones.push(filtros.con_credencial ? 'c.id_credencial IS NOT NULL' : 'c.id_credencial IS NULL');
  }
  if (filtros.estado !== 'todos') condiciones.push(filtros.estado === 'activos' ? 'e.activo' : 'NOT e.activo');

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const desde = `
    FROM estudiante e
    LEFT JOIN credencial_nfc c ON c.id_estudiante = e.id_estudiante AND c.activa
    ${where}`;

  const { rows: conteo } = await pool.query<{ total: string }>(`SELECT count(*) AS total ${desde}`, parametros);
  const total = Number(conteo[0]?.total ?? 0);

  const limite = parametro(filtros.por_pagina);
  const salto = parametro((filtros.pagina - 1) * filtros.por_pagina);
  const { rows } = await pool.query<FilaEstudiante>(
    `${SELECT_ESTUDIANTE}
     ${where}
     ORDER BY e.apellidos, e.nombre, e.id_estudiante
     LIMIT ${limite} OFFSET ${salto}`,
    parametros,
  );

  return {
    datos: rows.map(aEstudiantePublico),
    pagina: filtros.pagina,
    por_pagina: filtros.por_pagina,
    total,
    total_paginas: Math.ceil(total / filtros.por_pagina),
  };
}

/** Un estudiante con su credencial activa, o null si no existe. */
export async function obtenerEstudiante(
  idEstudiante: number,
  cliente: Pick<PoolClient, 'query'> = pool,
): Promise<EstudiantePublico | null> {
  const { rows } = await cliente.query<FilaEstudiante>(`${SELECT_ESTUDIANTE} WHERE e.id_estudiante = $1`, [
    idEstudiante,
  ]);
  return rows[0] ? aEstudiantePublico(rows[0]) : null;
}

/** Todas las credenciales que ha tenido el estudiante, de la más reciente a la más antigua. */
export async function historialCredenciales(idEstudiante: number): Promise<CredencialPublica[]> {
  const { rows } = await pool.query<{
    id_credencial: number;
    uid_enmascarado: string;
    activa: boolean;
    fecha_asignacion: Date;
  }>(
    `SELECT c.id_credencial, ${UID_ENMASCARADO_SQL} AS uid_enmascarado, c.activa, c.fecha_asignacion
       FROM credencial_nfc c
      WHERE c.id_estudiante = $1
      ORDER BY c.fecha_asignacion DESC, c.id_credencial DESC`,
    [idEstudiante],
  );
  return rows.map((f) => ({
    id: f.id_credencial,
    uid_enmascarado: f.uid_enmascarado,
    activa: f.activa,
    fecha_asignacion: f.fecha_asignacion.toISOString(),
  }));
}
