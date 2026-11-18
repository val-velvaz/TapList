import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import {
  ESTADOS,
  listarRegistros,
  obtenerOpcionesFiltros,
  rutaExportar,
  type EstadoRegistro,
  type FiltrosP2,
  type OpcionesFiltros,
  type Pagina,
  type Registro,
} from '../../api/asistencias';
import { descargarArchivo, ErrorApi } from '../../api/cliente';
import { Paginacion } from '../../componentes/Paginacion';
import { fechaCorta, fechaLocal, haceCuanto, horaCorta, sumarDias } from '../../utilidades/fechas';
import { useEnVivo, type EstadoConexion } from './useEnVivo';

/** Mientras haya pendientes en pantalla, la lista se vuelve a pedir cada minuto: un pendiente pasa a falta sin que llegue ninguna lectura. */
export const REFRESCO_PENDIENTES_MS = 60_000;
/** Varias lecturas seguidas producen una sola recarga. */
export const ESPERA_RECARGA_MS = 300;

const CLASE_ESTADO: Record<EstadoRegistro, string> = {
  Asistencia: 'etiqueta etiqueta--asistencia',
  Retardo: 'etiqueta etiqueta--retardo',
  Pendiente: 'etiqueta etiqueta--pendiente',
  Falta: 'etiqueta etiqueta--falta',
};

/** Por defecto: la última semana, hasta hoy. */
function filtrosPorDefecto(): Required<Pick<FiltrosP2, 'desde' | 'hasta'>> {
  const hoy = fechaLocal();
  return { desde: sumarDias(hoy, -6), hasta: hoy };
}

function leerFiltros(parametros: URLSearchParams): FiltrosP2 {
  const porDefecto = filtrosPorDefecto();
  const estado = parametros.get('estado');
  return {
    id_grupo: parametros.get('id_grupo') ?? '',
    id_clase: parametros.get('id_clase') ?? '',
    q: parametros.get('q') ?? '',
    estado: ESTADOS.includes(estado as EstadoRegistro) ? (estado as EstadoRegistro) : undefined,
    desde: parametros.get('desde') ?? porDefecto.desde,
    hasta: parametros.get('hasta') ?? porDefecto.hasta,
  };
}

const claveFila = (r: Registro) => r.id ?? `${r.clase.id}-${r.fecha}-${r.estudiante.id}`;

function mensajeDeError(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  if (error.status === 404) return 'No se encontró el grupo o la clase del filtro. Pulsa «Limpiar» para empezar de nuevo.';
  const detalles = Object.values(error.detalles);
  return detalles.length ? `${error.message}: ${detalles.join('; ')}` : error.message;
}

/** P2 · Consulta de asistencias del docente. */
export function Asistencias() {
  const [parametros, setParametros] = useSearchParams();
  const textoParametros = parametros.toString();
  const aplicados = useMemo(() => leerFiltros(new URLSearchParams(textoParametros)), [textoParametros]);
  const pagina = Math.max(1, Number(parametros.get('pagina')) || 1);

  const [borrador, setBorrador] = useState<FiltrosP2>(aplicados);
  const [errorFechas, setErrorFechas] = useState<string | null>(null);
  useEffect(() => setBorrador(aplicados), [aplicados]);

  const [opciones, setOpciones] = useState<OpcionesFiltros>({ grupos: [], clases: [] });
  const [resultado, setResultado] = useState<Pagina<Registro> | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  // Grupos y clases del docente, una vez.
  useEffect(() => {
    const control = new AbortController();
    obtenerOpcionesFiltros(control.signal)
      .then(setOpciones)
      .catch(() => undefined); // sin opciones, los selectores quedan en «Todos»
    return () => control.abort();
  }, []);

  // La lista, cada vez que cambian los filtros, la página o llega una lectura.
  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    listarRegistros(aplicados, pagina, control.signal)
      .then((datos) => {
        setResultado(datos);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!control.signal.aborted) setError(mensajeDeError(e));
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [aplicados, pagina, recarga]);

  // En vivo: cada lectura nueva o reconexión vuelve a pedir la lista.
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const programarRecarga = useCallback(() => {
    clearTimeout(espera.current);
    espera.current = setTimeout(() => setRecarga((n) => n + 1), ESPERA_RECARGA_MS);
  }, []);
  useEffect(() => () => clearTimeout(espera.current), []);
  const { estado: conexion, ultimaLectura } = useEnVivo({ alLeer: programarRecarga, alReconectar: programarRecarga });

  const hayPendientes = Boolean(resultado?.datos.some((r) => r.estado === 'Pendiente'));
  useEffect(() => {
    if (!hayPendientes) return;
    const intervalo = setInterval(() => setRecarga((n) => n + 1), REFRESCO_PENDIENTES_MS);
    return () => clearInterval(intervalo);
  }, [hayPendientes]);

  // --- Filtros ---
  const clasesDelGrupo = opciones.clases.filter((c) => !borrador.id_grupo || String(c.grupo.id) === borrador.id_grupo);

  function cambiarGrupo(id_grupo: string) {
    setBorrador((b) => {
      const claseSigue = opciones.clases.some((c) => String(c.id) === b.id_clase && (!id_grupo || String(c.grupo.id) === id_grupo));
      return { ...b, id_grupo, id_clase: claseSigue ? b.id_clase : '' };
    });
  }

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setErrorFechas('«Hasta» no puede ser anterior a «Desde».');
      return;
    }
    setErrorFechas(null);
    const nuevos = new URLSearchParams();
    for (const [clave, valor] of Object.entries(borrador)) {
      const texto = typeof valor === 'string' ? valor.trim() : valor;
      if (texto) nuevos.set(clave, texto);
    }
    if (nuevos.toString() === textoParametros) setRecarga((n) => n + 1);
    else setParametros(nuevos);
  }

  function limpiar() {
    setErrorFechas(null);
    setParametros(new URLSearchParams());
  }

  function irAPagina(nueva: number) {
    const siguientes = new URLSearchParams(parametros);
    if (nueva > 1) siguientes.set('pagina', String(nueva));
    else siguientes.delete('pagina');
    setParametros(siguientes);
  }

  // --- Exportar ---
  const [exportando, setExportando] = useState<'pdf' | 'xlsx' | null>(null);
  const [avisoExportar, setAvisoExportar] = useState<string | null>(null);

  async function exportar(formato: 'pdf' | 'xlsx') {
    setExportando(formato);
    setAvisoExportar(null);
    try {
      await descargarArchivo(rutaExportar(aplicados, formato), `asistencias.${formato}`);
    } catch (e) {
      setAvisoExportar(
        e instanceof ErrorApi && e.status === 422
          ? `El archivo sería demasiado grande. ${e.message}`
          : `No se pudo exportar. ${mensajeDeError(e)}`,
      );
    } finally {
      setExportando(null);
    }
  }

  return (
    <section className="p2">
      <div className="p2__cabecera">
        <div>
          <h1 className="titulo">Consulta de asistencias</h1>
          <p className="subtitulo">Registros de tus grupos · actualización automática</p>
        </div>
        <IndicadorEnVivo estado={conexion} ultimaLectura={ultimaLectura} />
      </div>

      <form className="filtros" onSubmit={buscar} aria-label="Filtros">
        <div className="filtro">
          <label htmlFor="f-grupo">Grupo</label>
          <select id="f-grupo" value={borrador.id_grupo} onChange={(e) => cambiarGrupo(e.target.value)}>
            <option value="">Todos</option>
            {opciones.grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}
              </option>
            ))}
          </select>
        </div>
        <div className="filtro filtro--ancho">
          <label htmlFor="f-clase">Clase</label>
          <select id="f-clase" value={borrador.id_clase} onChange={(e) => setBorrador((b) => ({ ...b, id_clase: e.target.value }))}>
            <option value="">Todas</option>
            {clasesDelGrupo.map((c) => (
              <option key={c.id} value={c.id}>
                {borrador.id_grupo ? c.materia : `${c.materia} · ${c.grupo.nombre}`}
              </option>
            ))}
          </select>
        </div>
        <div className="filtro filtro--ancho">
          <label htmlFor="f-estudiante">Estudiante</label>
          <input
            id="f-estudiante"
            type="search"
            placeholder="Buscar por nombre…"
            maxLength={100}
            value={borrador.q}
            onChange={(e) => setBorrador((b) => ({ ...b, q: e.target.value }))}
          />
        </div>
        <div className="filtro">
          <label htmlFor="f-estado">Estado</label>
          <select
            id="f-estado"
            value={borrador.estado ?? ''}
            onChange={(e) => setBorrador((b) => ({ ...b, estado: (e.target.value || undefined) as EstadoRegistro | undefined }))}
          >
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </div>
        <div className="filtro">
          <label htmlFor="f-desde">Desde</label>
          <input id="f-desde" type="date" value={borrador.desde} onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))} />
        </div>
        <div className="filtro">
          <label htmlFor="f-hasta">Hasta</label>
          <input
            id="f-hasta"
            type="date"
            value={borrador.hasta}
            onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
            aria-invalid={Boolean(errorFechas)}
            aria-describedby={errorFechas ? 'error-fechas' : undefined}
          />
        </div>
        <div className="filtros__acciones">
          <button type="submit" className="boton boton--primario">
            Buscar
          </button>
          <button type="button" className="boton" onClick={limpiar}>
            Limpiar
          </button>
        </div>
        {errorFechas && (
          <p id="error-fechas" className="campo__error filtros__error">
            {errorFechas}
          </p>
        )}
      </form>

      <div className="p2__barra">
        <p className="p2__conteo" aria-live="polite">
          {resultado ? `Mostrando ${resultado.datos.length} de ${resultado.total} registros` : ''}
        </p>
        <div className="p2__exportar">
          <button type="button" className="boton" onClick={() => exportar('pdf')} disabled={exportando !== null}>
            {exportando === 'pdf' ? 'Exportando…' : '⬇ Exportar PDF'}
          </button>
          <button type="button" className="boton" onClick={() => exportar('xlsx')} disabled={exportando !== null}>
            {exportando === 'xlsx' ? 'Exportando…' : '⬇ Exportar XLSX'}
          </button>
        </div>
      </div>

      {avisoExportar && (
        <p className="aviso aviso--error" role="alert">
          {avisoExportar}
        </p>
      )}
      {error && (
        <p className="aviso aviso--error" role="alert">
          {error}
        </p>
      )}

      <div className="tabla-contenedor">
        <table className="tabla" aria-busy={cargando}>
          <thead>
            <tr>
              <th scope="col">Estudiante</th>
              <th scope="col">Grupo</th>
              <th scope="col">Clase</th>
              <th scope="col">Fecha</th>
              <th scope="col">Hora</th>
              <th scope="col">Estado</th>
              <th scope="col">Lector</th>
            </tr>
          </thead>
          <tbody>
            {resultado?.datos.map((r) => (
              <tr key={claveFila(r)}>
                <td>
                  {r.estudiante.nombre} {r.estudiante.apellidos}
                </td>
                <td>{r.grupo.nombre}</td>
                <td>{r.clase.materia}</td>
                <td>{fechaCorta(r.fecha)}</td>
                <td>{r.hora ? horaCorta(r.hora) : '—'}</td>
                <td>
                  <span className={CLASE_ESTADO[r.estado]}>{r.estado}</span>
                </td>
                <td>{r.dispositivo?.nombre_ubicacion ?? '—'}</td>
              </tr>
            ))}
            {resultado && resultado.datos.length === 0 && (
              <tr>
                <td colSpan={7} className="tabla__vacia">
                  No hay registros con estos filtros.
                </td>
              </tr>
            )}
            {!resultado && cargando && (
              <tr>
                <td colSpan={7} className="tabla__vacia">
                  Cargando registros…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resultado && <Paginacion actual={resultado.pagina} total={resultado.total_paginas} alCambiar={irAPagina} />}
    </section>
  );
}

function IndicadorEnVivo({ estado, ultimaLectura }: { estado: EstadoConexion; ultimaLectura: number | null }) {
  // Vuelve a dibujarse cada segundo para que «hace N s» avance.
  const [, setTic] = useState(0);
  useEffect(() => {
    if (estado !== 'en_vivo' || ultimaLectura === null) return;
    const intervalo = setInterval(() => setTic((n) => n + 1), 1000);
    return () => clearInterval(intervalo);
  }, [estado, ultimaLectura]);

  const texto: Record<EstadoConexion, string> = {
    conectando: 'Conectando…',
    en_vivo: ultimaLectura === null ? 'En vivo' : `En vivo · última lectura ${haceCuanto(ultimaLectura)}`,
    reconectando: 'Reconectando…',
    sin_conexion: 'Sin actualización automática',
  };
  return (
    <p className={`en-vivo en-vivo--${estado}`} role="status" data-testid="en-vivo">
      <span className="en-vivo__punto" aria-hidden="true">
        ●
      </span>{' '}
      {texto[estado]}
    </p>
  );
}
