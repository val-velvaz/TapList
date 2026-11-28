/*
 * Fechas de la web. La API trabaja con fechas 'YYYY-MM-DD' del día de la
 * clase, ya calculadas en la zona de la escuela; aquí solo se muestran o se
 * usan para los filtros, con la fecha local del navegador.
 */

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/** La fecha local del navegador, 'YYYY-MM-DD'. */
export function fechaLocal(fecha: Date = new Date()): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** Suma días a una fecha 'YYYY-MM-DD' sin pasar por ninguna zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

/** '2026-10-17' → '17/10/2026', como en los bocetos. */
export function fechaCorta(fecha: string): string {
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a}`;
}

/** '08:02:41' → '08:02'. */
export const horaCorta = (hora: string) => hora.slice(0, 5);

/** «hace 3 s», «hace 5 min», «hace 2 h». */
export function haceCuanto(desde: number, ahora: number = Date.now()): string {
  const segundos = Math.max(0, Math.floor((ahora - desde) / 1000));
  if (segundos < 60) return `hace ${segundos} s`;
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  return `hace ${Math.floor(minutos / 60)} h`;
}

/** Día de la semana ISO de una fecha 'YYYY-MM-DD': 1 = lunes … 7 = domingo. */
export function diaSemana(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay() || 7;
}

/** El lunes de la semana de una fecha 'YYYY-MM-DD'. */
export const lunesDe = (fecha: string): string => sumarDias(fecha, 1 - diaSemana(fecha));

/** Días entre dos fechas 'YYYY-MM-DD' (hasta − desde). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** 91.4 → '91.4 %', 72 → '72 %', null → '—'. */
export function porcentaje(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return `${valor.toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`;
}
