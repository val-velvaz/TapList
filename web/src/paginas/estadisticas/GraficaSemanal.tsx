import type { Conteo } from '../../api/estadisticas';
import { fechaCorta, lunesDe, porcentaje, sumarDias } from '../../utilidades/fechas';

/** Alto en píxeles de una barra de 100 %: la altura es proporcional al porcentaje. */
export const ALTO_100 = 160;

export type SemanaDeLaGrafica =
  | { lunes: string; numero: number; conClases: true; conteo: Conteo }
  | { lunes: string; numero: number; conClases: false };

/**
 * Todas las semanas del periodo, del lunes de `desde` al lunes de `hasta`. La
 * API solo devuelve las semanas con sesiones; las demás quedan «sin clases»
 * para que nunca se dibujen como 0 % de asistencia.
 */
export function semanasDelPeriodo(desde: string, hasta: string, porSemana: Array<Conteo & { semana: string }>): SemanaDeLaGrafica[] {
  const conDatos = new Map(porSemana.map((s) => [s.semana, s]));
  const semanas: SemanaDeLaGrafica[] = [];
  for (let lunes = lunesDe(desde), numero = 1; lunes <= hasta; lunes = sumarDias(lunes, 7), numero++) {
    const conteo = conDatos.get(lunes);
    semanas.push(conteo ? { lunes, numero, conClases: true, conteo } : { lunes, numero, conClases: false });
  }
  return semanas;
}

/** «Semana del 12/10/2026 al 18/10/2026: 91.4 % de asistencia, 2 sesiones, 3 faltas». */
export function describirSemana(s: SemanaDeLaGrafica): string {
  const rango = `Semana del ${fechaCorta(s.lunes)} al ${fechaCorta(sumarDias(s.lunes, 6))}`;
  if (!s.conClases) return `${rango}: sin clases`;
  const { porcentaje_asistencia: pct, sesiones, faltas, pendientes } = s.conteo;
  const partes = [
    `${porcentaje(pct)} de asistencia`,
    `${sesiones} ${sesiones === 1 ? 'sesión' : 'sesiones'}`,
    `${faltas} ${faltas === 1 ? 'falta' : 'faltas'}`,
  ];
  if (pendientes) partes.push(`${pendientes} ${pendientes === 1 ? 'pendiente' : 'pendientes'}`);
  return `${rango}: ${partes.join(', ')}`;
}

/**
 * «Asistencia por semana (%)» de P3: una columna por semana, de 0 a 100 %.
 * Cada columna lleva su porcentaje escrito, así que se lee sin el mouse; para
 * lectores de pantalla es una lista con la descripción completa de cada semana.
 * Al pasar el mouse o enfocar una columna, una nota da el detalle.
 */
export function GraficaSemanal({ semanas }: { semanas: SemanaDeLaGrafica[] }) {
  if (semanas.length === 0) return <p className="grafica__vacia">No hay semanas en este periodo.</p>;
  return (
    <ol className="grafica" aria-label="Asistencia por semana">
      {semanas.map((s) => {
        const descripcion = describirSemana(s);
        const pct = s.conClases ? s.conteo.porcentaje_asistencia : null;
        return (
          <li key={s.lunes} className="grafica__columna" tabIndex={0} aria-label={descripcion} data-testid={`semana-${s.lunes}`}>
            <div className="grafica__zona" aria-hidden="true">
              {s.conClases && pct !== null ? (
                <>
                  <span className="grafica__valor">{porcentaje(pct)}</span>
                  <span className="grafica__barra" style={{ height: `${Math.max((pct / 100) * ALTO_100, 2)}px` }} data-testid="barra" />
                </>
              ) : (
                <span className="grafica__sin-clases">{s.conClases ? 'sin datos' : 'sin clases'}</span>
              )}
            </div>
            <span className="grafica__etiqueta" aria-hidden="true">
              Sem {s.numero}
              <span className="grafica__fecha">{fechaCorta(s.lunes).slice(0, 5)}</span>
            </span>
            <span className="grafica__nota" role="tooltip" aria-hidden="true">
              {descripcion}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
