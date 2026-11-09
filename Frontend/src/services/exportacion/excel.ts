import ExcelJS from 'exceljs';
import type { DefinicionExportacion } from '../../types/exportacion';
import {
  celdaExcel,
  descargarBlob,
  encabezadoReporte,
  nombreArchivo,
} from '../../utils/exportacion';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const RELLENO_CABECERA = 'FFE2E8F0';

/** Excel no admite estos caracteres ni más de 31 en el nombre de una hoja. */
function nombreHoja(titulo: string): string {
  return titulo.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Reporte';
}

/** Genera el .xlsx del reporte y lo descarga. Se carga con `import()` solo al exportar. */
export async function exportarExcel<T>(def: DefinicionExportacion<T>, ahora = new Date()) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'ShopCart';
  libro.created = ahora;
  const hoja = libro.addWorksheet(nombreHoja(def.titulo));
  hoja.columns = def.columnas.map((c) => ({ width: c.ancho ?? 14 }));

  hoja.addRow([def.titulo]).font = { bold: true, size: 14 };
  for (const linea of encabezadoReporte(def.rango, def.extra, ahora)) {
    hoja.addRow([linea]).font = { color: { argb: 'FF475569' } };
  }
  hoja.addRow([]);

  const cabecera = hoja.addRow(def.columnas.map((c) => c.titulo));
  cabecera.font = { bold: true };
  cabecera.eachCell((celda) => {
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RELLENO_CABECERA } };
    celda.border = { bottom: { style: 'thin' } };
  });
  const filaCabecera = cabecera.number;

  for (const fila of def.filas) {
    const celdas = def.columnas.map((c) => celdaExcel(c.tipo, c.valor(fila)));
    const agregada = hoja.addRow(celdas.map((c) => c.valor));
    celdas.forEach((c, i) => {
      if (c.formato) agregada.getCell(i + 1).numFmt = c.formato;
    });
  }

  hoja.autoFilter = {
    from: { row: filaCabecera, column: 1 },
    to: { row: filaCabecera, column: def.columnas.length },
  };
  hoja.views = [{ state: 'frozen', ySplit: filaCabecera }];

  const buffer = await libro.xlsx.writeBuffer();
  descargarBlob(
    new Blob([buffer], { type: TIPO_XLSX }),
    nombreArchivo(def.reporte, def.rango, 'excel'),
  );
}
