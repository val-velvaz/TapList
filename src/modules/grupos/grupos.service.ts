import { pool } from '../../db/pool.js';
import { ORDEN_ES } from '../../db/orden.js';

export interface GrupoPublico {
  id: number;
  nombre: string;
  nivel_grado: string;
  ciclo_escolar: string;
}

/** Todos los grupos, del ciclo más reciente al más antiguo. */
export async function listarGrupos(): Promise<GrupoPublico[]> {
  const { rows } = await pool.query<{ id_grupo: number; nombre: string; nivel_grado: string; ciclo_escolar: string }>(
    `SELECT id_grupo, nombre, nivel_grado, ciclo_escolar
       FROM grupo
      ORDER BY ciclo_escolar ${ORDEN_ES} DESC, nombre ${ORDEN_ES}, id_grupo`,
  );
  return rows.map((g) => ({ id: g.id_grupo, nombre: g.nombre, nivel_grado: g.nivel_grado, ciclo_escolar: g.ciclo_escolar }));
}
