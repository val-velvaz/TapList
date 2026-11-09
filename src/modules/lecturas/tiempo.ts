/**
 * Lógica de tiempo del registro de asistencia (AD-03, pasos 6 a 8).
 * Funciones puras: no leen el entorno, la BD ni el reloj; todo llega por parámetro.
 *
 * Convenciones:
 *   - dia_semana: 1 = lunes … 7 = domingo (igual que la migración 001).
 *   - Las comparaciones se hacen al minuto: los segundos de la lectura se
 *     truncan, así que 07:10:59 cuenta como el minuto 07:10.
 */

export type EstadoAsistencia = 'Asistencia' | 'Retardo';

/** Un instante expresado en la hora local de la escuela. */
export interface MomentoLocal {
  /** Fecha local, 'YYYY-MM-DD'. */
  fecha: string;
  /** 1 = lunes … 7 = domingo. */
  diaSemana: number;
  /** Hora local con segundos, 'HH:MM:SS'. */
  hora: string;
  /** Minutos transcurridos desde la medianoche local (segundos truncados). */
  minutos: number;
}

export interface ClaseHorario {
  idClase: number;
  diaSemana: number;
  /** 'HH:MM' o 'HH:MM:SS', como lo devuelve PostgreSQL para TIME. */
  horaInicio: string;
  toleranciaMin: number;
}

export interface ParametrosVentana {
  /** Minutos antes de hora_inicio en que ya se aceptan lecturas. */
  minutosAntes: number;
  /** Minutos después de hora_inicio en que todavía se aceptan lecturas. */
  minutosMaxRegistro: number;
}

export interface ClaseEnCurso {
  clase: ClaseHorario;
  /** Fecha local del día de la clase (puede diferir de la de la lectura cerca de la medianoche). */
  fecha: string;
  /** Minutos entre hora_inicio y la lectura; negativo si se leyó antes de empezar. */
  minutosDesdeInicio: number;
}

const MINUTOS_POR_DIA = 24 * 60;
const DIAS_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formateadores.set(zona, f);
  }
  return f;
}

/** true si `zona` es un identificador IANA válido (p. ej. 'America/Mexico_City'). */
export function esZonaHorariaValida(zona: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** Convierte un instante a fecha, día de la semana y hora en la zona `zona`, sin usar la del servidor. */
export function aMomentoLocal(instante: Date, zona: string): MomentoLocal {
  const partes: Record<string, string> = {};
  for (const { type, value } of formateador(zona).formatToParts(instante)) partes[type] = value;

  const horas = Number(partes.hour);
  const minutos = Number(partes.minute);
  return {
    fecha: `${partes.year}-${partes.month}-${partes.day}`,
    diaSemana: DIAS_ISO[partes.weekday!]!,
    hora: `${partes.hour}:${partes.minute}:${partes.second}`,
    minutos: horas * 60 + minutos,
  };
}

/** 'HH:MM[:SS]' → minutos desde la medianoche (los segundos se ignoran). */
export function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':');
  return Number(h) * 60 + Number(m);
}

/** Suma `dias` a una fecha 'YYYY-MM-DD' sin pasar por ninguna zona horaria. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

/** Día de la semana ISO desplazado `dias` (con vuelta de domingo a lunes y viceversa). */
function desplazarDia(diaSemana: number, dias: number): number {
  return ((((diaSemana - 1 + dias) % 7) + 7) % 7) + 1;
}

/**
 * Elige la clase en curso para una lectura (AD-03, paso 6).
 *
 * Una clase está en curso si la lectura cae entre
 *   hora_inicio − minutosAntes   y   hora_inicio + max(minutosMaxRegistro, tolerancia_min),
 * ambos límites incluidos. Se revisan las clases del día anterior, del mismo
 * día y del siguiente, para que las ventanas que cruzan la medianoche funcionen.
 *
 * Si hay varias, gana la de hora_inicio más cercana a la lectura; en empate,
 * la que empieza antes y luego la de menor id_clase.
 */
export function elegirClaseEnCurso(
  clases: readonly ClaseHorario[],
  momento: MomentoLocal,
  ventana: ParametrosVentana,
): ClaseEnCurso | null {
  let mejor: (ClaseEnCurso & { inicio: number }) | null = null;

  for (const clase of clases) {
    for (const desfaseDias of [-1, 0, 1]) {
      if (clase.diaSemana !== desplazarDia(momento.diaSemana, desfaseDias)) continue;

      // Inicio de la clase en minutos relativos a la medianoche del día de la lectura.
      const inicio = desfaseDias * MINUTOS_POR_DIA + horaAMinutos(clase.horaInicio);
      const minutosDesdeInicio = momento.minutos - inicio;
      const limiteFinal = Math.max(ventana.minutosMaxRegistro, clase.toleranciaMin);
      if (minutosDesdeInicio < -ventana.minutosAntes || minutosDesdeInicio > limiteFinal) continue;

      const candidata = { clase, fecha: sumarDias(momento.fecha, desfaseDias), minutosDesdeInicio, inicio };
      if (!mejor || esMejor(candidata, mejor)) mejor = candidata;
    }
  }

  if (!mejor) return null;
  const { inicio: _inicio, ...resultado } = mejor;
  return resultado;
}

function esMejor(a: ClaseEnCurso & { inicio: number }, b: ClaseEnCurso & { inicio: number }): boolean {
  const distanciaA = Math.abs(a.minutosDesdeInicio);
  const distanciaB = Math.abs(b.minutosDesdeInicio);
  if (distanciaA !== distanciaB) return distanciaA < distanciaB;
  if (a.inicio !== b.inicio) return a.inicio < b.inicio;
  return a.clase.idClase < b.clase.idClase;
}

/**
 * AD-03, paso 8: hasta hora_inicio + tolerancia_min (incluido) es Asistencia;
 * después, Retardo. Llegar antes de que empiece la clase también es Asistencia.
 */
export function calcularEstado(minutosDesdeInicio: number, toleranciaMin: number): EstadoAsistencia {
  return minutosDesdeInicio <= toleranciaMin ? 'Asistencia' : 'Retardo';
}
