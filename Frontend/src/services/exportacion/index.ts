import type { DefinicionExportacion, FormatoExportacion } from '../../types/exportacion';

/**
 * Genera y descarga el reporte. Los generadores (y con ellos exceljs, jspdf y jspdf-autotable) se
 * cargan con `import()` solo al exportar, para que no entren al bundle inicial.
 */
export async function exportarReporte<T>(
  formato: FormatoExportacion,
  def: DefinicionExportacion<T>,
): Promise<void> {
  if (formato === 'excel') {
    const { exportarExcel } = await import('./excel');
    await exportarExcel(def);
  } else {
    const { exportarPdf } = await import('./pdf');
    exportarPdf(def);
  }
}
