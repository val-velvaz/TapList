import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registro } from '../api/asistencias';
import { DOCENTE, llamadas, montar, simularApi } from './ayudas';
import { EventSourceFalso } from './eventSourceFalso';

// Reloj fijo a mediodía: «hoy» es el 18 de noviembre y la semana por defecto, del 12 al 18.
const HOY = '2026-11-18';
const SEMANA = { desde: '2026-11-12', hasta: HOY };

const OPCIONES = {
  grupos: [
    { id: 1, nombre: 'D01', ciclo_escolar: '2026-B' },
    { id: 2, nombre: 'D02', ciclo_escolar: '2026-B' },
  ],
  clases: [
    { id: 10, materia: 'Bases de Datos', dia_semana: 3, hora_inicio: '09:00', tolerancia_min: 10, grupo: { id: 1, nombre: 'D01' } },
    { id: 11, materia: 'Ingeniería de Software', dia_semana: 1, hora_inicio: '07:00', tolerancia_min: 10, grupo: { id: 1, nombre: 'D01' } },
    { id: 20, materia: 'Estructuras de Datos', dia_semana: 4, hora_inicio: '10:00', tolerancia_min: 10, grupo: { id: 2, nombre: 'D02' } },
  ],
};

function registro(estado: Registro['estado'], nombre: string, apellidos: string, hora: string | null, id: number | null): Registro {
  const leida = estado === 'Asistencia' || estado === 'Retardo';
  return {
    id: leida ? id : null,
    fecha: HOY,
    hora: leida ? hora : null,
    estado,
    estudiante: { id: id ?? 0, matricula: `22000000${id}`, nombre, apellidos, activo: true },
    clase: { id: 10, materia: 'Bases de Datos', dia_semana: 3, hora_inicio: '09:00' },
    grupo: { id: 1, nombre: 'D01' },
    dispositivo: leida ? { id: 1, nombre_ubicacion: 'Aula 3' } : null,
  };
}

const CUATRO_ESTADOS: Registro[] = [
  registro('Retardo', 'Bruno', 'Martínez Cruz', '09:15:42', 2),
  registro('Asistencia', 'Andrea', 'López Torres', '09:04:10', 1),
  registro('Pendiente', 'Carla', 'Ramírez Ortega', null, 3),
  registro('Falta', 'Diego', 'Sánchez Vega', null, 4),
];

const pagina = (datos: Registro[], extra: Partial<{ pagina: number; total: number; total_paginas: number }> = {}) => ({
  status: 200,
  cuerpo: { datos, pagina: 1, por_pagina: 20, total: datos.length, total_paginas: datos.length ? 1 : 0, ...extra },
});

type Rutas = Parameters<typeof simularApi>[0];

function prepararApi(lista: Rutas[string] = pagina(CUATRO_ESTADOS), extra: Rutas = {}) {
  return simularApi({
    'GET /api/auth/me': { status: 200, cuerpo: { usuario: DOCENTE } },
    'GET /api/asistencias/filtros': { status: 200, cuerpo: OPCIONES },
    'GET /api/asistencias': lista,
    ...extra,
  });
}

/** Parámetros de cada consulta de la lista, en orden. */
const consultasLista = (api: ReturnType<typeof simularApi>) =>
  llamadas(api, 'GET /api/asistencias').map(({ url }) => Object.fromEntries(url.searchParams));

async function abrirP2(ruta = '/asistencias') {
  montar(ruta);
  await screen.findByText(/Mostrando \d+ de \d+ registros/);
}

const filasTabla = () =>
  within(screen.getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell').map((celda) => celda.textContent));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${HOY}T12:00:00`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('P2 · Consulta de asistencias', () => {
  it('muestra los elementos del boceto y una fila de cada estado', async () => {
    prepararApi();
    await abrirP2();

    expect(screen.getByRole('heading', { name: 'Consulta de asistencias' })).toBeInTheDocument();
    expect(screen.getByText('Registros de tus grupos · actualización automática')).toBeInTheDocument();
    for (const etiqueta of ['Grupo', 'Clase', 'Estudiante', 'Estado', 'Desde', 'Hasta']) {
      expect(screen.getByLabelText(etiqueta)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Estudiante')).toHaveAttribute('placeholder', 'Buscar por nombre…');
    for (const boton of ['Buscar', 'Limpiar', '⬇ Exportar PDF', '⬇ Exportar XLSX']) {
      expect(screen.getByRole('button', { name: boton })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Estudiante',
      'Grupo',
      'Clase',
      'Fecha',
      'Hora',
      'Estado',
      'Lector',
    ]);
    expect(screen.getByText('Mostrando 4 de 4 registros')).toBeInTheDocument();

    // Fecha como en el boceto; faltas y pendientes sin hora ni lector.
    expect(filasTabla()).toEqual([
      ['Bruno Martínez Cruz', 'D01', 'Bases de Datos', '18/11/2026', '09:15', 'Retardo', 'Aula 3'],
      ['Andrea López Torres', 'D01', 'Bases de Datos', '18/11/2026', '09:04', 'Asistencia', 'Aula 3'],
      ['Carla Ramírez Ortega', 'D01', 'Bases de Datos', '18/11/2026', '—', 'Pendiente', '—'],
      ['Diego Sánchez Vega', 'D01', 'Bases de Datos', '18/11/2026', '—', 'Falta', '—'],
    ]);
    const tabla = within(screen.getByRole('table'));
    expect(tabla.getByText('Asistencia')).toHaveClass('etiqueta--asistencia');
    expect(tabla.getByText('Retardo')).toHaveClass('etiqueta--retardo');
    expect(tabla.getByText('Pendiente')).toHaveClass('etiqueta--pendiente');
    expect(tabla.getByText('Falta')).toHaveClass('etiqueta--falta');
  });

  it('sin filtros en la dirección, consulta la última semana', async () => {
    const api = prepararApi();
    await abrirP2();
    expect(consultasLista(api)).toEqual([{ ...SEMANA, pagina: '1', por_pagina: '20' }]);
    expect(screen.getByLabelText('Desde')).toHaveValue(SEMANA.desde);
    expect(screen.getByLabelText('Hasta')).toHaveValue(SEMANA.hasta);
    expect(screen.getByLabelText('Grupo')).toHaveValue('');
    expect(screen.getByLabelText('Estado')).toHaveValue('');
  });

  it('los filtros de la dirección se aplican al abrir y llenan el formulario', async () => {
    const api = prepararApi();
    await abrirP2('/asistencias?id_grupo=1&id_clase=10&q=lopez&estado=Falta&desde=2026-10-10&hasta=2026-10-17&pagina=2');

    expect(consultasLista(api)).toEqual([
      { id_grupo: '1', id_clase: '10', q: 'lopez', estado: 'Falta', desde: '2026-10-10', hasta: '2026-10-17', pagina: '2', por_pagina: '20' },
    ]);
    await waitFor(() => expect(screen.getByLabelText('Clase')).toHaveValue('10'));
    expect(screen.getByLabelText('Grupo')).toHaveValue('1');
    expect(screen.getByLabelText('Estudiante')).toHaveValue('lopez');
    expect(screen.getByLabelText('Estado')).toHaveValue('Falta');
  });

  it('«Buscar» aplica los filtros: grupo, clase, estudiante (sin espacios de más), estado y fechas', async () => {
    const api = prepararApi();
    await abrirP2();
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    // Las clases dependen del grupo.
    await usuario.selectOptions(screen.getByLabelText('Grupo'), '2');
    expect(within(screen.getByLabelText('Clase')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas',
      'Estructuras de Datos',
    ]);
    await usuario.selectOptions(screen.getByLabelText('Grupo'), '1');
    await usuario.selectOptions(screen.getByLabelText('Clase'), '10');
    await usuario.type(screen.getByLabelText('Estudiante'), '  ramírez carla ');
    await usuario.selectOptions(screen.getByLabelText('Estado'), 'Pendiente');
    await usuario.clear(screen.getByLabelText('Desde'));
    await usuario.type(screen.getByLabelText('Desde'), '2026-11-01');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(consultasLista(api)).toHaveLength(2));
    expect(consultasLista(api)[1]).toEqual({
      id_grupo: '1',
      id_clase: '10',
      q: 'ramírez carla',
      estado: 'Pendiente',
      desde: '2026-11-01',
      hasta: HOY,
      pagina: '1',
      por_pagina: '20',
    });
  });

  it('al cambiar de grupo, una clase de otro grupo se quita del filtro', async () => {
    prepararApi();
    await abrirP2('/asistencias?id_clase=20');
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await waitFor(() => expect(screen.getByLabelText('Clase')).toHaveValue('20'));
    expect(within(screen.getByLabelText('Clase')).getByRole('option', { name: 'Estructuras de Datos · D02' })).toBeInTheDocument();

    await usuario.selectOptions(screen.getByLabelText('Grupo'), '1');
    expect(screen.getByLabelText('Clase')).toHaveValue('');
  });

  it('«Hasta» antes que «Desde»: avisa y no consulta', async () => {
    const api = prepararApi();
    await abrirP2();
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await usuario.clear(screen.getByLabelText('Hasta'));
    await usuario.type(screen.getByLabelText('Hasta'), '2026-11-01');
    await usuario.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(screen.getByText('«Hasta» no puede ser anterior a «Desde».')).toBeInTheDocument();
    expect(screen.getByLabelText('Hasta')).toBeInvalid();
    expect(consultasLista(api)).toHaveLength(1);
  });

  it('«Limpiar» vuelve a la última semana sin filtros', async () => {
    const api = prepararApi();
    await abrirP2('/asistencias?id_grupo=1&estado=Falta&q=lopez&desde=2026-10-01&hasta=2026-10-31');
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Limpiar' }));

    await waitFor(() => expect(consultasLista(api)).toHaveLength(2));
    expect(consultasLista(api)[1]).toEqual({ ...SEMANA, pagina: '1', por_pagina: '20' });
    expect(screen.getByLabelText('Estudiante')).toHaveValue('');
    expect(screen.getByLabelText('Estado')).toHaveValue('');
  });

  it('pagina como en el boceto: «Página 1 2 … 18 ›»', async () => {
    const api = prepararApi((url) =>
      pagina(CUATRO_ESTADOS, { pagina: Number(url.searchParams.get('pagina')), total: 360, total_paginas: 18 }),
    );
    await abrirP2();
    const paginacion = within(screen.getByRole('navigation', { name: 'Paginación' }));
    expect(paginacion.getAllByRole('button').map((b) => b.textContent)).toEqual(['1', '2', '18', '›']);
    expect(paginacion.getByText('…')).toBeInTheDocument();
    expect(paginacion.getByRole('button', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Mostrando 4 de 360 registros')).toBeInTheDocument();

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(paginacion.getByRole('button', { name: 'Página 2' }));
    await waitFor(() => expect(consultasLista(api).at(-1)?.pagina).toBe('2'));
    await waitFor(() =>
      expect(within(screen.getByRole('navigation', { name: 'Paginación' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
        '‹',
        '1',
        '2',
        '3',
        '18',
        '›',
      ]),
    );
  });

  it('sin resultados: lo dice en la tabla y no muestra paginación', async () => {
    prepararApi(pagina([]));
    await abrirP2();
    expect(screen.getByText('No hay registros con estos filtros.')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).not.toBeInTheDocument();
  });
});

describe('P2 · En vivo (SSE)', () => {
  it('se conecta a /api/asistencias/eventos y muestra «En vivo»', async () => {
    prepararApi();
    await abrirP2();
    expect(screen.getByTestId('en-vivo')).toHaveTextContent('Conectando…');
    expect(EventSourceFalso.ultima.url).toBe('/api/asistencias/eventos');

    act(() => EventSourceFalso.ultima.emitir('conectado', { reintento_ms: 3000 }));
    expect(screen.getByTestId('en-vivo')).toHaveTextContent(/^● En vivo$/);
  });

  it('una lectura nueva vuelve a pedir la lista en menos de un segundo y actualiza «última lectura hace N s»', async () => {
    const api = prepararApi();
    await abrirP2();
    act(() => EventSourceFalso.ultima.emitir('conectado'));

    act(() => {
      EventSourceFalso.ultima.emitir('asistencia', { id: 9 });
      EventSourceFalso.ultima.emitir('asistencia', { id: 10 }); // varias seguidas: una sola recarga
    });
    expect(screen.getByTestId('en-vivo')).toHaveTextContent('En vivo · última lectura hace 0 s');
    await act(() => vi.advanceTimersByTimeAsync(400));
    await waitFor(() => expect(consultasLista(api)).toHaveLength(2));

    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByTestId('en-vivo')).toHaveTextContent('En vivo · última lectura hace 3 s');
    expect(consultasLista(api)).toHaveLength(2);
  });

  it('si la conexión se corta muestra «Reconectando…», y al volver pide la lista otra vez', async () => {
    const api = prepararApi();
    await abrirP2();
    act(() => EventSourceFalso.ultima.emitir('conectado'));

    act(() => EventSourceFalso.ultima.fallar());
    expect(screen.getByTestId('en-vivo')).toHaveTextContent('Reconectando…');
    expect(consultasLista(api)).toHaveLength(1);

    act(() => EventSourceFalso.ultima.emitir('conectado'));
    expect(screen.getByTestId('en-vivo')).toHaveTextContent('En vivo');
    await act(() => vi.advanceTimersByTimeAsync(400));
    await waitFor(() => expect(consultasLista(api)).toHaveLength(2));
  });

  it('con «sesion_terminada» cierra la conexión y lleva al login', async () => {
    prepararApi();
    await abrirP2();
    act(() => EventSourceFalso.ultima.emitir('sesion_terminada', { motivo: 'La sesión terminó' }));

    expect(await screen.findByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeInTheDocument();
    expect(screen.getByTestId('ruta-actual')).toHaveTextContent('/login');
    expect(EventSourceFalso.ultima.readyState).toBe(EventSourceFalso.CLOSED);
  });

  it('si el navegador deja de reintentar, revisa la sesión y abre otra conexión a los 10 s', async () => {
    const api = prepararApi();
    await abrirP2();
    act(() => EventSourceFalso.ultima.fallar(true));

    expect(screen.getByTestId('en-vivo')).toHaveTextContent('Sin actualización automática');
    await waitFor(() => expect(llamadas(api, 'GET /api/auth/me')).toHaveLength(2));
    expect(EventSourceFalso.instancias).toHaveLength(1);

    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(EventSourceFalso.instancias).toHaveLength(2);
  });

  it('al salir de la pantalla cierra la conexión', async () => {
    prepararApi();
    montar('/asistencias');
    await screen.findByText('Mostrando 4 de 4 registros');
    const conexion = EventSourceFalso.ultima;
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('link', { name: 'Estadísticas' }));
    expect(conexion.readyState).toBe(EventSourceFalso.CLOSED);
  });
});

describe('P2 · Pendientes que vencen', () => {
  it('mientras haya pendientes en pantalla, la lista se vuelve a pedir cada minuto', async () => {
    const api = prepararApi();
    await abrirP2();
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await waitFor(() => expect(consultasLista(api)).toHaveLength(2));
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    await waitFor(() => expect(consultasLista(api)).toHaveLength(3));
  });

  it('sin pendientes no se refresca solo', async () => {
    const api = prepararApi(pagina(CUATRO_ESTADOS.filter((r) => r.estado !== 'Pendiente')));
    await abrirP2();
    await act(() => vi.advanceTimersByTimeAsync(180_000));
    expect(consultasLista(api)).toHaveLength(1);
  });
});

describe('P2 · Exportar', () => {
  let clics: string[];
  beforeEach(() => {
    clics = [];
    URL.createObjectURL = vi.fn(() => 'blob:taplist');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clics.push(this.download);
    });
  });

  it.each(['pdf', 'xlsx'] as const)('%s: descarga con los filtros aplicados y el nombre que propone el servidor', async (formato) => {
    const api = prepararApi(undefined, {
      'GET /api/asistencias/exportar': {
        status: 200,
        binario: 'contenido',
        encabezados: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename=asistencias_D01_2026-11-12_a_2026-11-18.${formato}` },
      },
    });
    await abrirP2('/asistencias?id_grupo=1&estado=Falta');
    await userEvent
      .setup({ advanceTimers: vi.advanceTimersByTime })
      .click(screen.getByRole('button', { name: `⬇ Exportar ${formato.toUpperCase()}` }));

    await waitFor(() => expect(clics).toEqual([`asistencias_D01_2026-11-12_a_2026-11-18.${formato}`]));
    const [llamada] = llamadas(api, 'GET /api/asistencias/exportar');
    expect(Object.fromEntries(llamada!.url.searchParams)).toEqual({ id_grupo: '1', estado: 'Falta', ...SEMANA, formato });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:taplist');
  });

  it('demasiadas filas (422): pide acotar los filtros', async () => {
    prepararApi(undefined, {
      'GET /api/asistencias/exportar': {
        status: 422,
        cuerpo: { error: 'La exportación tendría 6000 filas y el máximo es 5000. Acota el periodo o los filtros.' },
      },
    });
    await abrirP2();
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: '⬇ Exportar PDF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El archivo sería demasiado grande. La exportación tendría 6000 filas y el máximo es 5000. Acota el periodo o los filtros.',
    );
    expect(clics).toEqual([]);
    expect(screen.getByRole('button', { name: '⬇ Exportar PDF' })).toBeEnabled();
  });
});

describe('P2 · Errores', () => {
  it('un filtro que no existe o es de otro docente (404): mensaje claro', async () => {
    prepararApi({ status: 404, cuerpo: { error: 'El grupo no existe' } });
    montar('/asistencias?id_grupo=99');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se encontró el grupo o la clase del filtro. Pulsa «Limpiar» para empezar de nuevo.',
    );
  });

  it('sin red: mensaje claro', async () => {
    const api = prepararApi();
    api.mockImplementation(async (entrada) => {
      if (String(entrada) === '/api/auth/me') return new Response(JSON.stringify({ usuario: DOCENTE }), { status: 200 });
      throw new TypeError('Failed to fetch');
    });
    montar('/asistencias');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor');
  });

  it('un 401 al pedir la lista lleva al login', async () => {
    prepararApi({ status: 401, cuerpo: { error: 'No autenticado' } });
    montar('/asistencias');
    expect(await screen.findByText('Tu sesión terminó. Inicia sesión de nuevo.')).toBeInTheDocument();
  });
});
