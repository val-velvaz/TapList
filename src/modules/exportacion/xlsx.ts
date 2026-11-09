import ExcelJS from 'exceljs';
import type { Encabezado, Tabla } from './exportacion.tipos.js';

export interface HojaXlsx {
  nombre: string;
  /** Solo la primera hoja suele llevar el encabezado completo. */
  encabezado?: Encabezado;
  tablas: Tabla[];
  /** Pares etiqueta → valor que van al final (totales). */
  totales?: Array<[string, number | string]>;
}

/**
 * Genera un XLSX con una o varias hojas. Los textos se escriben como texto
 * (nunca como fórmula), así que un nombre que empiece con "=" no se ejecuta.
 */
export async function generarXlsx(hojas: HojaXlsx[]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'TapList';
  libro.created = new Date();

  for (const hoja of hojas) {
    const ws = libro.addWorksheet(hoja.nombre);

    if (hoja.encabezado) {
      ws.addRow([hoja.encabezado.titulo]).font = { bold: true, size: 14 };
      for (const [etiqueta, valor] of hoja.encabezado.datos) {
        const fila = ws.addRow([etiqueta, valor]);
        fila.getCell(1).font = { bold: true };
      }
      ws.addRow([]);
    }

    let anchos: number[] = [];
    for (const tabla of hoja.tablas) {
      if (tabla.titulo) ws.addRow([tabla.titulo]).font = { bold: true, size: 12 };
      const cabecera = ws.addRow(tabla.columnas.map((c) => c.titulo));
      cabecera.font = { bold: true };
      cabecera.eachCell((celda) => {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF4' } };
        celda.border = { bottom: { style: 'thin' } };
      });
      for (const fila of tabla.filas) ws.addRow(fila.map((v) => v ?? ''));
      ws.addRow([]);
      anchos = tabla.columnas.map((c, i) => Math.max(anchos[i] ?? 0, c.ancho));
    }

    if (hoja.totales) {
      for (const [etiqueta, valor] of hoja.totales) {
        const fila = ws.addRow([etiqueta, valor]);
        fila.font = { bold: true };
      }
    }

    // El ancho de columna en Excel va en caracteres; los anchos de las tablas son para el PDF (puntos).
    anchos.forEach((ancho, i) => {
      ws.getColumn(i + 1).width = Math.max(12, Math.round(ancho / 5.5));
    });
  }

  return Buffer.from(await libro.xlsx.writeBuffer());
}
