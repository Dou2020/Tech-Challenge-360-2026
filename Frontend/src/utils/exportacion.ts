import type { RangoExportacion, TipoCelda, ValorCelda } from '../types/exportacion';
import { formatearFecha, formatearMonto } from './format';
import { formatearDia } from './rangoFechas';

/** Formato numérico de Excel para quetzales (la celda queda como número, no como texto). */
export const FORMATO_MONEDA_EXCEL = '"Q" #,##0.00';
export const FORMATO_ENTERO_EXCEL = '#,##0';

const EXTENSION = { excel: 'xlsx', pdf: 'pdf' } as const;

/** `ventas-por-dia` + rango → `ventas-por-dia_2026-10-10_2026-11-08.xlsx`. */
export function nombreArchivo(
  reporte: string,
  rango: RangoExportacion,
  formato: keyof typeof EXTENSION,
): string {
  const base = reporte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const partes = [base || 'reporte', rango.desde, rango.hasta].filter(Boolean);
  return `${partes.join('_')}.${EXTENSION[formato]}`;
}

/** Texto del periodo. Sin `desde` ni `hasta`, la API usa todo el historial. */
export function textoRango({ desde, hasta }: RangoExportacion): string {
  if (desde && hasta) return `Del ${formatearDia(desde)} al ${formatearDia(hasta)}`;
  if (desde) return `Desde el ${formatearDia(desde)}`;
  if (hasta) return `Hasta el ${formatearDia(hasta)}`;
  return 'Todo el historial';
}

/** Líneas bajo el título: periodo, línea extra opcional y fecha de generación (hora de Guatemala). */
export function encabezadoReporte(
  rango: RangoExportacion,
  extra?: string,
  ahora: Date = new Date(),
): string[] {
  return [textoRango(rango), ...(extra ? [extra] : []), `Generado: ${formatearFecha(ahora)}`];
}

/** Celda como texto (PDF). */
export function celdaTexto(tipo: TipoCelda, valor: ValorCelda): string {
  if (valor === null || valor === '') return '';
  switch (tipo) {
    case 'moneda':
      return formatearMonto(valor);
    case 'dia':
      return formatearDia(String(valor));
    case 'fecha':
      return formatearFecha(String(valor));
    default:
      return String(valor);
  }
}

/**
 * Celda para Excel. Montos y enteros van como número con formato (para que se puedan sumar en la
 * hoja); días y fechas como texto ya en hora de Guatemala, para que Excel no los corra de zona.
 */
export function celdaExcel(
  tipo: TipoCelda,
  valor: ValorCelda,
): { valor: string | number | null; formato?: string } {
  if (valor === null || valor === '') return { valor: null };
  switch (tipo) {
    case 'moneda':
      return { valor: Number(valor), formato: FORMATO_MONEDA_EXCEL };
    case 'entero':
      return { valor: Number(valor), formato: FORMATO_ENTERO_EXCEL };
    default:
      return { valor: celdaTexto(tipo, valor) };
  }
}

/** Columnas numéricas: se alinean a la derecha en el PDF. */
export function esNumerica(tipo: TipoCelda): boolean {
  return tipo === 'moneda' || tipo === 'entero';
}

/** Descarga un archivo generado en el navegador. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.rel = 'noopener';
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  // Se libera después, para que el navegador alcance a iniciar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Las fuentes estándar del PDF (WinAnsi) no tienen el espacio fino (U+202F) que Intl usa en
 * "p. m."; los espacios duros se cambian por espacios normales.
 */
export function textoPdf(texto: string): string {
  return texto.replace(/[\u00A0\u202F]/g, ' ');
}
