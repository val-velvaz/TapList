import PDFDocument from 'pdfkit';
import type { Encabezado, Tabla } from './exportacion.tipos.js';

export interface SeccionPdf {
  tabla: Tabla;
}

const MARGEN = 36;
const ALTO_FILA = 16;
const TAM_TEXTO = 8.5;

type Doc = InstanceType<typeof PDFDocument>;

function texto(valor: string | number | null): string {
  return valor === null || valor === undefined ? '—' : String(valor);
}

function dibujarFila(doc: Doc, tabla: Tabla, valores: Array<string | number | null>, y: number, negritas: boolean): void {
  doc.font(negritas ? 'Helvetica-Bold' : 'Helvetica').fontSize(TAM_TEXTO);
  let x = MARGEN;
  tabla.columnas.forEach((col, i) => {
    doc.text(texto(valores[i] ?? null), x + 3, y + 4, {
      width: col.ancho - 6,
      height: ALTO_FILA,
      align: col.alinear ?? 'left',
      lineBreak: false,
      ellipsis: true,
    });
    x += col.ancho;
  });
}

function dibujarCabecera(doc: Doc, tabla: Tabla, y: number): void {
  const ancho = tabla.columnas.reduce((s, c) => s + c.ancho, 0);
  doc.save().rect(MARGEN, y, ancho, ALTO_FILA).fill('#E8EEF4').restore();
  doc.fillColor('black');
  dibujarFila(doc, tabla, tabla.columnas.map((c) => c.titulo), y, true);
}

/** Dibuja la tabla a partir de doc.y; si no cabe, sigue en otra página y repite la cabecera. */
function dibujarTabla(doc: Doc, tabla: Tabla): void {
  const limite = () => doc.page.height - MARGEN - 20;
  if (tabla.titulo) {
    if (doc.y + 40 > limite()) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(11).text(tabla.titulo, MARGEN, doc.y);
    doc.moveDown(0.3);
  }
  let y = doc.y;
  if (y + 2 * ALTO_FILA > limite()) {
    doc.addPage();
    y = MARGEN;
  }
  dibujarCabecera(doc, tabla, y);
  y += ALTO_FILA;
  for (const fila of tabla.filas) {
    if (y + ALTO_FILA > limite()) {
      doc.addPage();
      y = MARGEN;
      dibujarCabecera(doc, tabla, y);
      y += ALTO_FILA;
    }
    dibujarFila(doc, tabla, fila, y, false);
    y += ALTO_FILA;
  }
  doc.y = y + 10;
  doc.x = MARGEN;
}

/**
 * Genera un PDF tamaño carta horizontal con el encabezado, las tablas y los
 * totales, y numera las páginas. Usa Helvetica (incluye acentos y eñes).
 */
export function generarPdf(
  encabezado: Encabezado,
  tablas: Tabla[],
  totales: Array<[string, number | string]> = [],
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'LETTER',
    layout: 'landscape',
    margin: MARGEN,
    bufferPages: true,
    info: { Title: encabezado.titulo, Author: 'TapList' },
  });
  const trozos: Buffer[] = [];
  doc.on('data', (t: Buffer) => trozos.push(t));
  const terminado = new Promise<Buffer>((resolver, rechazar) => {
    doc.on('end', () => resolver(Buffer.concat(trozos)));
    doc.on('error', rechazar);
  });

  doc.font('Helvetica-Bold').fontSize(16).text(encabezado.titulo);
  doc.moveDown(0.4);
  for (const [etiqueta, valor] of encabezado.datos) {
    doc.font('Helvetica-Bold').fontSize(9).text(`${etiqueta}: `, { continued: true });
    doc.font('Helvetica').text(valor);
  }
  doc.moveDown(0.8);

  for (const tabla of tablas) dibujarTabla(doc, tabla);

  if (totales.length) {
    if (doc.y + totales.length * 14 > doc.page.height - MARGEN - 20) doc.addPage();
    for (const [etiqueta, valor] of totales) {
      doc.font('Helvetica-Bold').fontSize(10).text(`${etiqueta}: `, MARGEN, doc.y, { continued: true });
      doc.font('Helvetica').text(String(valor));
    }
  }

  // Número de página al pie de cada hoja.
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // permite escribir en el margen sin crear otra página
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text(`TapList · Página ${i + 1} de ${paginas.count}`, MARGEN, doc.page.height - MARGEN + 10, {
        width: doc.page.width - 2 * MARGEN,
        align: 'right',
        lineBreak: false,
      });
    doc.page.margins.bottom = margenInferior;
    doc.fillColor('black');
  }

  doc.end();
  return terminado;
}
