import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { obtenerOpcionesFiltros, type OpcionesFiltros } from '../../api/asistencias';
import { descargarArchivo, ErrorApi } from '../../api/cliente';
import {
  MAX_DIAS_PERIODO,
  obtenerEstadisticas,
  rutaExportarEstadisticas,
  type Estadisticas as DatosEstadisticas,
  type FiltrosP3,
} from '../../api/estadisticas';
import { diasEntre, fechaCorta, fechaLocal, lunesDe, porcentaje, sumarDias } from '../../utilidades/fechas';
import { GraficaSemanal, semanasDelPeriodo } from './GraficaSemanal';

/** Periodo inicial: las últimas 6 semanas, del lunes de hace 5 semanas hasta hoy. */
export function periodoPorDefecto(hoy: string = fechaLocal()): { desde: string; hasta: string } {
  return { desde: sumarDias(lunesDe(hoy), -35), hasta: hoy };
}

function leerFiltros(parametros: URLSearchParams): FiltrosP3 {
  const porDefecto = periodoPorDefecto();
  return {
    id_grupo: parametros.get('id_grupo') ?? '',
    id_clase: parametros.get('id_clase') ?? '',
    desde: parametros.get('desde') ?? porDefecto.desde,
    hasta: parametros.get('hasta') ?? porDefecto.hasta,
  };
}

/** Revisión del periodo antes de llamar a la API, con los mismos límites que ella. */
function errorDelPeriodo({ desde, hasta }: FiltrosP3): string | null {
  if (!desde || !hasta) return 'Elige el inicio y el fin del periodo.';
  if (hasta < desde) return 'El fin del periodo no puede ser anterior al inicio.';
  if (diasEntre(desde, hasta) >= MAX_DIAS_PERIODO) return `El periodo no puede ser mayor que ${MAX_DIAS_PERIODO} días.`;
  return null;
}

function mensajeDeError(error: unknown): string {
  if (!(error instanceof ErrorApi)) return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
  if (error.status === 404) return 'No se encontró el grupo o la clase del filtro. Elige otro y pulsa «Actualizar».';
  const detalles = Object.values(error.detalles);
  return detalles.length ? `${error.message}: ${detalles.join('; ')}` : error.message;
}

/** P3 · Estadísticas de asistencia del docente. */
export function Estadisticas() {
  const [parametros, setParametros] = useSearchParams();
  const textoParametros = parametros.toString();
  const aplicados = useMemo(() => leerFiltros(new URLSearchParams(textoParametros)), [textoParametros]);

  const [borrador, setBorrador] = useState<FiltrosP3>(aplicados);
  const [errorPeriodo, setErrorPeriodo] = useState<string | null>(null);
  useEffect(() => setBorrador(aplicados), [aplicados]);

  const [opciones, setOpciones] = useState<OpcionesFiltros>({ grupos: [], clases: [] });
  const [datos, setDatos] = useState<DatosEstadisticas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    const control = new AbortController();
    obtenerOpcionesFiltros(control.signal)
      .then(setOpciones)
      .catch(() => undefined); // sin opciones, los selectores quedan en «Todos»
    return () => control.abort();
  }, []);

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    obtenerEstadisticas(aplicados, control.signal)
      .then((respuesta) => {
        setDatos(respuesta);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!control.signal.aborted) setError(mensajeDeError(e));
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false);
      });
    return () => control.abort();
  }, [aplicados, recarga]);

  const clasesDelGrupo = opciones.clases.filter((c) => !borrador.id_grupo || String(c.grupo.id) === borrador.id_grupo);

  function cambiarGrupo(id_grupo: string) {
    setBorrador((b) => {
      const claseSigue = opciones.clases.some((c) => String(c.id) === b.id_clase && (!id_grupo || String(c.grupo.id) === id_grupo));
      return { ...b, id_grupo, id_clase: claseSigue ? b.id_clase : '' };
    });
  }

  function actualizar(evento: FormEvent) {
    evento.preventDefault();
    const problema = errorDelPeriodo(borrador);
    setErrorPeriodo(problema);
    if (problema) return;
    const nuevos = new URLSearchParams();
    for (const [clave, valor] of Object.entries(borrador)) if (valor) nuevos.set(clave, valor);
    if (nuevos.toString() === textoParametros) setRecarga((n) => n + 1);
    else setParametros(nuevos);
  }

  const [exportando, setExportando] = useState<'pdf' | 'xlsx' | null>(null);
  const [avisoExportar, setAvisoExportar] = useState<string | null>(null);

  async function exportar(formato: 'pdf' | 'xlsx') {
    setExportando(formato);
    setAvisoExportar(null);
    try {
      await descargarArchivo(rutaExportarEstadisticas(aplicados, formato), `estadisticas.${formato}`);
    } catch (e) {
      setAvisoExportar(`No se pudo exportar. ${mensajeDeError(e)}`);
    } finally {
      setExportando(null);
    }
  }

  const semanas = datos ? semanasDelPeriodo(datos.periodo.desde, datos.periodo.hasta, datos.por_semana) : [];
  const resumen = datos?.resumen;

  return (
    <section className="p3">
      <h1 className="titulo">Estadísticas de asistencia</h1>
      <p className="subtitulo">Indicadores por grupo y periodo</p>

      <div className="p3__barra">
        <form className="p3__filtros" onSubmit={actualizar} aria-label="Filtros">
          <div className="filtro">
            <label htmlFor="e-grupo">Grupo</label>
            <select id="e-grupo" value={borrador.id_grupo} onChange={(e) => cambiarGrupo(e.target.value)}>
              <option value="">Todos</option>
              {opciones.grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="filtro filtro--ancho">
            <label htmlFor="e-clase">Clase</label>
            <select id="e-clase" value={borrador.id_clase} onChange={(e) => setBorrador((b) => ({ ...b, id_clase: e.target.value }))}>
              <option value="">Todas</option>
              {clasesDelGrupo.map((c) => (
                <option key={c.id} value={c.id}>
                  {borrador.id_grupo ? c.materia : `${c.materia} · ${c.grupo.nombre}`}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="filtro filtro--periodo">
            <legend>Periodo</legend>
            <div className="periodo">
              <input
                type="date"
                aria-label="Inicio del periodo"
                value={borrador.desde}
                onChange={(e) => setBorrador((b) => ({ ...b, desde: e.target.value }))}
                aria-invalid={Boolean(errorPeriodo)}
              />
              <span aria-hidden="true">–</span>
              <input
                type="date"
                aria-label="Fin del periodo"
                value={borrador.hasta}
                onChange={(e) => setBorrador((b) => ({ ...b, hasta: e.target.value }))}
                aria-invalid={Boolean(errorPeriodo)}
                aria-describedby={errorPeriodo ? 'error-periodo' : undefined}
              />
            </div>
          </fieldset>
          <div className="filtros__acciones">
            <button type="submit" className="boton boton--primario">
              Actualizar
            </button>
          </div>
          {errorPeriodo && (
            <p id="error-periodo" className="campo__error filtros__error">
              {errorPeriodo}
            </p>
          )}
        </form>
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
      {!datos && cargando && <p className="cargando">Cargando estadísticas…</p>}

      {datos && resumen && (
        <div className="p3__contenido" aria-busy={cargando}>
          <p className="p3__periodo">
            Del {fechaCorta(datos.periodo.desde)} al {fechaCorta(datos.periodo.hasta)} · {resumen.sesiones}{' '}
            {resumen.sesiones === 1 ? 'sesión' : 'sesiones'}
          </p>
          <div className="tarjetas">
            <Tarjeta titulo="% de asistencia" valor={porcentaje(resumen.porcentaje_asistencia)} />
            <Tarjeta titulo="Retardos" valor={String(resumen.retardos)} tono="retardo" />
            <Tarjeta
              titulo="Faltas"
              valor={String(resumen.faltas)}
              tono="falta"
              nota={resumen.pendientes ? `+${resumen.pendientes} ${resumen.pendientes === 1 ? 'pendiente' : 'pendientes'}` : undefined}
            />
            <Tarjeta
              titulo="Estudiantes en el grupo"
              valor={String(datos.estudiantes_en_grupo)}
              nota={`al ${fechaCorta(datos.periodo.hasta)}`}
            />
          </div>

          <div className="p3__paneles">
            <section className="panel" aria-labelledby="titulo-grafica">
              <h2 id="titulo-grafica" className="panel__titulo">
                Asistencia por semana (%)
              </h2>
              <GraficaSemanal semanas={semanas} />
            </section>

            <section className="panel" aria-labelledby="titulo-faltas">
              <h2 id="titulo-faltas" className="panel__titulo">
                Estudiantes con más faltas
              </h2>
              {datos.estudiantes_con_mas_faltas.length === 0 ? (
                <p className="panel__vacio">Nadie tiene faltas en este periodo.</p>
              ) : (
                <div className="tabla-contenedor">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Estudiante</th>
                        <th scope="col" className="tabla__numero">
                          Faltas
                        </th>
                        <th scope="col" className="tabla__numero">
                          % Asist.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {datos.estudiantes_con_mas_faltas.map((e) => (
                        <tr key={e.estudiante.id}>
                          <td>
                            {e.estudiante.nombre} {e.estudiante.apellidos}
                          </td>
                          <td className="tabla__numero">{e.faltas}</td>
                          <td className="tabla__numero">{porcentaje(e.porcentaje_asistencia)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </section>
  );
}

function Tarjeta({ titulo, valor, tono, nota }: { titulo: string; valor: string; tono?: 'retardo' | 'falta'; nota?: string }) {
  return (
    <div className="tarjeta">
      <p className="tarjeta__titulo">{titulo}</p>
      <p className={tono ? `tarjeta__valor tarjeta__valor--${tono}` : 'tarjeta__valor'}>{valor}</p>
      {nota && <p className="tarjeta__nota">{nota}</p>}
    </div>
  );
}
