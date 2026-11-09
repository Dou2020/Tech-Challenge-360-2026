import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { DefinicionExportacion } from '../../types/exportacion';
import {
  celdaTexto,
  encabezadoReporte,
  esNumerica,
  nombreArchivo,
  textoPdf,
} from '../../utils/exportacion';

const MARGEN = 40;
/** Con más columnas que esto la página va horizontal. */
const COLUMNAS_VERTICAL = 5;
const COLOR_CABECERA: [number, number, number] = [30, 41, 59];
const COLOR_TENUE: [number, number, number] = [100, 116, 139];

/** Genera el PDF del reporte (tamaño carta) y lo descarga. Se carga con `import()` solo al exportar. */
export function exportarPdf<T>(def: DefinicionExportacion<T>, ahora = new Date()) {
  const doc = new jsPDF({
    orientation: def.columnas.length > COLUMNAS_VERTICAL ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'letter',
    compress: true,
  });
  doc.setProperties({ title: def.titulo, creator: 'ShopCart' });

  let y = MARGEN + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(textoPdf(def.titulo), MARGEN, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR_TENUE);
  for (const linea of encabezadoReporte(def.rango, def.extra, ahora)) {
    y += 14;
    doc.text(textoPdf(linea), MARGEN, y);
  }
  doc.setTextColor(0, 0, 0);

  const numericas = new Set(def.columnas.flatMap((c, i) => (esNumerica(c.tipo) ? [i] : [])));
  const columnStyles = Object.fromEntries(
    [...numericas].map((i) => [i, { halign: 'right' as const }]),
  );

  autoTable(doc, {
    startY: y + 14,
    margin: { left: MARGEN, right: MARGEN, bottom: MARGEN },
    head: [def.columnas.map((c) => textoPdf(c.titulo))],
    body: def.filas.map((fila) =>
      def.columnas.map((c) => textoPdf(celdaTexto(c.tipo, c.valor(fila)))),
    ),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: COLOR_CABECERA, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles,
    // columnStyles no aplica a la cabecera: se alinea a mano para que coincida con los montos.
    didParseCell: ({ section, column, cell }) => {
      if (section === 'head' && numericas.has(column.index)) cell.styles.halign = 'right';
    },
  });

  const paginas = doc.getNumberOfPages();
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(...COLOR_TENUE);
  for (let pagina = 1; pagina <= paginas; pagina++) {
    doc.setPage(pagina);
    doc.text(`ShopCart · ${textoPdf(def.titulo)}`, MARGEN, alto - 20);
    doc.text(`Página ${pagina} de ${paginas}`, ancho - MARGEN, alto - 20, { align: 'right' });
  }

  doc.save(nombreArchivo(def.reporte, def.rango, 'pdf'));
}
