import { describe, expect, it } from 'vitest';
import {
  aMomentoLocal,
  calcularEstado,
  type ClaseHorario,
  elegirClaseEnCurso,
  esZonaHorariaValida,
  horaAMinutos,
  type MomentoLocal,
  sumarDias,
} from '../src/modules/lecturas/tiempo.js';

const ZONA = 'America/Mexico_City'; // UTC−6 todo el año (sin horario de verano desde 2022)
const VENTANA = { minutosAntes: 15, minutosMaxRegistro: 60 };

/** Momento local de prueba a partir de 'YYYY-MM-DDTHH:MM:SS' en la hora de la escuela. */
const local = (fechaHora: string): MomentoLocal => aMomentoLocal(new Date(`${fechaHora}-06:00`), ZONA);

const clase = (idClase: number, diaSemana: number, horaInicio: string, toleranciaMin = 10): ClaseHorario => ({
  idClase,
  diaSemana,
  horaInicio,
  toleranciaMin,
});

describe('aMomentoLocal', () => {
  it('convierte un instante UTC a fecha, día y hora de la escuela', () => {
    expect(aMomentoLocal(new Date('2026-11-09T14:05:12Z'), ZONA)).toEqual({
      fecha: '2026-11-09',
      diaSemana: 1, // lunes
      hora: '08:05:12',
      minutos: 8 * 60 + 5,
    });
  });

  it('cambia de día a medianoche según la zona de la escuela, no según UTC', () => {
    // 05:30 UTC del lunes todavía es domingo 23:30 en Guadalajara.
    expect(aMomentoLocal(new Date('2026-11-09T05:30:00Z'), ZONA)).toMatchObject({
      fecha: '2026-11-08',
      diaSemana: 7,
      hora: '23:30:00',
    });
    // 06:00 UTC ya es lunes 00:00.
    expect(aMomentoLocal(new Date('2026-11-09T06:00:00Z'), ZONA)).toMatchObject({
      fecha: '2026-11-09',
      diaSemana: 1,
      hora: '00:00:00',
      minutos: 0,
    });
  });

  it('reconoce el domingo como día 7', () => {
    expect(local('2026-11-08T10:00:00').diaSemana).toBe(7);
  });

  it('el mismo instante da otra fecha en otra zona', () => {
    expect(aMomentoLocal(new Date('2026-11-09T05:30:00Z'), 'Asia/Tokyo').fecha).toBe('2026-11-09');
  });

  it('trunca los segundos en los minutos', () => {
    expect(local('2026-11-09T07:10:59').minutos).toBe(7 * 60 + 10);
  });
});

describe('utilidades', () => {
  it('horaAMinutos acepta HH:MM y HH:MM:SS', () => {
    expect(horaAMinutos('07:00')).toBe(420);
    expect(horaAMinutos('23:59:59')).toBe(1439);
  });

  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(sumarDias('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('esZonaHorariaValida', () => {
    expect(esZonaHorariaValida('America/Mexico_City')).toBe(true);
    expect(esZonaHorariaValida('Marte/Olympus_Mons')).toBe(false);
  });
});

describe('elegirClaseEnCurso', () => {
  const lunes7 = clase(1, 1, '07:00:00');

  it('encuentra la clase dentro de la ventana', () => {
    expect(elegirClaseEnCurso([lunes7], local('2026-11-09T07:05:00'), VENTANA)).toEqual({
      clase: lunes7,
      fecha: '2026-11-09',
      minutosDesdeInicio: 5,
    });
  });

  it('incluye ambos límites de la ventana: −15 y +60 minutos', () => {
    expect(elegirClaseEnCurso([lunes7], local('2026-11-09T06:45:00'), VENTANA)?.minutosDesdeInicio).toBe(-15);
    expect(elegirClaseEnCurso([lunes7], local('2026-11-09T08:00:59'), VENTANA)?.minutosDesdeInicio).toBe(60);
  });

  it('fuera de la ventana no hay clase', () => {
    expect(elegirClaseEnCurso([lunes7], local('2026-11-09T06:44:59'), VENTANA)).toBeNull();
    expect(elegirClaseEnCurso([lunes7], local('2026-11-09T08:01:00'), VENTANA)).toBeNull();
  });

  it('otro día de la semana no cuenta', () => {
    expect(elegirClaseEnCurso([lunes7], local('2026-11-10T07:05:00'), VENTANA)).toBeNull();
  });

  it('si la tolerancia supera la ventana, la ventana se extiende hasta la tolerancia', () => {
    const tolerante = clase(2, 1, '07:00', 90);
    expect(elegirClaseEnCurso([tolerante], local('2026-11-09T08:30:00'), VENTANA)?.minutosDesdeInicio).toBe(90);
    expect(elegirClaseEnCurso([tolerante], local('2026-11-09T08:31:00'), VENTANA)).toBeNull();
  });

  it('con dos clases en la ventana elige la de hora_inicio más cercana', () => {
    const lunes8 = clase(2, 1, '08:00');
    // 07:50 está a 50 min de la de 7:00 y a 10 min de la de 8:00.
    expect(elegirClaseEnCurso([lunes7, lunes8], local('2026-11-09T07:50:00'), VENTANA)?.clase.idClase).toBe(2);
    // 07:20 está a 20 min de la de 7:00; la de 8:00 aún no abre su ventana.
    expect(elegirClaseEnCurso([lunes7, lunes8], local('2026-11-09T07:20:00'), VENTANA)?.clase.idClase).toBe(1);
  });

  it('en empate elige la que empieza antes y luego la de menor id', () => {
    const lunes730 = clase(5, 1, '07:30');
    expect(elegirClaseEnCurso([lunes730, lunes7], local('2026-11-09T07:15:00'), VENTANA)?.clase.idClase).toBe(1);
    const otraLunes7 = clase(3, 1, '07:00');
    expect(elegirClaseEnCurso([otraLunes7, lunes7], local('2026-11-09T07:05:00'), VENTANA)?.clase.idClase).toBe(1);
  });

  it('una clase del lunes a las 00:10 acepta lecturas del domingo a las 23:55 y se fecha el lunes', () => {
    const lunesMadrugada = clase(7, 1, '00:10');
    expect(elegirClaseEnCurso([lunesMadrugada], local('2026-11-08T23:55:00'), VENTANA)).toEqual({
      clase: lunesMadrugada,
      fecha: '2026-11-09',
      minutosDesdeInicio: -15,
    });
  });

  it('una clase del domingo a las 23:30 acepta lecturas del lunes a las 00:20 y se fecha el domingo', () => {
    const domingoNoche = clase(8, 7, '23:30');
    expect(elegirClaseEnCurso([domingoNoche], local('2026-11-09T00:20:00'), VENTANA)).toEqual({
      clase: domingoNoche,
      fecha: '2026-11-08',
      minutosDesdeInicio: 50,
    });
  });

  it('sin clases devuelve null', () => {
    expect(elegirClaseEnCurso([], local('2026-11-09T07:05:00'), VENTANA)).toBeNull();
  });
});

describe('calcularEstado', () => {
  it('antes de empezar o dentro de la tolerancia es Asistencia', () => {
    expect(calcularEstado(-10, 10)).toBe('Asistencia');
    expect(calcularEstado(0, 10)).toBe('Asistencia');
  });

  it('justo en el minuto límite (hora_inicio + tolerancia) es Asistencia', () => {
    expect(calcularEstado(10, 10)).toBe('Asistencia');
  });

  it('un minuto después de la tolerancia es Retardo', () => {
    expect(calcularEstado(11, 10)).toBe('Retardo');
  });

  it('07:10:59 en una clase de 07:00 con 10 min de tolerancia es Asistencia (segundos truncados)', () => {
    const enCurso = elegirClaseEnCurso([clase(1, 1, '07:00')], local('2026-11-09T07:10:59'), VENTANA)!;
    expect(calcularEstado(enCurso.minutosDesdeInicio, 10)).toBe('Asistencia');
  });
});
