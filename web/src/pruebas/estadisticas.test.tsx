import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Conteo, Estadisticas } from '../api/estadisticas';
import { ALTO_100, describirSemana, semanasDelPeriodo } from '../paginas/estadisticas/GraficaSemanal';
import { periodoPorDefecto } from '../paginas/estadisticas/Estadisticas';
import { DOCENTE, llamadas, montar, simularApi } from './ayudas';

// Reloj fijo: miércoles 18 de noviembre de 2026. Las últimas 6 semanas van del lunes 12 de octubre a hoy.
const HOY = '2026-11-18';
const SEIS_SEMANAS = { desde: '2026-10-12', hasta: HOY };

const conteo = (c: Partial<Conteo>): Conteo => ({
  sesiones: 2,
  esperados: 6,
  asistencias: 5,
  retardos: 0,
  faltas: 1,
  pendientes: 0,
  porcentaje_asistencia: 83.3,
  ...c,
});

/** Cinco semanas con clases y la del 2 de noviembre sin ninguna sesión (no viene de la API). */
const DATOS: Estadisticas = {
  periodo: SEIS_SEMANAS,
  estudiantes_en_grupo: 32,
  filtros: { grupo: null, clase: null },
  resumen: conteo({ sesiones: 10, esperados: 35, asistencias: 9, retardos: 23, faltas: 3, pendientes: 2, porcentaje_asistencia: 91.4 }),
  por_semana: [
    { semana: '2026-10-12', ...conteo({ porcentaje_asistencia: 100, faltas: 0 }) },
    { semana: '2026-10-19', ...conteo({ porcentaje_asistencia: 50, faltas: 3 }) },
    { semana: '2026-10-26', ...conteo({ porcentaje_asistencia: 0, asistencias: 0, faltas: 6, sesiones: 1 }) },
    { semana: '2026-11-09', ...conteo({}) },
    { semana: '2026-11-16', ...conteo({ pendientes: 2 }) },
  ],
  por_clase: [],
  estudiantes_con_mas_faltas: [
    {
      estudiante: { id: 4, matricula: '221410004', nombre: 'Carlos E.', apellidos: 'Delgado', activo: true },
      esperados: 18,
      asistencias: 13,
      retardos: 0,
      faltas: 5,
      pendientes: 0,
      porcentaje_asistencia: 72,
    },
    {
      estudiante: { id: 7, matricula: '221410007', nombre: 'Valentina', apellidos: 'Cruz H.', activo: true },
      esperados: 17,
      asistencias: 12,
      retardos: 1,
      faltas: 4,
      pendientes: 0,
      porcentaje_asistencia: 76.5,
    },
  ],
};

const OPCIONES = {
  grupos: [
    { id: 1, nombre: 'D01', ciclo_escolar: '2026-B' },
    { id: 2, nombre: 'D02', ciclo_escolar: '2026-B' },
  ],
  clases: [
    { id: 10, materia: 'Bases de Datos', dia_semana: 3, hora_inicio: '09:00', tolerancia_min: 10, grupo: { id: 1, nombre: 'D01' } },
    { id: 20, materia: 'Estructuras de Datos', dia_semana: 4, hora_inicio: '10:00', tolerancia_min: 10, grupo: { id: 2, nombre: 'D02' } },
  ],
};

type Rutas = Parameters<typeof simularApi>[0];

function prepararApi(respuesta: Rutas[string] = { status: 200, cuerpo: DATOS }, extra: Rutas = {}) {
  return simularApi({
    'GET /api/auth/me': { status: 200, cuerpo: { usuario: DOCENTE } },
    'GET /api/asistencias/filtros': { status: 200, cuerpo: OPCIONES },
    'GET /api/estadisticas': respuesta,
    ...extra,
  });
}

const consultas = (api: ReturnType<typeof simularApi>) =>
  llamadas(api, 'GET /api/estadisticas').map(({ url }) => Object.fromEntries(url.searchParams));

async function abrirP3(ruta = '/estadisticas') {
  montar(ruta);
  await screen.findByRole('heading', { name: 'Asistencia por semana (%)' });
}

const usuario = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
const tarjeta = (titulo: string) => screen.getByText(titulo, { selector: '.tarjeta__titulo' }).closest('.tarjeta') as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${HOY}T12:00:00`));
});

afterEach(() => vi.useRealTimers());

describe('P3 · Estadísticas', () => {
  it('muestra los elementos del boceto: filtros, exportar y las cuatro tarjetas', async () => {
    prepararApi();
    await abrirP3();

    expect(screen.getByRole('heading', { name: 'Estadísticas de asistencia' })).toBeInTheDocument();
    expect(screen.getByText('Indicadores por grupo y periodo')).toBeInTheDocument();
    for (const etiqueta of ['Grupo', 'Clase', 'Inicio del periodo', 'Fin del periodo']) expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Periodo' })).toBeInTheDocument();
    for (const boton of ['Actualizar', '⬇ Exportar PDF', '⬇ Exportar XLSX']) expect(screen.getByRole('button', { name: boton })).toBeInTheDocument();

    expect(within(tarjeta('% de asistencia')).getByText('91.4 %')).toBeInTheDocument();
    expect(within(tarjeta('Retardos')).getByText('23')).toHaveClass('tarjeta__valor--retardo');
    expect(within(tarjeta('Faltas')).getByText('3')).toHaveClass('tarjeta__valor--falta');
    expect(within(tarjeta('Estudiantes en el grupo')).getByText('32')).toBeInTheDocument();
    // Fecha a la que se cuentan los estudiantes: el fin del periodo.
    expect(within(tarjeta('Estudiantes en el grupo')).getByText('al 18/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Del 12/10/2026 al 18/11/2026 · 10 sesiones')).toBeInTheDocument();
  });

  it('con un periodo que terminó antes de hoy, los estudiantes se cuentan a esa fecha, no a hoy', async () => {
    const periodo = { desde: '2026-09-01', hasta: '2026-10-17' };
    prepararApi({ status: 200, cuerpo: { ...DATOS, periodo, estudiantes_en_grupo: 30, por_semana: [] } });
    await abrirP3('/estadisticas?desde=2026-09-01&hasta=2026-10-17');
    expect(within(tarjeta('Estudiantes en el grupo')).getByText('30')).toBeInTheDocument();
    expect(within(tarjeta('Estudiantes en el grupo')).getByText('al 17/10/2026')).toBeInTheDocument();
  });

  it('los pendientes se ven debajo de las faltas, sin sumarse a ellas', async () => {
    prepararApi();
    await abrirP3();
    expect(within(tarjeta('Faltas')).getByText('+2 pendientes')).toBeInTheDocument();
  });

  it('sin pendientes, la tarjeta de faltas no muestra la nota; sin esperados, el porcentaje es «—»', async () => {
    prepararApi({ status: 200, cuerpo: { ...DATOS, resumen: conteo({ pendientes: 0, porcentaje_asistencia: null }) } });
    await abrirP3();
    expect(within(tarjeta('Faltas')).queryByText(/pendiente/)).not.toBeInTheDocument();
    expect(within(tarjeta('% de asistencia')).getByText('—')).toBeInTheDocument();
  });

  it('el periodo inicial son las últimas 6 semanas', async () => {
    const api = prepararApi();
    await abrirP3();
    expect(consultas(api)).toEqual([SEIS_SEMANAS]);
    expect(screen.getByLabelText('Inicio del periodo')).toHaveValue('2026-10-12');
    expect(screen.getByLabelText('Fin del periodo')).toHaveValue(HOY);
    // Un domingo: del lunes de hace 5 semanas, también 6 semanas.
    expect(periodoPorDefecto('2026-11-22')).toEqual({ desde: '2026-10-12', hasta: '2026-11-22' });
  });

  it('los filtros de la dirección se aplican al abrir y llenan el formulario', async () => {
    const api = prepararApi();
    await abrirP3('/estadisticas?id_grupo=1&id_clase=10&desde=2026-09-01&hasta=2026-10-17');
    expect(consultas(api)).toEqual([{ id_grupo: '1', id_clase: '10', desde: '2026-09-01', hasta: '2026-10-17' }]);
    await waitFor(() => expect(screen.getByLabelText('Clase')).toHaveValue('10'));
    expect(screen.getByLabelText('Grupo')).toHaveValue('1');
  });

  it('«Actualizar» aplica grupo, clase (según el grupo) y periodo', async () => {
    const api = prepararApi();
    await abrirP3();
    const u = usuario();
    await u.selectOptions(screen.getByLabelText('Grupo'), '2');
    expect(within(screen.getByLabelText('Clase')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Estructuras de Datos']);
    await u.selectOptions(screen.getByLabelText('Clase'), '20');
    await u.clear(screen.getByLabelText('Inicio del periodo'));
    await u.type(screen.getByLabelText('Inicio del periodo'), '2026-09-01');
    await u.click(screen.getByRole('button', { name: 'Actualizar' }));

    await waitFor(() => expect(consultas(api)).toHaveLength(2));
    expect(consultas(api)[1]).toEqual({ id_grupo: '2', id_clase: '20', desde: '2026-09-01', hasta: HOY });
  });

  it.each([
    ['el fin antes que el inicio', '2026-11-01', '2026-10-01', 'El fin del periodo no puede ser anterior al inicio.'],
    ['más de 366 días', '2025-11-01', '2026-11-18', 'El periodo no puede ser mayor que 366 días.'],
  ])('periodo inválido (%s): avisa y no consulta', async (_caso, desde, hasta, mensaje) => {
    const api = prepararApi();
    await abrirP3();
    const u = usuario();
    await u.clear(screen.getByLabelText('Inicio del periodo'));
    await u.type(screen.getByLabelText('Inicio del periodo'), desde);
    await u.clear(screen.getByLabelText('Fin del periodo'));
    await u.type(screen.getByLabelText('Fin del periodo'), hasta);
    await u.click(screen.getByRole('button', { name: 'Actualizar' }));

    expect(screen.getByText(mensaje)).toBeInTheDocument();
    expect(screen.getByLabelText('Fin del periodo')).toBeInvalid();
    expect(consultas(api)).toHaveLength(1);
  });

  it('«Estudiantes con más faltas» como en el boceto', async () => {
    prepararApi();
    await abrirP3();
    const tabla = within(screen.getByRole('region', { name: 'Estudiantes con más faltas' })).getByRole('table');
    expect(within(tabla).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Estudiante', 'Faltas', '% Asist.']);
    expect(
      within(tabla)
        .getAllByRole('row')
        .slice(1)
        .map((f) => within(f).getAllByRole('cell').map((c) => c.textContent)),
    ).toEqual([
      ['Carlos E. Delgado', '5', '72 %'],
      ['Valentina Cruz H.', '4', '76.5 %'],
    ]);
  });

  it('sin faltas en el periodo, lo dice', async () => {
    prepararApi({ status: 200, cuerpo: { ...DATOS, estudiantes_con_mas_faltas: [] } });
    await abrirP3();
    expect(screen.getByText('Nadie tiene faltas en este periodo.')).toBeInTheDocument();
  });
});

describe('P3 · Gráfica por semana', () => {
  const columnas = () => within(screen.getByRole('list', { name: 'Asistencia por semana' })).getAllByRole('listitem');

  it('una columna por cada semana del periodo, aunque la API no traiga las semanas sin clases', async () => {
    prepararApi();
    await abrirP3();
    expect(columnas().map((c) => c.textContent)).toEqual([
      '100 %Sem 112/10',
      '50 %Sem 219/10',
      '0 %Sem 326/10',
      'sin clasesSem 402/11',
      '83.3 %Sem 509/11',
      '83.3 %Sem 616/11',
    ].map((t) => expect.stringContaining(t)));
  });

  it('una semana sin sesiones dice «sin clases», sin barra y nunca como 0 %', async () => {
    prepararApi();
    await abrirP3();
    const sinClases = screen.getByTestId('semana-2026-11-02');
    expect(within(sinClases).getByText('sin clases')).toBeInTheDocument();
    expect(within(sinClases).queryByTestId('barra')).not.toBeInTheDocument();
    expect(sinClases).not.toHaveTextContent('0 %');
    expect(sinClases).toHaveAccessibleName('Semana del 02/11/2026 al 08/11/2026: sin clases');

    // Una semana con clases y 0 % sí es 0 % (con su barra mínima), distinta de «sin clases».
    const cero = screen.getByTestId('semana-2026-10-26');
    expect(within(cero).getByText('0 %')).toBeInTheDocument();
    expect(within(cero).getByTestId('barra')).toBeInTheDocument();
    expect(within(cero).queryByText('sin clases')).not.toBeInTheDocument();
  });

  it('cada porcentaje se lee sin el mouse: escrito sobre la barra y en la descripción accesible', async () => {
    prepararApi();
    await abrirP3();
    const semana = screen.getByTestId('semana-2026-10-19');
    expect(within(semana).getByText('50 %')).toBeVisible();
    expect(semana).toHaveAccessibleName('Semana del 19/10/2026 al 25/10/2026: 50 % de asistencia, 2 sesiones, 3 faltas');
    expect(screen.getByTestId('semana-2026-11-16')).toHaveAccessibleName(
      'Semana del 16/11/2026 al 22/11/2026: 83.3 % de asistencia, 2 sesiones, 1 falta, 2 pendientes',
    );
    // Se puede recorrer con el teclado: cada columna recibe el foco y muestra la nota.
    expect(semana).toHaveAttribute('tabindex', '0');
  });

  it('la altura de cada barra es proporcional a su porcentaje', async () => {
    prepararApi();
    await abrirP3();
    const alto = (lunes: string) => (within(screen.getByTestId(`semana-${lunes}`)).getByTestId('barra') as HTMLElement).style.height;
    expect(alto('2026-10-12')).toBe(`${ALTO_100}px`);
    expect(alto('2026-10-19')).toBe(`${ALTO_100 / 2}px`);
    expect(alto('2026-10-26')).toBe('2px'); // 0 %: solo una línea en la base
  });

  it('semanasDelPeriodo cubre del lunes del inicio al lunes del fin', () => {
    const semanas = semanasDelPeriodo('2026-10-14', '2026-10-27', [{ semana: '2026-10-19', ...conteo({}) }]);
    expect(semanas.map((s) => [s.lunes, s.numero, s.conClases])).toEqual([
      ['2026-10-12', 1, false],
      ['2026-10-19', 2, true],
      ['2026-10-26', 3, false],
    ]);
    expect(describirSemana(semanas[1]!)).toBe('Semana del 19/10/2026 al 25/10/2026: 83.3 % de asistencia, 2 sesiones, 1 falta');
  });
});

describe('P3 · Exportar y errores', () => {
  let clics: string[];
  beforeEach(() => {
    clics = [];
    URL.createObjectURL = vi.fn(() => 'blob:taplist');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clics.push(this.download);
    });
  });

  it.each(['pdf', 'xlsx'] as const)('%s: descarga con los filtros aplicados', async (formato) => {
    const api = prepararApi(undefined, {
      'GET /api/estadisticas/exportar': {
        status: 200,
        binario: 'contenido',
        encabezados: { 'Content-Disposition': `attachment; filename=estadisticas_D01_2026-10-12_a_2026-11-18.${formato}` },
      },
    });
    await abrirP3('/estadisticas?id_grupo=1');
    await usuario().click(screen.getByRole('button', { name: `⬇ Exportar ${formato.toUpperCase()}` }));

    await waitFor(() => expect(clics).toEqual([`estadisticas_D01_2026-10-12_a_2026-11-18.${formato}`]));
    const [llamada] = llamadas(api, 'GET /api/estadisticas/exportar');
    expect(Object.fromEntries(llamada!.url.searchParams)).toEqual({ id_grupo: '1', ...SEIS_SEMANAS, formato });
  });

  it('si la exportación falla, lo dice y el botón vuelve a quedar disponible', async () => {
    prepararApi(undefined, { 'GET /api/estadisticas/exportar': { status: 500, cuerpo: { error: 'Error interno del servidor' } } });
    await abrirP3();
    await usuario().click(screen.getByRole('button', { name: '⬇ Exportar PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo exportar. Error interno del servidor');
    expect(screen.getByRole('button', { name: '⬇ Exportar PDF' })).toBeEnabled();
  });

  it('un grupo o clase ajenos (404): mensaje claro', async () => {
    prepararApi({ status: 404, cuerpo: { error: 'El grupo no existe' } });
    montar('/estadisticas?id_grupo=99');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el grupo o la clase del filtro.');
  });

  it('un periodo que la API rechaza (400): muestra su mensaje', async () => {
    prepararApi({ status: 400, cuerpo: { error: 'Parámetros inválidos', detalles: { hasta: 'El periodo no puede ser mayor que 366 días' } } });
    montar('/estadisticas?desde=2020-01-01&hasta=2026-11-18');
    expect(await screen.findByRole('alert')).toHaveTextContent('Parámetros inválidos: El periodo no puede ser mayor que 366 días');
  });

  it('un 401 lleva al login', async () => {
    prepararApi({ status: 401, cuerpo: { error: 'No autenticado' } });
    montar('/estadisticas');
    expect(await screen.findByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeInTheDocument();
  });
});
