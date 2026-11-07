import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { emitirSeguro } from '../../eventos/eventos.js';
import { HttpError } from '../../utils/HttpError.js';
import { enmascararUid } from '../../utils/uid.js';
import {
  aMomentoLocal,
  calcularEstado,
  type ClaseHorario,
  elegirClaseEnCurso,
  type EstadoAsistencia,
  type ParametrosVentana,
} from './tiempo.js';

export type ResultadoLectura =
  | { resultado: 'ASISTENCIA' | 'RETARDO'; duplicado: boolean }
  | { resultado: 'RECHAZADA'; motivo: 'CREDENCIAL_NO_VALIDA' | 'SIN_CLASE' };

export interface EntradaLectura {
  /** UID ya normalizado (hexadecimal en mayúsculas). */
  uid: string;
  idDispositivo: number;
  /** Hora del servidor al recibir la lectura. */
  ahora: Date;
  /** Hora en que el dispositivo leyó la credencial, si la guardó sin conexión. */
  leidoEn?: Date;
}

export interface ConfiguracionLecturas {
  zonaHoraria: string;
  ventana: ParametrosVentana;
  horasMaxLecturaOffline: number;
}

/** Tolerancia por desfase entre el reloj del dispositivo y el del servidor. */
const MINUTOS_DESFASE_RELOJ = 2;

const ESTADO_A_RESULTADO: Record<EstadoAsistencia, 'ASISTENCIA' | 'RETARDO'> = {
  Asistencia: 'ASISTENCIA',
  Retardo: 'RETARDO',
};

export function configuracionDesdeEntorno(): ConfiguracionLecturas {
  return {
    zonaHoraria: env.ZONA_HORARIA_ESCUELA,
    ventana: { minutosAntes: env.MINUTOS_ANTES_CLASE, minutosMaxRegistro: env.MINUTOS_MAX_REGISTRO },
    horasMaxLecturaOffline: env.HORAS_MAX_LECTURA_OFFLINE,
  };
}

/**
 * Procesa una lectura NFC (AD-03, pasos 4 a 12). No depende de Express:
 * recibe los datos ya validados y devuelve el resultado para el dispositivo.
 * Lanza HttpError(400) si leido_en está fuera de rango; cualquier otro error
 * lo convierte el controlador en «No se pudo guardar».
 */
export async function procesarLectura(
  entrada: EntradaLectura,
  config: ConfiguracionLecturas = configuracionDesdeEntorno(),
): Promise<ResultadoLectura> {
  const instante = entrada.leidoEn ?? entrada.ahora;
  if (entrada.leidoEn) validarLecturaOffline(entrada.leidoEn, entrada.ahora, config.horasMaxLecturaOffline);

  const contexto = `uid=${enmascararUid(entrada.uid)} dispositivo=${entrada.idDispositivo}`;

  // Pasos 4 y 5 (RF-04): credencial activa de un estudiante activo.
  const { rows: credenciales } = await pool.query<{ id_estudiante: number; id_grupo: number; activa: boolean; activo: boolean }>(
    `SELECT e.id_estudiante, e.id_grupo, c.activa, e.activo
       FROM credencial_nfc c
       JOIN estudiante e ON e.id_estudiante = c.id_estudiante
      WHERE c.uid = $1`,
    [entrada.uid],
  );
  const credencial = credenciales[0];
  if (!credencial || !credencial.activa || !credencial.activo) {
    // El motivo exacto solo va al log; al dispositivo se le da uno genérico.
    const detalle = !credencial ? 'UID no registrado' : !credencial.activa ? 'credencial inactiva' : 'estudiante inactivo';
    console.info(`[lecturas] RECHAZADA (${detalle}) ${contexto}`);
    return { resultado: 'RECHAZADA', motivo: 'CREDENCIAL_NO_VALIDA' };
  }

  // Pasos 6 y 7: clase en curso del grupo, en la hora local de la escuela.
  const momento = aMomentoLocal(instante, config.zonaHoraria);
  const { rows: clases } = await pool.query<{ id_clase: number; dia_semana: number; hora_inicio: string; tolerancia_min: number }>(
    `SELECT id_clase, dia_semana, hora_inicio, tolerancia_min
       FROM clase
      WHERE id_grupo = $1`,
    [credencial.id_grupo],
  );
  const horarios: ClaseHorario[] = clases.map((c) => ({
    idClase: c.id_clase,
    diaSemana: c.dia_semana,
    horaInicio: c.hora_inicio,
    toleranciaMin: c.tolerancia_min,
  }));
  const enCurso = elegirClaseEnCurso(horarios, momento, config.ventana);
  if (!enCurso) {
    console.info(`[lecturas] RECHAZADA (sin clase en curso, ${momento.fecha} ${momento.hora}) ${contexto}`);
    return { resultado: 'RECHAZADA', motivo: 'SIN_CLASE' };
  }

  // Paso 8.
  const estado = calcularEstado(enCurso.minutosDesdeInicio, enCurso.clase.toleranciaMin);

  // Pasos 9 y 10. INSERT ... ON CONFLICT DO NOTHING es atómico: si dos lecturas
  // llegan a la vez, PostgreSQL espera a que la primera termine y la segunda no
  // inserta. Después se lee el registro que ganó en una sentencia aparte, que
  // ya ve la fila confirmada. Un SELECT previo seguido de INSERT tendría carrera.
  const insercion = await pool.query<{ id_asistencia: number }>(
    `INSERT INTO asistencia (id_estudiante, id_clase, id_dispositivo, fecha, hora, estado)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id_estudiante, id_clase, fecha) DO NOTHING
     RETURNING id_asistencia`,
    [credencial.id_estudiante, enCurso.clase.idClase, entrada.idDispositivo, enCurso.fecha, momento.hora, estado],
  );

  const registro = insercion.rows[0];
  if (registro) {
    console.info(`[lecturas] ${estado.toUpperCase()} clase=${enCurso.clase.idClase} fecha=${enCurso.fecha} ${contexto}`);
    // Paso 12: solo los registros nuevos generan evento; un duplicado no.
    emitirSeguro('asistencia:registrada', {
      idAsistencia: registro.id_asistencia,
      idEstudiante: credencial.id_estudiante,
      idClase: enCurso.clase.idClase,
      idDispositivo: entrada.idDispositivo,
      fecha: enCurso.fecha,
      hora: momento.hora,
      estado,
    });
    return { resultado: ESTADO_A_RESULTADO[estado], duplicado: false };
  }

  const { rows: existentes } = await pool.query<{ estado: EstadoAsistencia }>(
    `SELECT estado
       FROM asistencia
      WHERE id_estudiante = $1 AND id_clase = $2 AND fecha = $3`,
    [credencial.id_estudiante, enCurso.clase.idClase, enCurso.fecha],
  );
  const existente = existentes[0];
  if (!existente) throw new Error('Conflicto en asistencia sin registro existente');

  console.info(`[lecturas] DUPLICADA (${existente.estado}) clase=${enCurso.clase.idClase} fecha=${enCurso.fecha} ${contexto}`);
  return { resultado: ESTADO_A_RESULTADO[existente.estado], duplicado: true };
}

/** Una lectura sin conexión no puede venir del futuro ni ser demasiado vieja. */
function validarLecturaOffline(leidoEn: Date, ahora: Date, horasMax: number): void {
  const diferenciaMs = ahora.getTime() - leidoEn.getTime();
  if (diferenciaMs < -MINUTOS_DESFASE_RELOJ * 60_000) {
    throw new HttpError(400, 'leido_en no puede estar en el futuro');
  }
  if (diferenciaMs > horasMax * 3_600_000) {
    throw new HttpError(400, `leido_en tiene más de ${horasMax} horas de antigüedad`);
  }
}
