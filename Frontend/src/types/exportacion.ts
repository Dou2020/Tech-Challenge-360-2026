/** Exportación de reportes a Excel y PDF (se genera en el navegador con los datos que ya dio la API). */

export type FormatoExportacion = 'excel' | 'pdf';

/** Cómo se presenta una celda: los montos llegan como string decimal y no se recalculan. */
export type TipoCelda = 'texto' | 'entero' | 'moneda' | 'dia' | 'fecha';

export type ValorCelda = string | number | null;

export interface ColumnaExportable<T> {
  titulo: string;
  tipo: TipoCelda;
  valor: (fila: T) => ValorCelda;
  /** Ancho de la columna en Excel (caracteres). */
  ancho?: number;
}

export interface RangoExportacion {
  desde?: string | undefined;
  hasta?: string | undefined;
}

export interface DefinicionExportacion<T> {
  /** Base del nombre de archivo, ya en minúsculas y sin espacios (`ventas-por-dia`). */
  reporte: string;
  titulo: string;
  rango: RangoExportacion;
  /** Línea extra del encabezado, p. ej. "Agrupación: semana". */
  extra?: string | undefined;
  columnas: ColumnaExportable<T>[];
  filas: T[];
}
