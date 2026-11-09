export type Formato = 'pdf' | 'xlsx';

export const TIPO_MIME: Record<Formato, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Encabezado común de los archivos: qué se exportó, para quién y con qué filtros. */
export interface Encabezado {
  titulo: string;
  /** Pares etiqueta → valor (docente, filtros aplicados, periodo, fecha de generación). */
  datos: Array<[string, string]>;
}

/** Una tabla lista para dibujar en PDF o escribir en XLSX. */
export interface Tabla {
  titulo?: string;
  columnas: Array<{ titulo: string; ancho: number; alinear?: 'left' | 'right' | 'center' }>;
  filas: Array<Array<string | number | null>>;
}

export interface Archivo {
  nombre: string;
  formato: Formato;
  contenido: Buffer;
}
